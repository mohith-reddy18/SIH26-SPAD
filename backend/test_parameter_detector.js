/**
 * Test Suite: Dataset Parameter Detection
 * Tests in-memory inspection for CSV, JSON, and ZIP datasets
 * and verifies that only present parameters are detected.
 */

const assert = require('assert');
const zlib = require('zlib');
const {
  detectParametersFromDataset,
  detectFromCsvHeaders,
  detectFromJson,
  detectFromZipBuffer,
  CANONICAL_PARAM_DEFINITIONS
} = require('./utils/datasetParameterDetector');

console.log('=== RUNNING DATASET PARAMETER DETECTION UNIT TESTS ===\n');

// 1. Test CSV with subset of parameters
{
  const csvData = `device_id,RDS(on),v_th,IDDQ,random_col\nDEV-001,0.25,2.1,0.005,100\nDEV-002,0.26,2.2,0.006,101`;
  const buffer = Buffer.from(csvData, 'utf-8');
  const detected = detectParametersFromDataset({ file: buffer, fileName: 'test_run.csv' });

  console.log('1. CSV Detection Result:', detected);
  assert.strictEqual(detected.length, 3, 'Should detect exactly 3 parameters (rdson, v_th, iddq)');
  assert.ok(detected.includes('rdson'), 'Should detect rdson');
  assert.ok(detected.includes('v_th'), 'Should detect v_th');
  assert.ok(detected.includes('iddq'), 'Should detect iddq');
  assert.ok(!detected.includes('temp'), 'Should NOT detect temp when absent');
  assert.ok(!detected.includes('leakage'), 'Should NOT detect leakage when absent');
  console.log('   ✓ CSV detection passed without fabricating absent parameters.\n');
}

// 2. Test JSON with telemetry keys
{
  const jsonData = JSON.stringify([
    { id: 1, temp: 125, leakage: 0.0004, vds: 40.0 },
    { id: 2, temp: 128, leakage: 0.0005, vds: 39.8 }
  ]);
  const buffer = Buffer.from(jsonData, 'utf-8');
  const detected = detectParametersFromDataset({ file: buffer, fileName: 'data.json' });

  console.log('2. JSON Detection Result:', detected);
  assert.strictEqual(detected.length, 3, 'Should detect temp, leakage, vds');
  assert.ok(detected.includes('temp'));
  assert.ok(detected.includes('leakage'));
  assert.ok(detected.includes('vds'));
  assert.ok(!detected.includes('rdson'));
  console.log('   ✓ JSON detection passed.\n');
}

// 3. Test ZIP archive with contained CSV
{
  // Build a minimal valid zip file containing a CSV
  const innerCsv = 'Run_ID,RDSon,Temperature,Gate_Voltage\n1,0.34,199,10\n2,0.35,200,10';
  const innerName = 'MOSFET_199_200C_RDSon_RunLevel.csv';
  
  const nameBuffer = Buffer.from(innerName, 'utf-8');
  const dataBuffer = Buffer.from(innerCsv, 'utf-8');
  const compressed = zlib.deflateRawSync(dataBuffer);

  // Local File Header
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // Signature
  header.writeUInt16LE(20, 4);        // Version needed
  header.writeUInt16LE(0, 6);         // Flags
  header.writeUInt16LE(8, 8);         // Compression: Deflate
  header.writeUInt16LE(0, 10);        // Mod time
  header.writeUInt16LE(0, 12);        // Mod date
  header.writeUInt32LE(0, 14);        // CRC-32 (0 for test)
  header.writeUInt32LE(compressed.length, 18); // Compressed size
  header.writeUInt32LE(dataBuffer.length, 22);  // Uncompressed size
  header.writeUInt16LE(nameBuffer.length, 26);  // File name len
  header.writeUInt16LE(0, 28);        // Extra field len

  const zipBuffer = Buffer.concat([header, nameBuffer, compressed]);
  const detected = detectParametersFromDataset({ file: zipBuffer, fileName: 'dataset.zip' });

  console.log('3. ZIP Detection Result:', detected);
  assert.ok(detected.includes('rdson'), 'Should detect rdson from zipped CSV');
  assert.ok(detected.includes('temp'), 'Should detect temp from zipped CSV');
  assert.ok(detected.includes('vgs'), 'Should detect vgs from zipped CSV');
  assert.ok(!detected.includes('freq'), 'Should not detect freq when absent');
  console.log('   ✓ ZIP detection passed.\n');
}

// 4. Test Empty / Unknown buffer
{
  const emptyCsv = `col_a,col_b,col_c\n1,2,3`;
  const buffer = Buffer.from(emptyCsv, 'utf-8');
  const detected = detectParametersFromDataset({ file: buffer, fileName: 'unknown.csv' });

  console.log('4. Unknown CSV Detection Result:', detected);
  assert.strictEqual(detected.length, 0, 'Should return empty array when no recognized parameters exist');
  assert.strictEqual(detected.formatStatus, 'NO_PARAMETERS_FOUND');
  console.log('   ✓ Empty / unknown detection returned 0 items cleanly.\n');
}

// 5. Test Standalone MATLAB .mat binary file (must NOT fabricate parameters)
{
  const matBinary = Buffer.from('MATLAB 5.0 MAT-file, Platform: PCWIN64, Created on: Mon Oct 12 2020');
  const detected = detectParametersFromDataset({ file: matBinary, fileName: 'Test_9_run_7.mat' });

  console.log('5. Standalone .MAT Detection Result:', detected);
  assert.strictEqual(detected.length, 0, 'Should NOT fabricate parameters for standalone .mat binary');
  assert.strictEqual(detected.formatStatus, 'UNSUPPORTED_BINARY_FORMAT');
  assert.ok(detected.message.includes('not supported for standalone MATLAB .MAT binary files'));
  console.log('   ✓ Standalone .MAT correctly returns UNSUPPORTED_BINARY_FORMAT without fabricated parameters.\n');
}

// 6. Test ZIP containing only raw .mat files (no CSV metadata)
{
  const innerMatName = 'Test_9_run_7.mat';
  const nameBuffer = Buffer.from(innerMatName, 'utf-8');
  const dataBuffer = Buffer.from('MATLAB binary data stream');
  const compressed = zlib.deflateRawSync(dataBuffer);

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(dataBuffer.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);

  const zipBuffer = Buffer.concat([header, nameBuffer, compressed]);
  const detected = detectParametersFromDataset({ file: zipBuffer, fileName: 'raw_mat_files.zip' });

  console.log('6. Binary-only ZIP Detection Result:', detected);
  assert.strictEqual(detected.length, 0, 'Should NOT fabricate parameters for ZIP containing only .mat');
  assert.strictEqual(detected.formatStatus, 'NO_PARAMETERS_FOUND');
  console.log('   ✓ Binary-only ZIP correctly returns NO_PARAMETERS_FOUND without fabricated parameters.\n');
}

// 7. Test Disk-Based CSV Streaming Inspection (using filePath)
{
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const tmpCsv = path.join(os.tmpdir(), `test_stream_${Date.now()}.csv`);
  fs.writeFileSync(tmpCsv, 'device_id,RDS(on),v_th,IDDQ,random_col\nDEV-001,0.25,2.1,0.005,100\n');

  try {
    const detected = detectParametersFromDataset({ filePath: tmpCsv, fileName: 'telemetry.csv' });
    console.log('7. Disk CSV Detection Result:', detected);
    assert.strictEqual(detected.length, 3);
    assert.ok(detected.includes('rdson'));
    assert.ok(detected.includes('v_th'));
    assert.ok(detected.includes('iddq'));
    console.log('   ✓ Disk-based CSV streaming header inspection passed.\n');
  } finally {
    fs.unlinkSync(tmpCsv);
  }
}

// 8. Test Disk-Based ZIP Inspection (using filePath)
{
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const innerCsv = 'Run_ID,RDSon,Temperature,Gate_Voltage\n1,0.34,199,10\n2,0.35,200,10';
  const innerName = 'MOSFET_199_200C_RDSon_RunLevel.csv';
  const nameBuffer = Buffer.from(innerName, 'utf-8');
  const dataBuffer = Buffer.from(innerCsv, 'utf-8');
  const compressed = zlib.deflateRawSync(dataBuffer);

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(dataBuffer.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);

  const zipBuffer = Buffer.concat([header, nameBuffer, compressed]);
  const tmpZip = path.join(os.tmpdir(), `test_stream_${Date.now()}.zip`);
  fs.writeFileSync(tmpZip, zipBuffer);

  try {
    const detected = detectParametersFromDataset({ filePath: tmpZip, fileName: 'dataset.zip' });
    console.log('8. Disk ZIP Detection Result:', detected);
    assert.ok(detected.includes('rdson'));
    assert.ok(detected.includes('temp'));
    assert.ok(detected.includes('vgs'));
    console.log('   ✓ Disk-based ZIP streaming inspection passed.\n');
  } finally {
    fs.unlinkSync(tmpZip);
  }
}

// 9. Test Disk-Based Standalone MAT Inspection (using filePath)
{
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const tmpMat = path.join(os.tmpdir(), `Test_9_run_7_${Date.now()}.mat`);
  fs.writeFileSync(tmpMat, Buffer.from('MATLAB 5.0 MAT-file stream'));

  try {
    const detected = detectParametersFromDataset({ filePath: tmpMat, fileName: 'Test_9_run_7.mat' });
    console.log('9. Disk MAT Detection Result:', detected);
    assert.strictEqual(detected.length, 0);
    assert.strictEqual(detected.formatStatus, 'UNSUPPORTED_BINARY_FORMAT');
    console.log('   ✓ Disk-based MAT inspection correctly returns UNSUPPORTED_BINARY_FORMAT without RAM load.\n');
  } finally {
    fs.unlinkSync(tmpMat);
  }
}

console.log('=== ALL UNIT TESTS PASSED SUCCESSFULLY! ===');
