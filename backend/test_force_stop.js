/**
 * Verification test for SPAD Screening Force Stop capability
 */
const assert = require('assert');
const { runScreeningOrchestration } = require('./services/screeningOrchestrator');
const aiService = require('./services/aiService');

async function testForceStopOrchestrationSignal() {
  console.log('[TEST 1] Testing runScreeningOrchestration with pre-aborted signal...');
  const abortController = new AbortController();
  abortController.abort();

  let caughtError = null;
  try {
    await runScreeningOrchestration({
      lotId: 'LOT-TEST-STOP-01',
      signal: abortController.signal,
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, 'Should throw error when signal is aborted');
  assert.strictEqual(caughtError.code, 'SCREENING_ABORTED');
  assert.strictEqual(caughtError.statusCode, 499);
  console.log('[PASS] Pre-aborted signal correctly halts orchestration with SCREENING_ABORTED (499)');
}

async function testAiServiceAbortSignal() {
  console.log('[TEST 2] Testing aiService.runScreening with aborted signal...');
  const abortController = new AbortController();
  abortController.abort();

  // Save current env
  const origUrl = process.env.AI_SERVICE_URL;
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:9999'; // dummy non-running endpoint

  let caughtError = null;
  try {
    await aiService.runScreening({ lotId: 'LOT-TEST-STOP-02' }, abortController.signal);
  } catch (err) {
    caughtError = err;
  } finally {
    process.env.AI_SERVICE_URL = origUrl;
  }

  assert.ok(caughtError, 'Should throw error when signal is aborted');
  assert.strictEqual(caughtError.code, 'SCREENING_ABORTED');
  assert.strictEqual(caughtError.statusCode, 499);
  console.log('[PASS] aiService.runScreening correctly handles cancellation signal');
}

async function runAllTests() {
  try {
    await testForceStopOrchestrationSignal();
    await testAiServiceAbortSignal();
    console.log('\n>>> ALL FORCE STOP UNIT TESTS PASSED SUCCESSFULLY! <<<');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

runAllTests();
