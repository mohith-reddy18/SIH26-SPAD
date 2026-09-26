const express = require('express');
const http = require('http');
const aiRoutes = require('./routes/ai');
const assert = require('assert');

async function runTests() {
  console.log('====================================================================');
  console.log('=== TESTING POST /api/ai/results ENDPOINT (STEP 1 INTEGRATION) ===');
  console.log('====================================================================\n');

  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/ai/results`;

  async function postJson(payload) {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  try {
    // 1. Valid Expected Python Payload
    console.log('--- TEST 1: Valid Python ML Payload ---');
    const validPayload = {
      lotId: 'NASA-MOSFET-199C',
      results: [
        {
          Test_ID: 'TEST-01',
          RDS0: 1.724,
          RDS33: 1.839,
          Delta_RDS_0_33: 0.115,
          Module_A_IF_Score: 0.042,
          Module_A_Novelty_Percentile: 84.5,
          Predicted_RDS100: 2.185,
          Forecast_Residual: -0.015,
          Absolute_Forecast_Error: 0.015,
          Forecast_Error_Ratio: 0.0069,
          Module_B_Anomaly: 0,
        },
      ],
    };

    const res1 = await postJson(validPayload);
    assert.strictEqual(res1.status, 200, `Expected 200, got ${res1.status}`);
    assert.strictEqual(res1.data.success, true);
    assert.strictEqual(res1.data.lotId, 'NASA-MOSFET-199C');
    assert.strictEqual(res1.data.recordsCount, 1);

    const rec1 = res1.data.records[0].normalizedRecord;
    assert.strictEqual(rec1.componentId, 'TEST-01');
    assert.strictEqual(rec1.lotId, 'NASA-MOSFET-199C');
    assert.strictEqual(rec1.measurements.rdson['0h'], 1.724);
    assert.strictEqual(rec1.measurements.rdson['24h'], 1.839);
    assert.strictEqual(rec1.measurements.rdson['96h'], undefined, 'Must not invent 96h observed measurement');
    assert.strictEqual(rec1.measurements.rdson['168h'], undefined, 'Must not invent 168h observed measurement');

    // Module B (Prediction) checks
    const predParam = rec1.aiAssessment.prediction.parameters.rdson;
    assert.strictEqual(predParam.predicted168h, 2.185);
    assert.strictEqual(predParam.aiFlag, 'NOT FLAGGED');
    assert.strictEqual(predParam.modelEvidence.forecastResidual, -0.015);
    assert.strictEqual(predParam.modelEvidence.pythonDelta, 0.115);
    assert.strictEqual(typeof predParam.rateOfChangePerHour, 'number');

    // Module A (Isolation Forest) checks
    const anomParam = rec1.aiAssessment.lotAnomaly.parameters.rdson;
    assert.strictEqual(anomParam.lotAnomalyScore, 0.042, 'Raw Isolation Forest score must be preserved exactly without modification/clamping');
    assert.strictEqual(anomParam.aiFlag, 'NOT_EVALUATED', 'Module A flag must be NOT_EVALUATED when no explicit flag provided (no invented threshold)');
    assert.strictEqual(anomParam.peerComparisonEvidence.noveltyPercentile, 84.5);
    assert.strictEqual(anomParam.peerComparisonEvidence.rawScore, 0.042);

    // AI Overall Status
    assert.strictEqual(rec1.aiAssessment.overallStatus, 'NOT FLAGGED');

    // Engineering Status when no valid DB limit exists
    assert.deepStrictEqual(rec1.engineeringLimits, {}, 'engineeringLimits must be empty when no official limit is configured');
    assert.strictEqual(rec1.engineeringStatus, 'NOT_EVALUATED', 'engineeringStatus must be NOT_EVALUATED when no official DB limits exist (cannot assume NORMAL)');
    assert.strictEqual(rec1.status, 'NOT_EVALUATED', 'status must be NOT_EVALUATED when no official DB limits exist');
    console.log('[PASS] Valid payload normalized correctly with NOT_EVALUATED engineering status and preserved IF raw score');

    // 2. Module B Anomaly Flagged
    console.log('\n--- TEST 2: Module B Flagged (1 / FLAGGED) ---');
    const flaggedPayload = {
      lotId: 'NASA-MOSFET-199C',
      results: [
        {
          Test_ID: 'TEST-02',
          RDS0: 1.5,
          RDS33: 1.9,
          Predicted_RDS100: 3.2,
          Module_A_IF_Score: 0.12,
          Module_B_Anomaly: 1,
        },
      ],
    };
    const res2 = await postJson(flaggedPayload);
    assert.strictEqual(res2.status, 200);
    const rec2 = res2.data.records[0].normalizedRecord;
    assert.strictEqual(rec2.aiAssessment.prediction.parameters.rdson.aiFlag, 'FLAGGED');
    assert.strictEqual(rec2.aiAssessment.overallStatus, 'FLAGGED');
    assert.strictEqual(rec2.aiRisk, 85);
    console.log('[PASS] Module B anomaly 1 correctly normalized to FLAGGED');

    // 2b. Signed / Negative Isolation Forest Score Preservation
    console.log('\n--- TEST 2b: Signed / Negative Isolation Forest Score Preservation ---');
    const negativeScorePayload = {
      lotId: 'NASA-MOSFET-199C',
      results: [
        {
          Test_ID: 'TEST-03',
          RDS0: 1.6,
          RDS33: 1.7,
          Predicted_RDS100: 2.0,
          Module_A_IF_Score: -0.145, // Scikit-Learn raw decision function output can be negative
          Module_B_Anomaly: 0,
        },
      ],
    };
    const res2b = await postJson(negativeScorePayload);
    assert.strictEqual(res2b.status, 200);
    const rec2b = res2b.data.records[0].normalizedRecord;
    assert.strictEqual(rec2b.aiAssessment.lotAnomaly.parameters.rdson.lotAnomalyScore, -0.145, 'Negative IF score must be preserved as-is without clamping');
    assert.strictEqual(rec2b.aiAssessment.lotAnomaly.parameters.rdson.peerComparisonEvidence.rawScore, -0.145);
    console.log('[PASS] Negative signed Isolation Forest score preserved exactly (-0.145)');

    // 3. Validation: Missing lotId
    console.log('\n--- TEST 3: Validation Error - Missing lotId ---');
    const res3 = await postJson({ results: validPayload.results });
    assert.strictEqual(res3.status, 400);
    assert.strictEqual(res3.data.success, false);
    assert.strictEqual(res3.data.error.code, 'INVALID_PAYLOAD');
    console.log('[PASS] Missing lotId returned HTTP 400 INVALID_PAYLOAD');

    // 4. Validation: Empty results
    console.log('\n--- TEST 4: Validation Error - Empty results array ---');
    const res4 = await postJson({ lotId: 'LOT-1', results: [] });
    assert.strictEqual(res4.status, 400);
    assert.strictEqual(res4.data.success, false);
    console.log('[PASS] Empty results array returned HTTP 400');

    // 5. Validation: Missing required field in result
    console.log('\n--- TEST 5: Validation Error - Missing RDS33 ---');
    const res5 = await postJson({
      lotId: 'LOT-1',
      results: [{ Test_ID: 'T1', RDS0: 1.0, Predicted_RDS100: 2.0, Module_A_IF_Score: 0.1 }],
    });
    assert.strictEqual(res5.status, 400);
    assert.strictEqual(res5.data.success, false);
    console.log('[PASS] Missing required numeric field returned HTTP 400');

    // 6. Validation: Non-finite / String numeric field
    console.log('\n--- TEST 6: Validation Error - Non-finite numeric field ---');
    const res6 = await postJson({
      lotId: 'LOT-1',
      results: [{ Test_ID: 'T1', RDS0: 'invalid_number', RDS33: 1.2, Predicted_RDS100: 2.0, Module_A_IF_Score: 0.1 }],
    });
    assert.strictEqual(res6.status, 400);
    assert.strictEqual(res6.data.success, false);
    console.log('[PASS] Invalid non-finite numeric field returned HTTP 400');

    // 7. Multi-component lot validation & normalization
    console.log('\n--- TEST 7: Multi-Component Lot Payload ---');
    const multiPayload = {
      lotId: 'NASA-MOSFET-199C',
      results: [
        {
          Test_ID: 'TEST-01',
          RDS0: 1.724,
          RDS33: 1.839,
          Predicted_RDS100: 2.185,
          Module_A_IF_Score: 0.042,
          Module_B_Anomaly: 0,
        },
        {
          Test_ID: 'TEST-02',
          RDS0: 1.710,
          RDS33: 1.820,
          Predicted_RDS100: 2.150,
          Module_A_IF_Score: 0.038,
          Module_B_Anomaly: 0,
        },
      ],
    };
    const res7 = await postJson(multiPayload);
    assert.strictEqual(res7.status, 200);
    assert.strictEqual(res7.data.recordsCount, 2);
    assert.strictEqual(res7.data.records[0].componentId, 'TEST-01');
    assert.strictEqual(res7.data.records[1].componentId, 'TEST-02');
    console.log('[PASS] Multi-component batch normalized successfully');

    console.log('\n====================================================================');
    console.log('=== ALL POST /api/ai/results TESTS PASSED SUCCESSFULLY! ===');
    console.log('====================================================================');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
