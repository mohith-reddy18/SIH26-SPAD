/**
 * SPAD — STEP 8: AI Model Integration Interface Verification Test Suite
 */

const http = require('http');
const express = require('express');
const cors = require('cors');

const aiService = require('./services/aiService');
const aiRouter = require('./routes/ai');
const {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
  currentYield,
} = require('./utils/contractCalculations');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/ai', aiRouter);

const TEST_PORT = 5098;
let server;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

let passed = 0;
let total = 0;

function check(condition, message) {
  total++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('=== SPAD STEP 8: AI MODEL INTEGRATION INTERFACE VERIFICATION ===\n');

  // --- 1. Direct aiService Contract Tests (Model-Owned Outputs) ---
  console.log('--- 1. Testing aiService Internal Contract (Model-Owned Responsibilities) ---');
  
  // Method 1 Model Input & Output
  const m1ModelInput = {
    componentId: 'C-M1-001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: {
        unit: 'mA',
        observed: { '0h': 2.00, '24h': 2.12 },
      },
      leakage: {
        unit: 'µA',
        observed: { '0h': 0.38, '24h': 0.41 },
      },
    },
  };

  const m1ModelOutput = await aiService.predict168h(m1ModelInput);
  check(m1ModelOutput.componentId === 'C-M1-001', 'aiService M1: Preserves componentId');
  check(m1ModelOutput.lotId === 'LOT-2026-001', 'aiService M1: Preserves lotId');
  check(typeof m1ModelOutput.modelMetadata === 'object', 'aiService M1: Returns modelMetadata');
  check(typeof m1ModelOutput.modelMetadata.modelName === 'string', 'aiService M1: modelName is present');
  check(typeof m1ModelOutput.predictions.iddq.predicted168h === 'number', 'aiService M1: predicted168h is numeric');
  check(m1ModelOutput.predictions.iddq.predictionInterval === null, 'aiService M1: Uncalibrated predictionInterval is null');
  check(typeof m1ModelOutput.predictions.iddq.futureRiskScore === 'number', 'aiService M1: futureRiskScore is numeric');
  check(m1ModelOutput.predictions.iddq.futureRiskPercent === null, 'aiService M1: Uncalibrated futureRiskPercent is null');
  check(m1ModelOutput.predictions.iddq.limitBreachProbability === null, 'aiService M1: Uncalibrated limitBreachProbability is null');
  check(m1ModelOutput.predictions.iddq.aiFlag === 'NOT FLAGGED', 'aiService M1: aiFlag is NOT FLAGGED');
  check(m1ModelOutput.predictions.iddq.rateOfChangePerHour === undefined, 'aiService M1: Model does NOT own rateOfChangePerHour');
  check(m1ModelOutput.predictions.iddq.projectedMargin === undefined, 'aiService M1: Model does NOT own projectedMargin');

  // Method 2 Model Input & Output
  const m2ModelInput = {
    targetComponentId: 'C-M2-001',
    lotId: 'LOT-2026-001',
    cohort: [
      { componentId: 'C-M2-001', parameters: { iddq: { observed: { '0h': 2.00, '24h': 2.10 } } } },
      { componentId: 'C-M2-002', parameters: { iddq: { observed: { '0h': 2.00, '24h': 2.05 } } } },
      { componentId: 'C-M2-003', parameters: { iddq: { observed: { '0h': 2.00, '24h': 2.12 } } } },
    ],
  };

  const m2ModelOutput = await aiService.detectLotAnomalies(m2ModelInput);
  check(m2ModelOutput.targetComponentId === 'C-M2-001', 'aiService M2: Preserves targetComponentId');
  check(typeof m2ModelOutput.modelMetadata === 'object', 'aiService M2: Returns modelMetadata');
  check(m2ModelOutput.anomalyResults.iddq.status === 'ANALYZED', 'aiService M2: status is ANALYZED');
  check(typeof m2ModelOutput.anomalyResults.iddq.lotAnomalyScore === 'number', 'aiService M2: lotAnomalyScore is numeric');
  check(typeof m2ModelOutput.anomalyResults.iddq.peerComparisonEvidence === 'object', 'aiService M2: peerComparisonEvidence is object');
  check(m2ModelOutput.anomalyResults.iddq.cohortQuality === undefined, 'aiService M2: Model does NOT own cohortQuality');
  check(m2ModelOutput.anomalyResults.iddq.overallStatus === undefined, 'aiService M2: Model does NOT own overallStatus');

  // --- 2. HTTP Boundary and Backend Responsibility Verification ---
  console.log('\n--- 2. Testing HTTP Route Integration (Backend Responsibilities) ---');
  server = app.listen(TEST_PORT, async () => {
    try {
      // Test Method 1 via HTTP
      const httpM1Payload = {
        componentId: 'C-HTTP-001',
        lotId: 'LOT-2026-001',
        parameters: {
          iddq: {
            unit: 'mA',
            observed: { '0h': 2.00, '24h': 2.24 },
            engineeringLimit: { limitValue: 4.00, direction: 'UPPER', source: 'DATABASE_CATALOG' },
          },
        },
      };

      const httpM1Res = await request('POST', '/api/ai/predict-168h', httpM1Payload);
      check(httpM1Res.status === 200, 'HTTP M1: Responds with 200 OK');
      check(httpM1Res.body.modelMetadata !== undefined, 'HTTP M1: Returns modelMetadata');
      check(httpM1Res.body.parameters.iddq.rateOfChangePerHour === 0.01, 'HTTP M1: Backend computes rateOfChangePerHour');
      check(typeof httpM1Res.body.parameters.iddq.projectedMargin === 'number', 'HTTP M1: Backend computes projectedMargin for DATABASE_CATALOG');
      check(httpM1Res.body.aiAssessment.overallStatus === 'NOT FLAGGED', 'HTTP M1: Backend aggregates overallStatus');

      // Test Limit Source Differentiation: AI_ESTIMATED_BOUNDARY
      const httpM1AiEstimatedPayload = {
        componentId: 'C-HTTP-AI-EST',
        lotId: 'LOT-2026-001',
        parameters: {
          iddq: {
            unit: 'mA',
            observed: { '0h': 2.00, '24h': 2.24 },
            engineeringLimit: { limitValue: 3.50, direction: 'UPPER', source: 'AI_ESTIMATED_BOUNDARY' },
          },
        },
      };

      const httpM1AiEstRes = await request('POST', '/api/ai/predict-168h', httpM1AiEstimatedPayload);
      check(httpM1AiEstRes.status === 200, 'HTTP M1 AI_ESTIMATED_BOUNDARY: Responds with 200 OK');
      check(httpM1AiEstRes.body.parameters.iddq.engineeringLimit.source === 'AI_ESTIMATED_BOUNDARY', 'HTTP M1: source is AI_ESTIMATED_BOUNDARY');
      check(httpM1AiEstRes.body.parameters.iddq.projectedMargin === null, 'HTTP M1: projectedMargin is NULL for AI_ESTIMATED_BOUNDARY');

      // Test Method 2 via HTTP
      const httpM2Payload = {
        componentId: 'C-HTTP-001',
        lotId: 'LOT-2026-001',
        components: [
          { componentId: 'C-HTTP-001', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.00, '24h': 2.10 } } } },
          { componentId: 'C-HTTP-002', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.00, '24h': 2.05 } } } },
          { componentId: 'C-HTTP-003', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.00, '24h': 2.12 } } } },
        ],
      };

      const httpM2Res = await request('POST', '/api/ai/detect-lot-anomalies', httpM2Payload);
      check(httpM2Res.status === 200, 'HTTP M2: Responds with 200 OK');
      check(httpM2Res.body.modelMetadata !== undefined, 'HTTP M2: Returns modelMetadata');
      check(httpM2Res.body.cohortQuality === 'SUFFICIENT', 'HTTP M2: Backend determines cohortQuality');
      check(httpM2Res.body.componentsAnalyzed === 3, 'HTTP M2: Backend computes componentsAnalyzed');
      check(httpM2Res.body.eligiblePeersCount === 2, 'HTTP M2: Backend computes eligiblePeersCount');

      console.log(`\n==================================================`);
      console.log(`STEP 8 INTERFACE RESULTS: ${passed}/${total} TESTS PASSED`);
      console.log(`==================================================\n`);

      server.close();
      if (passed !== total) {
        process.exit(1);
      }
    } catch (err) {
      console.error('Test execution error:', err);
      if (server) server.close();
      process.exit(1);
    }
  });
}

runTests();
