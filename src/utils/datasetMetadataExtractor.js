/**
 * Browser-safe streaming metadata extractor for screening datasets (.ZIP, .CSV, .JSON, .MAT).
 * Inspects header bytes locally in the browser using slicing without loading multi-GB datasets into RAM
 * or uploading them to detect parameters.
 */

/**
 * Decompresses raw deflate bytes using standard Web Stream API.
 */
async function decompressDeflateRaw(compressedUint8Array) {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressedUint8Array);
    writer.close();
    const response = new Response(ds.readable);
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Inspects ZIP local file headers from the leading chunk of a Blob/File.
 */
async function inspectZipLocalHeaders(file) {
  // Read first 2MB slice for local headers
  const sliceSize = Math.min(file.size, 2 * 1024 * 1024);
  const buffer = await file.slice(0, sliceSize).arrayBuffer();
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');

  let offset = 0;
  let entryCount = 0;

  while (offset + 30 <= buffer.byteLength && entryCount < 200) {
    entryCount++;
    // Check signature 0x04034b50
    if (view.getUint32(offset, true) !== 0x04034b50) {
      break;
    }

    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const fnLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    if (offset + 30 + fnLen <= buffer.byteLength) {
      const fileName = decoder.decode(new Uint8Array(buffer, offset + 30, fnLen));
      const lowerName = fileName.toLowerCase();
      const dataStart = offset + 30 + fnLen + extraLen;

      if ((lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) && compSize > 0) {
        let text = '';
        if (dataStart + compSize <= buffer.byteLength) {
          const chunk = new Uint8Array(buffer, dataStart, compSize);
          if (method === 0) {
            text = decoder.decode(chunk);
          } else if (method === 8) {
            text = await decompressDeflateRaw(chunk);
          }
        } else {
          // Slice exact entry from file without reading the whole file
          const entryBlob = file.slice(dataStart, dataStart + compSize);
          const entryBuf = await entryBlob.arrayBuffer();
          if (method === 0) {
            text = decoder.decode(new Uint8Array(entryBuf));
          } else if (method === 8) {
            text = await decompressDeflateRaw(new Uint8Array(entryBuf));
          }
        }

        if (text) {
          const firstLine = text.split(/\r?\n/)[0];
          return {
            type: 'ZIP_CSV',
            fileName: file.name,
            containedFileName: fileName,
            sampleText: firstLine,
          };
        }
      } else if (lowerName.endsWith('.json') && compSize > 0) {
        let text = '';
        if (dataStart + compSize <= buffer.byteLength) {
          const chunk = new Uint8Array(buffer, dataStart, compSize);
          if (method === 0) text = decoder.decode(chunk);
          else if (method === 8) text = await decompressDeflateRaw(chunk);
        } else {
          const entryBlob = file.slice(dataStart, dataStart + compSize);
          const entryBuf = await entryBlob.arrayBuffer();
          if (method === 0) text = decoder.decode(new Uint8Array(entryBuf));
          else if (method === 8) text = await decompressDeflateRaw(new Uint8Array(entryBuf));
        }

        if (text) {
          return {
            type: 'ZIP_JSON',
            fileName: file.name,
            containedFileName: fileName,
            sampleText: text.slice(0, 4096),
          };
        }
      }
    }

    if (compSize === 0) {
      break;
    }
    offset += 30 + fnLen + extraLen + compSize;
  }

  return null;
}

/**
 * Fallback: Inspects Central Directory at the end of the ZIP file for multi-GB archives
 * where the CSV/JSON may be positioned further in the archive.
 */
async function inspectZipCentralDirectory(file) {
  if (file.size < 22) return null;

  // Read last 65 KB to find End of Central Directory (EOCD)
  const tailSize = Math.min(file.size, 65536);
  const tailBuffer = await file.slice(file.size - tailSize, file.size).arrayBuffer();
  const tailView = new DataView(tailBuffer);
  const decoder = new TextDecoder('utf-8');

  let eocdOffsetInTail = -1;
  for (let i = tailBuffer.byteLength - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === 0x06054b50) {
      eocdOffsetInTail = i;
      break;
    }
  }

  if (eocdOffsetInTail === -1) return null;

  const cdSize = tailView.getUint32(eocdOffsetInTail + 12, true);
  const cdOffset = tailView.getUint32(eocdOffsetInTail + 16, true);

  if (cdOffset >= file.size || cdSize === 0) return null;

  // Read Central Directory headers
  const cdBuffer = await file.slice(cdOffset, Math.min(file.size, cdOffset + cdSize)).arrayBuffer();
  const cdView = new DataView(cdBuffer);

  let offset = 0;
  let count = 0;

  while (offset + 46 <= cdBuffer.byteLength && count < 500) {
    count++;
    if (cdView.getUint32(offset, true) !== 0x02014b50) break;

    const method = cdView.getUint16(offset + 10, true);
    const compSize = cdView.getUint32(offset + 20, true);
    const fnLen = cdView.getUint16(offset + 28, true);
    const extraLen = cdView.getUint16(offset + 30, true);
    const commentLen = cdView.getUint16(offset + 32, true);
    const localHeaderOffset = cdView.getUint32(offset + 42, true);

    if (offset + 46 + fnLen <= cdBuffer.byteLength) {
      const fileName = decoder.decode(new Uint8Array(cdBuffer, offset + 46, fnLen));
      const lowerName = fileName.toLowerCase();

      if ((lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) && compSize > 0) {
        // Read local header + data for this specific CSV entry
        const localHeadBuf = await file.slice(localHeaderOffset, localHeaderOffset + 30).arrayBuffer();
        if (localHeadBuf.byteLength >= 30) {
          const lView = new DataView(localHeadBuf);
          const lFnLen = lView.getUint16(26, true);
          const lExtraLen = lView.getUint16(28, true);
          const dataStart = localHeaderOffset + 30 + lFnLen + lExtraLen;

          const dataBuf = await file.slice(dataStart, dataStart + compSize).arrayBuffer();
          let text = '';
          if (method === 0) {
            text = decoder.decode(new Uint8Array(dataBuf));
          } else if (method === 8) {
            text = await decompressDeflateRaw(new Uint8Array(dataBuf));
          }

          if (text) {
            const firstLine = text.split(/\r?\n/)[0];
            return {
              type: 'ZIP_CSV',
              fileName: file.name,
              containedFileName: fileName,
              sampleText: firstLine,
            };
          }
        }
      } else if (lowerName.endsWith('.json') && compSize > 0) {
        const localHeadBuf = await file.slice(localHeaderOffset, localHeaderOffset + 30).arrayBuffer();
        if (localHeadBuf.byteLength >= 30) {
          const lView = new DataView(localHeadBuf);
          const lFnLen = lView.getUint16(26, true);
          const lExtraLen = lView.getUint16(28, true);
          const dataStart = localHeaderOffset + 30 + lFnLen + lExtraLen;

          const dataBuf = await file.slice(dataStart, dataStart + compSize).arrayBuffer();
          let text = '';
          if (method === 0) {
            text = decoder.decode(new Uint8Array(dataBuf));
          } else if (method === 8) {
            text = await decompressDeflateRaw(new Uint8Array(dataBuf));
          }

          if (text) {
            return {
              type: 'ZIP_JSON',
              fileName: file.name,
              containedFileName: fileName,
              sampleText: text.slice(0, 4096),
            };
          }
        }
      }
    }

    offset += 46 + fnLen + extraLen + commentLen;
  }

  return null;
}

/**
 * Extracts metadata sample from any supported file format (.ZIP, .CSV, .JSON, .MAT)
 * without loading the entire multi-GB file into RAM.
 *
 * @param {File|Blob} file - Browser File / Blob object
 * @returns {Promise<{ sampleText: string|null, fileName: string, fileType: string, isMat: boolean, containedFileName?: string }>}
 */
export async function extractDatasetMetadata(file) {
  if (!file) return { sampleText: null, fileName: '', fileType: '', isMat: false };

  const fileName = file.name || '';
  const lowerName = fileName.toLowerCase();

  // 1. Standalone .MAT matrix file
  if (lowerName.endsWith('.mat')) {
    return {
      sampleText: null,
      fileName,
      fileType: 'MAT',
      isMat: true,
    };
  }

  // 2. Standalone .CSV or .TXT
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
    try {
      const slice = file.slice(0, 65536);
      const text = await slice.text();
      const firstLine = text.split(/\r?\n/)[0] || '';
      return {
        sampleText: firstLine,
        fileName,
        fileType: 'CSV',
        isMat: false,
      };
    } catch {
      return { sampleText: null, fileName, fileType: 'CSV', isMat: false };
    }
  }

  // 3. Standalone .JSON
  if (lowerName.endsWith('.json')) {
    try {
      const slice = file.slice(0, 65536);
      const text = await slice.text();
      return {
        sampleText: text,
        fileName,
        fileType: 'JSON',
        isMat: false,
      };
    } catch {
      return { sampleText: null, fileName, fileType: 'JSON', isMat: false };
    }
  }

  // 4. .ZIP Archive
  if (lowerName.endsWith('.zip')) {
    try {
      let zipMeta = await inspectZipLocalHeaders(file);
      if (!zipMeta) {
        zipMeta = await inspectZipCentralDirectory(file);
      }

      if (zipMeta && zipMeta.sampleText) {
        return {
          sampleText: zipMeta.sampleText,
          fileName,
          containedFileName: zipMeta.containedFileName,
          fileType: zipMeta.type === 'ZIP_JSON' ? 'ZIP_JSON' : 'ZIP_CSV',
          isMat: false,
        };
      }

      return {
        sampleText: null,
        fileName,
        fileType: 'ZIP',
        isMat: false,
      };
    } catch {
      return { sampleText: null, fileName, fileType: 'ZIP', isMat: false };
    }
  }

  return { sampleText: null, fileName, fileType: 'UNKNOWN', isMat: false };
}
