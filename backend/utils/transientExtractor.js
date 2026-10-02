const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Parses transient evidence CSV text and aggregates pulse-level metrics per Test_ID.
 *
 * @param {string} csvText - Content of transient_evidence.csv
 * @param {Object} [engineeringLimits] - Official engineering specification limits
 * @returns {Map<string, Object>} Map of componentId to Module C evaluation object
 */
function parseTransientCsvContent(csvText, engineeringLimits = {}) {
  const componentMap = new Map();
  try {
    if (!csvText || typeof csvText !== 'string') return componentMap;

    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return componentMap;

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const compIdIdx = headers.findIndex((h) => /^(test_id|componentid|component_id|id|sample_id)$/i.test(h));
    const runIdx = headers.findIndex((h) => /^(run|run_id|transient_id|transient|pulse)$/i.test(h));
    const timeIdx = headers.findIndex((h) => /^(time_us|time|timeus|timestamp_us|t_us)$/i.test(h));
    const rdsIdx = headers.findIndex((h) => /^(rds_ohm|rdson|rds|r_ds|maxrdsinstantaneousohm)$/i.test(h));
    const vdsIdx = headers.findIndex((h) => /^(vds|v_ds)$/i.test(h));
    const idIdx = headers.findIndex((h) => /^(id|i_d|current)$/i.test(h));

    const rdsonLimit = typeof engineeringLimits?.rdson === 'object'
      ? (engineeringLimits.rdson.limitValue ?? engineeringLimits.rdson.upper ?? null)
      : (typeof engineeringLimits?.rdson === 'number' ? engineeringLimits.rdson : null);

    const stats = new Map();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length === 0 || !cols[0]) continue;

      const rawCompId = compIdIdx !== -1 ? cols[compIdIdx] : cols[0];
      if (!rawCompId) continue;

      const compId = rawCompId.startsWith('TEST-') ? rawCompId : (isNaN(Number(rawCompId)) ? rawCompId : `TEST-${String(rawCompId).padStart(2, '0')}`);
      const runVal = runIdx !== -1 ? cols[runIdx] : `Run 1`;
      const timeVal = timeIdx !== -1 ? parseFloat(cols[timeIdx]) : null;

      let rdsVal = rdsIdx !== -1 ? parseFloat(cols[rdsIdx]) : NaN;
      if (isNaN(rdsVal) && vdsIdx !== -1 && idIdx !== -1) {
        const vds = parseFloat(cols[vdsIdx]);
        const id = parseFloat(cols[idIdx]);
        if (!isNaN(vds) && !isNaN(id) && id > 0) {
          rdsVal = vds / id;
        }
      }

      if (isNaN(rdsVal)) continue;

      let compStat = stats.get(compId);
      if (!compStat) {
        compStat = {
          maxRDSInstantaneousOhm: rdsVal,
          peakRun: runVal,
          peakTimeUs: !isNaN(timeVal) ? timeVal : null,
          exceedanceCount: 0,
          totalPoints: 0,
        };
        stats.set(compId, compStat);
      }

      compStat.totalPoints++;
      if (rdsVal > compStat.maxRDSInstantaneousOhm) {
        compStat.maxRDSInstantaneousOhm = rdsVal;
        compStat.peakRun = runVal;
        if (!isNaN(timeVal)) compStat.peakTimeUs = timeVal;
      }

      if (typeof rdsonLimit === 'number' && rdsonLimit > 0 && rdsVal > rdsonLimit) {
        compStat.exceedanceCount++;
      }
    }

    for (const [compId, s] of stats.entries()) {
      const isExceeded = s.exceedanceCount > 0 || (typeof rdsonLimit === 'number' && rdsonLimit > 0 && s.maxRDSInstantaneousOhm > rdsonLimit);
      const flag = isExceeded ? 'FLAGGED' : 'NOT FLAGGED';

      componentMap.set(compId, {
        status: 'ANALYZED',
        method: 'TRANSIENT_PULSE_EXTRACTION',
        parameters: {
          rdson: {
            maxRDSInstantaneousOhm: Number(s.maxRDSInstantaneousOhm.toFixed(6)),
            limitExceedanceCount: s.exceedanceCount,
            limitExceedanceFlag: flag,
            evidenceTransientId: s.peakRun,
            evidenceTimeUs: s.peakTimeUs,
            aiFlag: flag,
            totalTransientPoints: s.totalPoints,
          },
        },
      });
    }
  } catch (err) {
    console.warn('[SPAD transientExtractor] CSV parse safe warning:', err.message);
  }

  return componentMap;
}

/**
 * Extracts transient evidence from a file path on disk (ZIP archive or direct CSV) or raw text.
 * Guaranteed never to throw or crash the caller.
 *
 * @param {string} filePathOrContent - Path to file on disk or raw text
 * @param {Object} [engineeringLimits] - Engineering limits map
 * @returns {Map<string, Object>} Map of componentId to Module C evaluation object
 */
function extractTransientEvidenceFromDisk(filePathOrContent, engineeringLimits = {}) {
  try {
    if (!filePathOrContent) return new Map();

    // 1. If it's direct CSV text content (contains newlines)
    if (typeof filePathOrContent === 'string' && (filePathOrContent.includes('\n') || filePathOrContent.includes('\r'))) {
      return parseTransientCsvContent(filePathOrContent, engineeringLimits);
    }

    // 2. If it's a file path on disk (must be reasonable length string to prevent ENAMETOOLONG)
    if (typeof filePathOrContent === 'string' && filePathOrContent.length > 0 && filePathOrContent.length < 4096) {
      let fileExists = false;
      try {
        fileExists = fs.existsSync(filePathOrContent);
      } catch {
        fileExists = false;
      }
      if (!fileExists) return new Map();

      const lowerName = filePathOrContent.toLowerCase();

      // Direct CSV file on disk
      if (lowerName.endsWith('.csv')) {
        try {
          const text = fs.readFileSync(filePathOrContent, 'utf-8');
          if (text.toLowerCase().includes('transient') || text.toLowerCase().includes('time_us') || text.toLowerCase().includes('rds_ohm')) {
            return parseTransientCsvContent(text, engineeringLimits);
          }
        } catch {
          return new Map();
        }
      }

      // ZIP Archive on disk
      if (lowerName.endsWith('.zip')) {
        let fd;
        try {
          const stats = fs.statSync(filePathOrContent);
          const fileSize = stats.size;
          if (fileSize < 30) return new Map();

          fd = fs.openSync(filePathOrContent, 'r');
          let offset = 0;
          const headerBuf = Buffer.alloc(30);
          let entryCount = 0;

          while (offset + 30 <= fileSize && entryCount < 100) {
            entryCount++;
            const readBytes = fs.readSync(fd, headerBuf, 0, 30, offset);
            if (readBytes < 30) break;

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
              const entryName = nameBuf.toString('utf-8').toLowerCase();
              const dataStart = offset + 30 + fnLen + extraLen;

              if ((entryName.includes('transient') || entryName.endsWith('_evidence.csv')) && compSize > 0 && dataStart + compSize <= fileSize) {
                const maxRead = Math.min(compSize, 20 * 1024 * 1024); // max 20MB chunk
                const dataChunk = Buffer.alloc(maxRead);
                fs.readSync(fd, dataChunk, 0, maxRead, dataStart);

                let text = '';
                if (method === 0) {
                  text = dataChunk.toString('utf-8');
                } else if (method === 8) {
                  try {
                    const decompressed = zlib.inflateRawSync(dataChunk);
                    text = decompressed.toString('utf-8');
                  } catch {
                    // Safe recovery
                  }
                }

                if (text) {
                  return parseTransientCsvContent(text, engineeringLimits);
                }
              }
            }

            offset += 30 + fnLen + extraLen + compSize;
          }
        } catch {
          return new Map();
        } finally {
          if (fd !== undefined) {
            try { fs.closeSync(fd); } catch {}
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SPAD transientExtractor] Safe extraction catch:', err.message);
  }

  return new Map();
}

module.exports = {
  parseTransientCsvContent,
  extractTransientEvidenceFromDisk,
};
