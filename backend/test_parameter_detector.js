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
  console.log('   ✓ Empty / unknown detection returned 0 items cleanly.\n');
}

console.log('=== ALL UNIT TESTS PASSED SUCCESSFULLY! ===');
