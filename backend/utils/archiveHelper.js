const fs = require('fs');
const path = require('path');
const os = require('os');

// Standard CRC32 Lookup Table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

/**
 * Streaming CRC32 calculation.
 */
function updateCrc32(crc, buffer) {
  let c = crc ^ (-1);
  for (let i = 0; i < buffer.length; i++) {
    c = crcTable[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ (-1)) >>> 0;
}

/**
 * Calculates CRC32 of a file on disk by streaming chunks (zero full-file RAM buffering).
 */
async function calculateFileCrc32(filePath) {
  let crc = 0;
  const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  for await (const chunk of readStream) {
    crc = updateCrc32(crc, chunk);
  }
  return crc;
}

/**
 * Creates a stream-safe uncompressed ZIP archive (Store method 0) containing one or more files from disk.
 * Suitable for multi-GB datasets with O(1) constant memory overhead.
 *
 * @param {Array<{ path: string, name: string }>} sourceFiles
 * @param {string} outputZipPath
 * @returns {Promise<string>} outputZipPath
 */
async function createStreamingZipFromDiskFiles(sourceFiles, outputZipPath) {
  const outStream = fs.createWriteStream(outputZipPath);
  const entries = [];
  let offset = 0;

  for (const src of sourceFiles) {
    const filePath = src.path;
    const entryName = src.name.replace(/\\/g, '/');
    const nameBuf = Buffer.from(entryName, 'utf-8');
    const stats = fs.statSync(filePath);
    const uncompressedSize = stats.size;

    const crc = await calculateFileCrc32(filePath);

    // Write Local File Header (30 bytes + name length)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);         // Version needed
    localHeader.writeUInt16LE(0x0800, 6);     // Flags (UTF-8)
    localHeader.writeUInt16LE(0, 8);          // Compression method: 0 (Store)
    localHeader.writeUInt16LE(0, 10);         // Mod time
    localHeader.writeUInt16LE(0, 12);         // Mod date
    localHeader.writeUInt32LE(crc, 14);       // CRC32
    localHeader.writeUInt32LE(uncompressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);   // File name length
    localHeader.writeUInt16LE(0, 28);                // Extra field length

    outStream.write(localHeader);
    outStream.write(nameBuf);

    const localHeaderOffset = offset;
    offset += 30 + nameBuf.length;

    // Stream file content directly to ZIP write stream
    const fileReadStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    for await (const chunk of fileReadStream) {
      outStream.write(chunk);
      offset += chunk.length;
    }

    entries.push({
      nameBuf,
      crc,
      size: uncompressedSize,
      offset: localHeaderOffset,
    });
  }

  // Write Central Directory Headers
  const centralDirStartOffset = offset;
  let centralDirSize = 0;

  for (const entry of entries) {
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Signature
    cdHeader.writeUInt16LE(20, 4);         // Version made by
    cdHeader.writeUInt16LE(20, 6);         // Version needed
    cdHeader.writeUInt16LE(0x0800, 8);     // Flags (UTF-8)
    cdHeader.writeUInt16LE(0, 10);         // Compression method: 0
    cdHeader.writeUInt16LE(0, 12);         // Mod time
    cdHeader.writeUInt16LE(0, 14);         // Mod date
    cdHeader.writeUInt32LE(entry.crc, 16); // CRC32
    cdHeader.writeUInt32LE(entry.size, 20);// Compressed size
    cdHeader.writeUInt32LE(entry.size, 24);// Uncompressed size
    cdHeader.writeUInt16LE(entry.nameBuf.length, 28); // File name len
    cdHeader.writeUInt16LE(0, 30);         // Extra field len
    cdHeader.writeUInt16LE(0, 32);         // File comment len
    cdHeader.writeUInt16LE(0, 34);         // Disk number start
    cdHeader.writeUInt16LE(0, 36);         // Internal attrs
    cdHeader.writeUInt32LE(0, 38);         // External attrs
    cdHeader.writeUInt32LE(entry.offset, 42); // Local header offset

    outStream.write(cdHeader);
    outStream.write(entry.nameBuf);
    centralDirSize += 46 + entry.nameBuf.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // Signature
  eocd.writeUInt16LE(0, 4);                // Disk number
  eocd.writeUInt16LE(0, 6);                // Start disk number
  eocd.writeUInt16LE(entries.length, 8);   // Entries on this disk
  eocd.writeUInt16LE(entries.length, 10);  // Total entries
  eocd.writeUInt32LE(centralDirSize, 12);  // Central dir size
  eocd.writeUInt32LE(centralDirStartOffset, 16); // Central dir offset
  eocd.writeUInt16LE(0, 20);               // Comment length

  outStream.write(eocd);
  await new Promise((resolve, reject) => {
    outStream.on('error', reject);
    outStream.end(resolve);
  });

  return outputZipPath;
}

/**
 * Normalizes any uploaded dataset (.ZIP, .CSV, .JSON, .MAT) into a stream-safe archive
 * on disk for the external Python ML service without exhausting memory.
 *
 * @param {Object} options
 * @param {string} options.filePath - Path to uploaded temporary file on disk
 * @param {string} options.originalName - Name of the uploaded file
 * @param {string} [options.mimeType] - MIME type of the uploaded file
 * @returns {Promise<{ archivePath: string, isGenerated: boolean, cleanup: () => void }>}
 */
async function normalizeDatasetForPythonService({ filePath, originalName, mimeType }) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Invalid temporary dataset file path for Python normalization');
  }

  const safeName = originalName || path.basename(filePath);
  const ext = path.extname(safeName).toLowerCase();

  // 1. If already a .ZIP archive, stream directly as-is
  if (ext === '.zip' || mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') {
    return {
      archivePath: filePath,
      isGenerated: false,
      cleanup: () => {},
    };
  }

  // 2. Prepare temporary output ZIP path on disk
  const tempDir = path.dirname(filePath) || os.tmpdir();
  const generatedZipPath = path.join(tempDir, `pkg-${Date.now()}-${Math.round(Math.random() * 1e6)}.zip`);
  const filesToInclude = [];

  if (ext === '.csv' || mimeType === 'text/csv' || mimeType?.includes('csv')) {
    filesToInclude.push({ path: filePath, name: safeName });
    // Also include canonical RunLevel alias if name is generic to assist Python NASA ML loaders
    if (!safeName.toLowerCase().includes('runlevel')) {
      filesToInclude.push({ path: filePath, name: 'MOSFET_199_200C_RDSon_RunLevel.csv' });
    }
  } else if (ext === '.json' || mimeType === 'application/json' || mimeType?.includes('json')) {
    filesToInclude.push({ path: filePath, name: safeName });
  } else if (ext === '.mat' || mimeType === 'application/x-matlab-data' || mimeType === 'application/octet-stream') {
    filesToInclude.push({ path: filePath, name: safeName });
  } else {
    // Default: pass original file safely
    filesToInclude.push({ path: filePath, name: safeName });
  }

  await createStreamingZipFromDiskFiles(filesToInclude, generatedZipPath);

  return {
    archivePath: generatedZipPath,
    isGenerated: true,
    cleanup: () => {
      if (generatedZipPath && fs.existsSync(generatedZipPath)) {
        try {
          fs.unlinkSync(generatedZipPath);
        } catch {
          // Ignored
        }
      }
    },
  };
}

module.exports = {
  createStreamingZipFromDiskFiles,
  normalizeDatasetForPythonService,
  calculateFileCrc32,
};
