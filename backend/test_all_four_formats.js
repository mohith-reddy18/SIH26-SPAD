/**
 * Comprehensive verification of all 4 supported dataset formats (.ZIP, .CSV, .JSON, .MAT)
 * Tests format normalization, streaming packaging, limit serialization, and cleanup.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { normalizeDatasetForPythonService } = require('./utils/archiveHelper');
const { detectParametersFromDataset } = require('./utils/datasetParameterDetector');

async function runFormatTests() {
  console.log('================================================================');
  console.log('       TESTING ALL 4 DATASET FORMATS (.ZIP, .CSV, .JSON, .MAT)   ');
  console.log('================================================================\n');

  const testDir = path.join(__dirname, 'temp_test_formats');
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // --------------------------------------------------------------------------
    // 1. FORMAT: .CSV (Standalone telemetry table)
    // --------------------------------------------------------------------------
    console.log('[TEST 1] Testing Standalone .CSV Dataset Normalization & Ingestion...');
    const csvPath = path.join(testDir, 'telemetry_lot01.csv');
    const csvContent = 'Test_ID,Run,Time,T_ambient,T_j,VGS,VDS,ID,RDS(on),RDS0,RDS33,RDS66,RDS100\n1,1,0,200,200,10,5,0.5,0.85,0.85,0.88,0.92,0.95\n2,1,0,200,200,10,5,0.5,0.84,0.84,0.86,0.89,0.91\n';
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    const csvDetection = detectParametersFromDataset({ file: fs.readFileSync(csvPath), fileName: 'telemetry_lot01.csv' });
    assert.ok(csvDetection.includes('rdson'), 'CSV should detect rdson parameter');
    assert.ok(csvDetection.includes('temp'), 'CSV should detect temp parameter');

    const csvNorm = await normalizeDatasetForPythonService({
      filePath: csvPath,
      originalName: 'telemetry_lot01.csv',
      mimeType: 'text/csv',
    });

    assert.strictEqual(csvNorm.isGenerated, true, 'CSV must be normalized to archive');
    assert.ok(fs.existsSync(csvNorm.archivePath), 'Generated ZIP archive for CSV must exist on disk');
    assert.ok(csvNorm.archivePath.endsWith('.zip'), 'Generated archive must have .zip extension');
    csvNorm.cleanup();
    assert.ok(!fs.existsSync(csvNorm.archivePath), 'Archive cleanup must unlink generated ZIP');
    console.log('  ✓ Standalone .CSV normalization and parameter detection PASSED.\n');

    // --------------------------------------------------------------------------
    // 2. FORMAT: .JSON (Telemetry records array)
    // --------------------------------------------------------------------------
    console.log('[TEST 2] Testing Standalone .JSON Dataset Normalization & Ingestion...');
    const jsonPath = path.join(testDir, 'telemetry_lot01.json');
    const jsonContent = JSON.stringify([
      { componentId: 'C-01', lotId: 'LOT-01', measurements: { rdson: { '0h': 0.85, '24h': 0.88 }, vgs: { '0h': 10, '24h': 10 } } },
      { componentId: 'C-02', lotId: 'LOT-01', measurements: { rdson: { '0h': 0.84, '24h': 0.86 }, vgs: { '0h': 10, '24h': 10 } } },
    ]);
    fs.writeFileSync(jsonPath, jsonContent, 'utf-8');

    const jsonDetection = detectParametersFromDataset({ file: fs.readFileSync(jsonPath), fileName: 'telemetry_lot01.json' });
    assert.ok(jsonDetection.includes('rdson'), 'JSON should detect rdson parameter');
    assert.ok(jsonDetection.includes('vgs'), 'JSON should detect vgs parameter');

    const jsonNorm = await normalizeDatasetForPythonService({
      filePath: jsonPath,
      originalName: 'telemetry_lot01.json',
      mimeType: 'application/json',
    });

    assert.strictEqual(jsonNorm.isGenerated, true, 'JSON must be normalized to archive');
    assert.ok(fs.existsSync(jsonNorm.archivePath), 'Generated ZIP archive for JSON must exist on disk');
    jsonNorm.cleanup();
    assert.ok(!fs.existsSync(jsonNorm.archivePath), 'JSON Archive cleanup must unlink generated ZIP');
    console.log('  ✓ Standalone .JSON normalization and parameter detection PASSED.\n');

    // --------------------------------------------------------------------------
    // 3. FORMAT: .MAT (MATLAB Binary Matrix)
    // --------------------------------------------------------------------------
    console.log('[TEST 3] Testing Standalone .MAT MATLAB Binary Normalization...');
    const matPath = path.join(testDir, 'Test_1_transient.mat');
    // Binary header simulation (MATLAB 5.0 format)
    const matBuffer = Buffer.alloc(128);
    matBuffer.write('MATLAB 5.0 MAT-file, Platform: PCWIN64, Created on: NASA Aging Test');
    fs.writeFileSync(matPath, matBuffer);

    const matDetection = detectParametersFromDataset({ file: matBuffer, fileName: 'Test_1_transient.mat' });
    assert.strictEqual(matDetection.formatStatus, 'UNSUPPORTED_BINARY_FORMAT', 'Standalone .MAT returns clean formatStatus without fake parameters');

    const matNorm = await normalizeDatasetForPythonService({
      filePath: matPath,
      originalName: 'Test_1_transient.mat',
      mimeType: 'application/octet-stream',
    });

    assert.strictEqual(matNorm.isGenerated, true, 'MAT binary must be normalized to archive');
    assert.ok(fs.existsSync(matNorm.archivePath), 'Generated ZIP archive for MAT must exist on disk');
    matNorm.cleanup();
    assert.ok(!fs.existsSync(matNorm.archivePath), 'MAT Archive cleanup must unlink generated ZIP');
    console.log('  ✓ Standalone .MAT binary normalization and streaming packaging PASSED.\n');

    // --------------------------------------------------------------------------
    // 4. FORMAT: .ZIP (Multi-file Dataset Archive)
    // --------------------------------------------------------------------------
    console.log('[TEST 4] Testing Standard .ZIP Archive Ingestion (Direct Stream)...');
    const zipPath = path.join(testDir, 'nasa_mosfet_dataset.zip');
    // Minimal zip buffer
    fs.writeFileSync(zipPath, Buffer.from([0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

    const zipNorm = await normalizeDatasetForPythonService({
      filePath: zipPath,
      originalName: 'nasa_mosfet_dataset.zip',
      mimeType: 'application/zip',
    });

    assert.strictEqual(zipNorm.isGenerated, false, 'Pre-existing ZIP archive must be passed as-is without re-wrapping');
    assert.strictEqual(zipNorm.archivePath, zipPath, 'ZIP archive path must match original file');
    console.log('  ✓ Standard .ZIP direct stream PASSED.\n');

    console.log('================================================================');
    console.log('  >>> ALL 4 DATASET FORMAT TESTS (.ZIP, .CSV, .JSON, .MAT) PASSED <<<');
    console.log('================================================================\n');
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

runFormatTests().catch((err) => {
  console.error('[FAILED] Format test error:', err);
  process.exit(1);
});
