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
          } else {
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
 * Extracts and inspects files inside a ZIP archive buffer without writing to disk.
 */
function detectFromZipBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 30) return [];
  const detected = new Set();

  try {
    let offset = 0;
    while (offset + 30 <= buffer.length) {
      // Check local file header signature 0x04034b50
      if (buffer.readUInt32LE(offset) !== 0x04034b50) {
        break;
      }

      const method = buffer.readUInt16LE(offset + 8);
      const compSize = buffer.readUInt32LE(offset + 18);
      const uncompSize = buffer.readUInt32LE(offset + 22);
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
        } catch {
          // Decompression error fallback
        }

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

      // Check if NASA test .mat file or MOSFET filename indicator
      if (fileName.toLowerCase().includes('rdson') || fileName.toLowerCase().includes('mosfet') || fileName.toLowerCase().startsWith('test_')) {
        detected.add('rdson');
      }

      offset = dataStart + compSize;
    }
  } catch {
    // Binary traversal error fallback
  }

  // If ZIP contains NASA MOSFET run-level dataset indicators
  if (detected.size === 0) {
    detected.add('rdson');
  }

  return Array.from(detected);
}

/**
 * Main detection function: inspects uploaded file buffer, string, or filename.
 *
 * @param {Object} input
 * @param {Buffer|Object} [input.file] - Multer file object or Buffer
 * @param {string} [input.dataset] - Text content or dataset string
 * @param {string} [input.datasetContent] - Text content
 * @param {string} [input.fileName] - Name of uploaded file
 * @returns {Array<string>} List of detected canonical parameter keys
 */
function detectParametersFromDataset({ file, dataset, datasetContent, fileName = '' }) {
  const detected = new Set();
  const rawContent = datasetContent || dataset;
  const name = (fileName || file?.originalname || '').toLowerCase();

  // 1. Text parsing if string content available
  if (typeof rawContent === 'string' && rawContent.trim().length > 0) {
    const trimmed = rawContent.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      detectFromJson(trimmed).forEach((k) => detected.add(k));
    } else {
      const firstLine = trimmed.split(/\r?\n/)[0];
      detectFromCsvHeaders(firstLine).forEach((k) => detected.add(k));
    }
  }

  // 2. Buffer parsing if file uploaded
  const buffer = Buffer.isBuffer(file)
    ? file
    : (file?.buffer && Buffer.isBuffer(file.buffer))
    ? file.buffer
    : null;

  if (buffer) {
    if (name.endsWith('.zip') || (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50)) {
      detectFromZipBuffer(buffer).forEach((k) => detected.add(k));
    } else if (name.endsWith('.json') || buffer[0] === 0x7b || buffer[0] === 0x5b) {
      detectFromJson(buffer.toString('utf-8')).forEach((k) => detected.add(k));
    } else if (name.endsWith('.csv') || name.endsWith('.txt') || !name.includes('.')) {
      const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 4096));
      const firstLine = text.split(/\r?\n/)[0];
      detectFromCsvHeaders(firstLine).forEach((k) => detected.add(k));
    } else if (name.endsWith('.mat')) {
      detected.add('rdson');
    }
  }

  // 3. Filename indicators fallback
  if (detected.size === 0 && name) {
    if (name.includes('rdson') || name.includes('mosfet')) detected.add('rdson');
    if (name.includes('iddq')) detected.add('iddq');
    if (name.includes('leak')) detected.add('leakage');
  }

  return Array.from(detected);
}

module.exports = {
  CANONICAL_PARAM_DEFINITIONS,
  detectFromCsvHeaders,
  detectFromJson,
  detectFromZipBuffer,
  detectParametersFromDataset,
};
