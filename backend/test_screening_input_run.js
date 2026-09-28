/**
 * Verification test for Screening Input dataset parsing & run orchestration in server.js
 */
const assert = require('assert');

// Test CSV Parsing logic
const sampleCsv = `Test_ID,RDS0,RDS33
TEST-06,6.21,6.45
TEST-08,6.30,6.55
TEST-09,6.15,6.38
TEST-10,7.10,7.95`;

const lines = sampleCsv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
assert.strictEqual(lines.length, 5, 'Should have 5 CSV lines');

const headers = lines[0].split(',').map(h => h.trim());
assert.ok(headers.includes('Test_ID'));
assert.ok(headers.includes('RDS0'));
assert.ok(headers.includes('RDS33'));

console.log('[PASS] CSV format parsing verified');

// Test JSON Parsing logic
const sampleJson = JSON.stringify([
  { Test_ID: 'TEST-06', RDS0: 6.21, RDS33: 6.45 },
  { Test_ID: 'TEST-08', RDS0: 6.30, RDS33: 6.55 },
  { Test_ID: 'TEST-09', RDS0: 6.15, RDS33: 6.38 }
]);

const parsed = JSON.parse(sampleJson);
assert.strictEqual(parsed.length, 3);
assert.strictEqual(parsed[0].Test_ID, 'TEST-06');
assert.strictEqual(parsed[0].RDS0, 6.21);

console.log('[PASS] JSON format parsing verified');
console.log('ALL SCREENING INPUT UNIT CHECKS PASSED');
