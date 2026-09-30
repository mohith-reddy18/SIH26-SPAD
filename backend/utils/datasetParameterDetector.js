const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Canonical SPAD Parameter Definitions
 */
const CANONICAL_PARAM_DEFINITIONS = Object.freeze({
  rdson: { key: 'rdson', name: 'On-Resistance (RDS(on))', shortName: 'RDS(on)', unit: 'Ω' },
  iddq: { key: 'iddq', name: 'Standby Current (Iddq)', shortName: 'Iddq', unit: 'mA' },
  leakage: { key: 'leakage', name: 'Leakage Current (I_leak)', shortName: 'I_leak', unit: 'µA' },
  delay: { key: 'delay', name: 'Propagation Delay (t_pd)', shortName: 't_pd', unit: 'ns' },
  v_th: { key: 'v_th', name: 'Threshold Voltage (V_th)', shortName: 'V_th', unit: 'V' },
  temp: { key: 'temp', name: 'Chamber Temperature (T_j)', shortName: 'T_j', unit: '°C' },
  vgs: { key: 'vgs', name: 'Gate-Source Voltage (V_GS)', shortName: 'V_GS', unit: 'V' },
  vds: { key: 'vds', name: 'Drain-Source Voltage (V_DS)', shortName: 'V_DS', unit: 'V' },
  freq: { key: 'freq', name: 'Switching Frequency (f_sw)', shortName: 'f_sw', unit: 'Hz' },
  dutyCycle: { key: 'dutyCycle', name: 'Duty Cycle', shortName: 'Duty', unit: '%' },
});

/**
 * Detects parameter keys from CSV header line.
 */
function detectFromCsvHeaders(headerLine) {
  if (!headerLine || typeof headerLine !== 'string') return [];
  const detected = new Set();
  const headers = headerLine
    .split(',')
    .map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  headers.forEach((h) => {
    if (h.includes('rds') || h === '0h' || h === '24h' || h === '0' || h === '24' || h.includes('r_ds') || h.includes('on_res')) {
      detected.add('rdson');
    }
    if (h.includes('iddq') || h.includes('standby_current')) {
      detected.add('iddq');
    }
    if (h.includes('leak') || h.includes('i_leak') || h.includes('ileak')) {
      detected.add('leakage');
    }
    if (h.includes('delay') || h.includes('t_pd') || h.includes('tpd') || h.includes('propagation')) {
      detected.add('delay');
    }
    if (h.includes('vth') || h.includes('v_th') || h.includes('threshold')) {
      detected.add('v_th');
    }
    if (h.includes('temp') || h === 't_j' || h === 'tj' || h.includes('temperature')) {
      detected.add('temp');
    }
    if (h === 'vgs' || h === 'v_gs' || h.startsWith('vgs') || h.includes('gate_voltage') || h.includes('v_gate')) {
      detected.add('vgs');
    }
    if (h === 'vds' || h === 'v_ds' || h.startsWith('vds') || h.includes('drain_voltage') || h.includes('v_drain')) {
      detected.add('vds');
    }
    if (h.includes('freq') || h === 'f_sw' || h === 'fsw' || h.includes('frequency')) {
      detected.add('freq');
    }
    if (h.includes('duty') || h.includes('dutycycle') || h.includes('duty_cycle')) {
      detected.add('dutyCycle');
    }
  });

  return Array.from(detected);
}

/**
 * Detects parameter keys from JSON telemetry content or object.
 */
function detectFromJson(jsonInput) {
  if (!jsonInput) return [];
  const detected = new Set();
  try {
    const data = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
    const sample = Array.isArray(data) ? data[0] : (data.records?.[0] || data.results?.[0] || data);

    if (sample && typeof sample === 'object') {
      if (sample.RDS0 !== undefined || sample.RDS33 !== undefined || sample.rdson !== undefined || sample.RDS !== undefined || sample['0h'] !== undefined) {
        detected.add('rdson');
      }
      if (sample.iddq !== undefined || sample.Iddq_0h !== undefined || sample.Iddq !== undefined) {
        detected.add('iddq');
      }
      if (sample.leakage !== undefined || sample.leakage_0h !== undefined || sample.I_leak !== undefined) {
        detected.add('leakage');
      }
      if (sample.delay !== undefined || sample.t_pd !== undefined || sample.propDelay !== undefined) {
        detected.add('delay');
      }
      if (sample.v_th !== undefined || sample.vth !== undefined || sample.V_th !== undefined) {
        detected.add('v_th');
      }
      if (sample.temp !== undefined || sample.temperature !== undefined || sample.T_j !== undefined) {
        detected.add('temp');
      }
      if (sample.vgs !== undefined || sample.V_GS !== undefined) {
        detected.add('vgs');
      }
      if (sample.vds !== undefined || sample.V_DS !== undefined) {
        detected.add('vds');
      }
      if (sample.freq !== undefined || sample.f_sw !== undefined) {
        detected.add('freq');
      }
      if (sample.dutyCycle !== undefined || sample.duty !== undefined) {
        detected.add('dutyCycle');
      }

      if (sample.measurements && typeof sample.measurements === 'object') {
        Object.keys(sample.measurements).forEach((k) => {
          const lk = k.toLowerCase();
          if (CANONICAL_PARAM_DEFINITIONS[lk]) {
            detected.add(lk);
          } else if (lk.includes('rds')) {
            detected.add('rdson');
          } else if (lk.includes('leak')) {
            detected.add('leakage');
          } else if (lk.includes('delay') || lk.includes('t_pd')) {
            detected.add('delay');
          } else if (lk.includes('v_th') || lk.includes('vth')) {
            detected.add('v_th');
          } else if (CANONICAL_PARAM_DEFINITIONS[k]) {
            detected.add(k);
          }
        });
      }
    }
  } catch {
    // Malformed JSON handled safely
  }

  return Array.from(detected);
}

/**
 * Reads the first line of a CSV file from disk without buffering the file into memory.
 */
function readFirstLineFromFile(filePath, maxBytes = 65536) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
    if (bytesRead <= 0) return '';
    const text = buffer.toString('utf-8', 0, bytesRead);
    return text.split(/\r?\n/)[0] || '';
  } catch {
    return '';
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

/**
 * Reads a sample chunk of a JSON file from disk without buffering the whole file.
 */
function readJsonSampleFromFile(filePath, maxBytes = 65536) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
    if (bytesRead <= 0) return '';
    return buffer.toString('utf-8', 0, bytesRead);
  } catch {
    return '';
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

/**
 * Inspects a ZIP archive on disk by reading only headers and extracting metadata
 * from contained CSV/JSON files, without reading the entire multi-GB archive into RAM.
 */
function detectFromZipFilePath(filePath) {
  let fd;
  const detected = new Set();
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    if (fileSize < 30) return [];

    fd = fs.openSync(filePath, 'r');
    let offset = 0;
    const headerBuf = Buffer.alloc(30);

    let entryCount = 0;
    while (offset + 30 <= fileSize && entryCount < 500) {
      entryCount++;
      const readBytes = fs.readSync(fd, headerBuf, 0, 30, offset);
      if (readBytes < 30) break;

      // Check local file header signature 0x04034b50
      if (headerBuf.readUInt32LE(0) !== 0x04034b50) {
        break;
      }

      const method = headerBuf.readUInt16LE(8);
      const compSize = headerBuf.readUInt32LE(18);
      const fnLen = headerBuf.readUInt16LE(26);
      const extraLen = headerBuf.readUInt16LE(28);

      if (fnLen > 0) {
        const nameBuf = Buffer.alloc(fnLen);
        fs.readSync(fd, nameBuf, 0, fnLen, offset + 30);
        const fileName = nameBuf.toString('utf-8');
        const lowerName = fileName.toLowerCase();
        const dataStart = offset + 30 + fnLen + extraLen;

        if (lowerName.endsWith('.csv') && compSize > 0 && dataStart + compSize <= fileSize) {
          const sampleSize = Math.min(compSize, 65536);
          const dataChunk = Buffer.alloc(sampleSize);
          fs.readSync(fd, dataChunk, 0, sampleSize, dataStart);

          let text = '';
          try {
            if (method === 0) {
              text = dataChunk.toString('utf-8');
            } else if (method === 8) {
              const decompressed = zlib.inflateRawSync(dataChunk);
              text = decompressed.toString('utf-8', 0, Math.min(decompressed.length, 4096));
            }
          } catch {
            // Decompression error handled safely
          }

          if (text) {
            const firstLine = text.split(/\r?\n/)[0];
            const csvDetected = detectFromCsvHeaders(firstLine);
            csvDetected.forEach((k) => detected.add(k));
          }
        } else if (lowerName.endsWith('.json') && compSize > 0 && dataStart + compSize <= fileSize) {
          const sampleSize = Math.min(compSize, 65536);
          const dataChunk = Buffer.alloc(sampleSize);
          fs.readSync(fd, dataChunk, 0, sampleSize, dataStart);

          let text = '';
          try {
            if (method === 0) {
              text = dataChunk.toString('utf-8');
            } else if (method === 8) {
              const decompressed = zlib.inflateRawSync(dataChunk);
              text = decompressed.toString('utf-8');
            }
          } catch {}

          if (text) {
            const jsonDetected = detectFromJson(text);
            jsonDetected.forEach((k) => detected.add(k));
          }
        }
      }

      offset += 30 + fnLen + extraLen + compSize;
    }
  } catch {
    // Disk traversal error handled safely
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }

  return Array.from(detected);
}

/**
 * Extracts and inspects files inside a ZIP archive buffer without writing to disk.
 * Used for in-memory buffers in unit test mocks.
 */
function detectFromZipBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 30) return [];
  const detected = new Set();

  try {
    let offset = 0;
    while (offset + 30 <= buffer.length) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) {
        break;
      }

      const method = buffer.readUInt16LE(offset + 8);
      const compSize = buffer.readUInt32LE(offset + 18);
      const fnLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const fileName = buffer.toString('utf-8', offset + 30, offset + 30 + fnLen);
      const dataStart = offset + 30 + fnLen + extraLen;

      if (fileName.toLowerCase().endsWith('.csv') && compSize > 0 && dataStart + compSize <= buffer.length) {
        let text = '';
        try {
          if (method === 0) {
            text = buffer.toString('utf-8', dataStart, dataStart + Math.min(compSize, 4096));
          } else if (method === 8) {
            const decompressed = zlib.inflateRawSync(buffer.slice(dataStart, dataStart + compSize));
            text = decompressed.toString('utf-8', 0, Math.min(decompressed.length, 4096));
          }
        } catch {}

        if (text) {
          const firstLine = text.split(/\r?\n/)[0];
          const csvDetected = detectFromCsvHeaders(firstLine);
          csvDetected.forEach((k) => detected.add(k));
        }
      } else if (fileName.toLowerCase().endsWith('.json') && compSize > 0 && dataStart + compSize <= buffer.length) {
        let text = '';
        try {
          if (method === 0) {
            text = buffer.toString('utf-8', dataStart, dataStart + compSize);
          } else if (method === 8) {
            const decompressed = zlib.inflateRawSync(buffer.slice(dataStart, dataStart + compSize));
            text = decompressed.toString('utf-8');
          }
        } catch {}

        if (text) {
          const jsonDetected = detectFromJson(text);
          jsonDetected.forEach((k) => detected.add(k));
        }
      }

      offset = dataStart + compSize;
    }
  } catch {}

  return Array.from(detected);
}

/**
 * Main detection function: inspects file from disk stream/headers, memory buffer, or text content.
 * Does NOT buffer multi-GB files in memory and does NOT fabricate parameters.
 *
 * @param {Object} input
 * @param {Buffer|Object} [input.file] - Multer file object or Buffer
 * @param {string} [input.filePath] - Direct filesystem path to uploaded temporary file
 * @param {string} [input.dataset] - Text content or dataset string
 * @param {string} [input.datasetContent] - Text content
 * @param {string} [input.fileName] - Name of uploaded file
 * @returns {Array<string>} Array of detected canonical parameter keys with formatStatus & message metadata
 */
function detectParametersFromDataset({ file, filePath, dataset, datasetContent, fileName = '' }) {
  const rawContent = datasetContent || dataset;
  const resolvedPath = filePath || file?.path;
  const name = (fileName || file?.originalname || file?.filename || (resolvedPath ? path.basename(resolvedPath) : '')).toLowerCase();

  // Standalone .mat binary files do not support direct text/table parameter inspection
  if (name.endsWith('.mat')) {
    const emptyResult = [];
    emptyResult.detectedKeys = [];
    emptyResult.formatStatus = 'UNSUPPORTED_BINARY_FORMAT';
    emptyResult.message = 'Direct telemetry parameter detection is not supported for standalone MATLAB .MAT binary files. Parameter extraction is supported for .ZIP archives containing telemetry tables (CSV/JSON) or standalone CSV/JSON files.';
    return emptyResult;
  }

  const detected = new Set();

  // 1. If file is stored on disk (streaming upload), inspect headers directly from disk without loading multi-GB into RAM
  if (resolvedPath && fs.existsSync(resolvedPath)) {
    if (name.endsWith('.zip')) {
      detectFromZipFilePath(resolvedPath).forEach((k) => detected.add(k));
    } else if (name.endsWith('.json')) {
      const sample = readJsonSampleFromFile(resolvedPath);
      detectFromJson(sample).forEach((k) => detected.add(k));
    } else if (name.endsWith('.csv') || name.endsWith('.txt') || !name.includes('.')) {
      const firstLine = readFirstLineFromFile(resolvedPath);
      detectFromCsvHeaders(firstLine).forEach((k) => detected.add(k));
    }
  }

  // 2. Text parsing if string content available
  if (detected.size === 0 && typeof rawContent === 'string' && rawContent.trim().length > 0) {
    const trimmed = rawContent.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      detectFromJson(trimmed).forEach((k) => detected.add(k));
    } else {
      const firstLine = trimmed.split(/\r?\n/)[0];
      detectFromCsvHeaders(firstLine).forEach((k) => detected.add(k));
    }
  }

  // 3. Buffer parsing if file uploaded as in-memory buffer (e.g. in test suites)
  const buffer = Buffer.isBuffer(file)
    ? file
    : (file?.buffer && Buffer.isBuffer(file.buffer))
    ? file.buffer
    : null;

  if (detected.size === 0 && buffer) {
    if (name.endsWith('.zip') || (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50)) {
      detectFromZipBuffer(buffer).forEach((k) => detected.add(k));
    } else if (name.endsWith('.json') || buffer[0] === 0x7b || buffer[0] === 0x5b) {
      detectFromJson(buffer.toString('utf-8')).forEach((k) => detected.add(k));
    } else if (name.endsWith('.csv') || name.endsWith('.txt') || !name.includes('.')) {
      const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 4096));
      const firstLine = text.split(/\r?\n/)[0];
      detectFromCsvHeaders(firstLine).forEach((k) => detected.add(k));
    }
  }

  const result = Array.from(detected);
  result.detectedKeys = Array.from(detected);
  result.formatStatus = result.length > 0 ? 'DETECTED' : 'NO_PARAMETERS_FOUND';
  result.message = result.length > 0
    ? `Successfully detected ${result.length} parameter(s) from dataset.`
    : 'No recognized telemetry parameter columns found in the uploaded dataset.';

  return result;
}

module.exports = {
  CANONICAL_PARAM_DEFINITIONS,
  detectFromCsvHeaders,
  detectFromJson,
  detectFromZipFilePath,
  detectFromZipBuffer,
  detectParametersFromDataset,
};


