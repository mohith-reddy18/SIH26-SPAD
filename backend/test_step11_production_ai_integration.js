/**
 * SPAD STEP 11: Production AI Inference Integration Test Suite
 *
 * Verifies:
 * 1. AI Service Adapter boundaries for Method 1 and Method 2
 * 2. Method 1 production input/output normalization (0h + 24h -> 168h, 96h NOT required)
 * 3. Method 2 production input/output normalization (same-lot peer isolation, >=3 cohort)
 * 4. Model output validation (strict type checks, allowed aiFlag values, malformed output rejection)
 * 5. Model-unavailable handling and timeout safety
 * 6. Configurable model metadata and traceability
 * 7. End-to-end compatibility with express routes
 */

const http = require('http');
const express = require('express');
const cors = require('cors');

const aiService = require('./services/aiService');
const aiRouter = require('./routes/ai');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// HTTP request helper
function makeRequest(server, options, requestBody = null) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: addr.port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (requestBody) {
      req.write(typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody));
    }
    req.end();
  });
}

async function runStep11Tests() {
  console.log('================================================================');
  console.log('=== SPAD STEP 11: PRODUCTION AI INFERENCE INTEGRATION TESTS ===');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Model Metadata Traceability
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Model Metadata Traceability ---');
  delete process.env.AI_SERVICE_URL;
  process.env.AI_MODEL_NAME = 'SPAD-Test-Model';
  process.env.AI_MODEL_VERSION = '2.1.0-alpha';

  const meta = aiService.getModelMetadata();
  assert(meta.modelName === 'SPAD-Test-Model', 'Custom AI_MODEL_NAME is reflected');
  assert(meta.modelVersion === '2.1.0-alpha', 'Custom AI_MODEL_VERSION is reflected');
  assert(meta.status === 'LOCAL_DEV_INTERFACE', 'Status indicates LOCAL_DEV_INTERFACE when no AI_SERVICE_URL');
  assert(typeof meta.timestamp === 'string', 'Timestamp is present');

  // ---------------------------------------------------------------------------
  // TEST 2: Method 1 Output Validation (Strict Rejection of Malformed Output)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Method 1 Output Validation ---');

  // Valid output validation
  const validM1Raw = {
    predictions: {
      iddq: {
        status: 'PREDICTED',
        predicted168h: 2.85,
        aiFlag: 'NOT FLAGGED',
        futureRiskScore: 0.12,
      },
    },
  };
  const validatedM1 = aiService.validateMethod1Output(validM1Raw);
  assert(validatedM1.iddq.predicted168h === 2.85, 'Valid Method 1 output accepted');
  assert(validatedM1.iddq.aiFlag === 'NOT FLAGGED', 'Valid aiFlag accepted');

  // Non-numeric predicted168h when PREDICTED
  try {
    aiService.validateMethod1Output({
      predictions: {
        iddq: {
          status: 'PREDICTED',
          predicted168h: 'not-a-number',
          aiFlag: 'NOT FLAGGED',
        },
      },
    });
    assert(false, 'Should throw for non-numeric predicted168h');
  } catch (err) {
    assert(err.code === 'MODEL_OUTPUT_INVALID', 'Rejects non-numeric predicted168h with MODEL_OUTPUT_INVALID');
  }

  // Invalid aiFlag
  try {
    aiService.validateMethod1Output({
      predictions: {
        iddq: {
          status: 'PREDICTED',
          predicted168h: 2.85,
          aiFlag: 'INVALID_FLAG_VALUE',
        },
      },
    });
    assert(false, 'Should throw for invalid aiFlag');
  } catch (err) {
    assert(err.code === 'MODEL_OUTPUT_INVALID', 'Rejects invalid aiFlag with MODEL_OUTPUT_INVALID');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Method 2 Output Validation (Strict Rejection of Malformed Output)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Method 2 Output Validation ---');

  const validM2Raw = {
    anomalyResults: {
      iddq: {
        status: 'ANALYZED',
        lotAnomalyScore: 0.15,
        peerComparisonEvidence: { mean: 2.1 },
        divergenceType: 'NOMINAL',
        aiFlag: 'NOT FLAGGED',
      },
    },
  };
  const validatedM2 = aiService.validateMethod2Output(validM2Raw);
  assert(validatedM2.iddq.lotAnomalyScore === 0.15, 'Valid Method 2 output accepted');
  assert(validatedM2.iddq.aiFlag === 'NOT FLAGGED', 'Valid aiFlag accepted');

  // Invalid aiFlag in Method 2
  try {
    aiService.validateMethod2Output({
      anomalyResults: {
        iddq: {
          status: 'ANALYZED',
          lotAnomalyScore: 0.15,
          aiFlag: 'SUSPICIOUS', // invalid flag
        },
      },
    });
    assert(false, 'Should throw for invalid Method 2 aiFlag');
  } catch (err) {
    assert(err.code === 'MODEL_OUTPUT_INVALID', 'Rejects invalid Method 2 aiFlag with MODEL_OUTPUT_INVALID');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Method 1 Local Adapter Inference Execution
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Method 1 Local Adapter Inference Execution ---');
  delete process.env.AI_SERVICE_URL;

  const m1Result = await aiService.predict168h({
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: { unit: 'mA', observed: { '0h': 2.0, '24h': 2.1 } },
      leakage: { unit: 'µA', observed: { '0h': 0.38, '24h': 0.40 } },
    },
  });

  assert(m1Result.predictions.iddq.status === 'PREDICTED', 'iddq status is PREDICTED');
  assert(typeof m1Result.predictions.iddq.predicted168h === 'number', 'predicted168h is numeric');
  assert(m1Result.predictions.iddq.aiFlag === 'NOT FLAGGED', 'iddq aiFlag is NOT FLAGGED');
  assert(m1Result.modelMetadata != null, 'modelMetadata is attached');

  // ---------------------------------------------------------------------------
  // TEST 5: Method 2 Local Adapter Inference Execution
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Method 2 Local Adapter Inference Execution ---');
  const m2Result = await aiService.detectLotAnomalies({
    targetComponentId: 'C-0001',
    lotId: 'LOT-2026-001',
    cohort: [
      { componentId: 'C-0001', parameters: { iddq: { observed: { '24h': 2.1 } } } },
      { componentId: 'C-0002', parameters: { iddq: { observed: { '24h': 2.2 } } } },
      { componentId: 'C-0003', parameters: { iddq: { observed: { '24h': 2.7 } } } },
    ],
  });

  assert(m2Result.anomalyResults.iddq.status === 'ANALYZED', 'iddq status is ANALYZED');
  assert(typeof m2Result.anomalyResults.iddq.lotAnomalyScore === 'number', 'lotAnomalyScore is numeric');
  assert(m2Result.anomalyResults.iddq.aiFlag === 'NOT FLAGGED', 'iddq aiFlag is NOT FLAGGED');

  // ---------------------------------------------------------------------------
  // TEST 6: Remote Service Integration & Model Unavailable Handling
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Remote Service Integration & Model Unavailable Safety ---');

  // Spin up a mock remote AI service to test successful remote dispatch
  const mockRemoteApp = express();
  mockRemoteApp.use(express.json());

  mockRemoteApp.post('/predict-168h', (req, res) => {
    res.status(200).json({
      predictions: {
        iddq: {
          status: 'PREDICTED',
          predicted168h: 2.92,
          futureRiskScore: 0.18,
          aiFlag: 'NOT FLAGGED',
        },
      },
    });
  });

  mockRemoteApp.post('/detect-lot-anomalies', (req, res) => {
    res.status(200).json({
      anomalyResults: {
        iddq: {
          status: 'ANALYZED',
          lotAnomalyScore: 0.22,
          divergenceType: 'NOMINAL',
          aiFlag: 'NOT FLAGGED',
        },
      },
    });
  });

  const remoteServer = http.createServer(mockRemoteApp);
  await new Promise((resolve) => remoteServer.listen(0, resolve));
  const remotePort = remoteServer.address().port;
  process.env.AI_SERVICE_URL = `http://127.0.0.1:${remotePort}`;

  // Test successful remote dispatch
  const remoteM1Result = await aiService.predict168h({
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: { iddq: { unit: 'mA', observed: { '0h': 2.0, '24h': 2.1 } } },
  });
  assert(remoteM1Result.predictions.iddq.predicted168h === 2.92, 'Remote inference returned 2.92 for predicted168h');
  assert(remoteM1Result.modelMetadata.status === 'REMOTE_INFERENCE', 'Metadata status indicates REMOTE_INFERENCE');

  // Test remote failure / unreachable service
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:59999'; // invalid port
  process.env.AI_SERVICE_TIMEOUT_MS = '500';

  try {
    await aiService.predict168h({
      componentId: 'C-0001',
      lotId: 'LOT-2026-001',
      parameters: { iddq: { unit: 'mA', observed: { '0h': 2.0, '24h': 2.1 } } },
    });
    assert(false, 'Should throw when remote service is unavailable');
  } catch (err) {
    assert(err.code === 'MODEL_UNAVAILABLE', 'Standardized MODEL_UNAVAILABLE error returned for unreachable service');
    assert(err.statusCode === 503, 'Status code is 503');
  }

  // Cleanup remote server and environment
  remoteServer.close();
  delete process.env.AI_SERVICE_URL;
  delete process.env.AI_SERVICE_TIMEOUT_MS;

  // ---------------------------------------------------------------------------
  // TEST 7: Express Route Integration
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Express Route Integration ---');
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/ai', aiRouter);

  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));

  const postRes1 = await makeRequest(testServer, { path: '/api/ai/predict-168h', method: 'POST' }, {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: { unit: 'mA', observed: { '0h': 2.0, '24h': 2.1 } },
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  assert(postRes1.status === 200, 'POST /api/ai/predict-168h returned 200 OK');
  assert(postRes1.body.success === true, 'Response body.success is true');
  assert(postRes1.body.parameters.iddq.rateOfChangePerHour === 0.004167, 'Backend-derived rateOfChangePerHour computed outside model');
  assert(postRes1.body.parameters.iddq.projectedMargin != null, 'Backend-derived projectedMargin computed outside model');

  testServer.close();

  console.log('\n================================================================');
  console.log(`=== STEP 11 TESTS COMPLETE: ${passedTests}/${totalTests} TESTS PASSED ===`);
  console.log('================================================================\n');
}

if (require.main === module) {
  runStep11Tests().catch((err) => {
    console.error('\n[FATAL ERROR IN STEP 11 TESTS]:', err);
    process.exit(1);
  });
}

module.exports = { runStep11Tests };
