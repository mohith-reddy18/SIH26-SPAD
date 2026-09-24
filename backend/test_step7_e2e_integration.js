/**
 * SPAD — STEP 7: Backend Integration & End-to-End Data Flow Verification Test Suite
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
  currentYield,
} = require('./utils/contractCalculations');

const aiRouter = require('./routes/ai');
const aiService = require('./services/aiService');
const ScreeningRecord = require('./models/ScreeningRecord');

// Create test app instance
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/ai', aiRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'ok',
    message: 'SPAD backend is running',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Mock in-memory screening store for offline testing
const inMemoryStore = [];

app.post('/api/screening', async (req, res) => {
  try {
    const { componentId, lotId } = req.body || {};
    if (!componentId || typeof componentId !== 'string' || !componentId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Field "componentId" is required and must be a non-empty string',
      });
    }
    if (!lotId || typeof lotId !== 'string' || !lotId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Field "lotId" is required and must be a non-empty string',
      });
    }

    const doc = new ScreeningRecord(req.body);
    const validated = doc.toObject();
    inMemoryStore.push(validated);

    return res.status(201).json({
      success: true,
      message: 'Screening record created successfully',
      data: validated,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/screening', (req, res) => {
  const { lotId } = req.query;
  const filtered = lotId ? inMemoryStore.filter((r) => r.lotId === lotId) : inMemoryStore;
  return res.status(200).json({
    success: true,
    count: filtered.length,
    data: filtered,
  });
});

app.get('/api/screening/:componentId', (req, res) => {
  const { componentId } = req.params;
  const match = inMemoryStore.find((r) => r.componentId === componentId);
  if (!match) {
    return res.status(404).json({
      success: false,
      error: 'Not Found',
      message: `Screening record for component "${componentId}" not found`,
    });
  }
  return res.status(200).json({ success: true, data: match });
});

const TEST_PORT = 5099;
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
  console.log('=== SPAD STEP 7: COMPREHENSIVE END-TO-END INTEGRATION TEST SUITE ===\n');

  server = app.listen(TEST_PORT, async () => {
    try {
      // 1. Health Endpoint
      const healthRes = await request('GET', '/api/health');
      check(healthRes.status === 200, 'Health Endpoint: GET /api/health returns 200 OK');
      check(healthRes.body.status === 'ok', 'Health Endpoint: status is "ok"');
      check(typeof healthRes.body.database === 'string', 'Health Endpoint: database connection string is present');

      // 2. Screening Ingestion: POST /api/screening
      const payload = {
        componentId: 'C-E2E-001',
        lotId: 'LOT-E2E-TEST',
        stage: '24h',
        measurements: {
          iddq: [2.00, 2.10],
          leakage: [0.38, 0.40],
          custom_speed: [8.10, 8.14],
        },
        engineeringLimits: {
          iddq: { limitValue: 4.0, direction: 'UPPER' },
          leakage: { limitValue: 1.5, direction: 'UPPER' },
          custom_speed: { limitValue: 11.0, direction: 'UPPER' },
        },
        engineeringStatus: 'NORMAL',
        aiAssessment: {
          overallStatus: 'NOT FLAGGED',
          prediction: { status: 'PREDICTED', iddq_168h: 2.20 },
        },
      };

      const postRes = await request('POST', '/api/screening', payload);
      check(postRes.status === 201, 'Screening Ingestion: POST /api/screening returns 201 Created');
      check(postRes.body.success === true, 'Screening Ingestion: success is true');
      check(postRes.body.data.componentId === 'C-E2E-001', 'Screening Ingestion: componentId preserved');
      check(postRes.body.data.measurements.custom_speed[0] === 8.10, 'Screening Ingestion: dynamic parameters preserved');
      check(postRes.body.data.engineeringLimits.custom_speed.limitValue === 11.0, 'Screening Ingestion: engineeringLimits preserved');

      // 3. Database -> Screening API: GET /api/screening and GET /api/screening/:componentId
      const listRes = await request('GET', '/api/screening?lotId=LOT-E2E-TEST');
      check(listRes.status === 200, 'Screening Retrieval: GET /api/screening returns 200');
      check(listRes.body.data.length === 1, 'Screening Retrieval: returns 1 matching lot document');
      check(listRes.body.data[0].componentId === 'C-E2E-001', 'Screening Retrieval: document componentId matches');

      const itemRes = await request('GET', '/api/screening/C-E2E-001');
      check(itemRes.status === 200, 'Screening Retrieval by ID: GET /api/screening/:componentId returns 200');
      check(itemRes.body.data.componentId === 'C-E2E-001', 'Screening Retrieval by ID: componentId matches');
      check(itemRes.body.data.engineeringStatus === 'NORMAL', 'Screening Retrieval by ID: engineeringStatus matches');

      const notFoundRes = await request('GET', '/api/screening/NONEXISTENT-999');
      check(notFoundRes.status === 404, 'Screening Retrieval 404: Nonexistent component returns 404');
      check(notFoundRes.body.success === false, 'Screening Retrieval 404: success is false');

      // 4. Method 1 End-to-End: POST /api/ai/predict-168h
      const m1Payload = {
        componentId: 'C-E2E-001',
        lotId: 'LOT-E2E-TEST',
        parameters: {
          iddq: {
            unit: 'mA',
            observed: { '0h': 2.00, '24h': 2.24 },
            engineeringLimit: { limitValue: 4.00, direction: 'UPPER' },
          },
          leakage: {
            unit: 'µA',
            observed: { '0h': 0.50, '24h': 0.60 },
            engineeringLimit: { limitValue: 1.50, direction: 'UPPER' },
          },
        },
      };

      const m1Res = await request('POST', '/api/ai/predict-168h', m1Payload);
      check(m1Res.status === 200, 'Method 1 E2E: Valid 0h + 24h inputs return 200 OK');
      check(m1Res.body.method === 'FUTURE_PREDICTION', 'Method 1 E2E: method is FUTURE_PREDICTION');
      check(m1Res.body.parameters.iddq.rateOfChangePerHour === 0.01, 'Method 1 E2E: rateOfChangePerHour = (2.24-2.00)/24 = 0.01');
      check(typeof m1Res.body.parameters.iddq.predicted168h === 'number', 'Method 1 E2E: predicted168h is numeric');
      check(typeof m1Res.body.parameters.iddq.projectedMargin === 'number', 'Method 1 E2E: UPPER projectedMargin is numeric');
      check(m1Res.body.parameters.iddq.aiFlag === 'NOT FLAGGED', 'Method 1 E2E: aiFlag is NOT FLAGGED');

      // Direction-aware limit test (LOWER limit)
      const m1LowerPayload = {
        componentId: 'C-E2E-LOWER',
        lotId: 'LOT-E2E-TEST',
        parameters: {
          voltage_threshold: {
            unit: 'V',
            observed: { '0h': 1.80, '24h': 1.70 },
            engineeringLimit: { limitValue: 1.20, direction: 'LOWER' },
          },
        },
      };

      const m1LowerRes = await request('POST', '/api/ai/predict-168h', m1LowerPayload);
      check(m1LowerRes.status === 200, 'Method 1 Lower Limit: Returns 200 OK');
      const predVal = m1LowerRes.body.parameters.voltage_threshold.predicted168h;
      const marginVal = m1LowerRes.body.parameters.voltage_threshold.projectedMargin;
      check(Number((predVal - 1.20).toFixed(4)) === marginVal, 'Method 1 Lower Limit: projectedMargin = predicted168h - LOWER limit');

      // Method 1 Error Contract
      const m1BadRes = await request('POST', '/api/ai/predict-168h', {
        componentId: 'C-BAD',
        lotId: 'LOT-BAD',
        parameters: { iddq: { observed: { '0h': 2.00 } } }, // missing 24h
      });
      check(m1BadRes.status === 400, 'Method 1 Error: Missing 24h returns 400');
      check(m1BadRes.body.error.code === 'INSUFFICIENT_DATA', 'Method 1 Error: code is INSUFFICIENT_DATA');
      check(m1BadRes.body.error.componentId === 'C-BAD', 'Method 1 Error: componentId preserved in error');
      check(typeof m1BadRes.body.error.timestamp === 'string', 'Method 1 Error: timestamp is present');

      // 5. Method 2 End-to-End: POST /api/ai/detect-lot-anomalies
      const m2Payload = {
        componentId: 'C-001',
        lotId: 'LOT-E2E-001',
        components: [
          { componentId: 'C-001', lotId: 'LOT-E2E-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
          { componentId: 'C-002', lotId: 'LOT-E2E-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.05 } } } },
          { componentId: 'C-003', lotId: 'LOT-E2E-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.12 } } } },
        ],
      };

      const m2Res = await request('POST', '/api/ai/detect-lot-anomalies', m2Payload);
      check(m2Res.status === 200, 'Method 2 E2E: Returns 200 OK');
      check(m2Res.body.cohortQuality === 'SUFFICIENT', 'Method 2 E2E: cohortQuality is SUFFICIENT');
      check(m2Res.body.componentsAnalyzed === 3, 'Method 2 E2E: componentsAnalyzed includes target (3)');
      check(m2Res.body.eligiblePeersCount === 2, 'Method 2 E2E: eligiblePeersCount excludes target (2)');
      check(m2Res.body.parameters.iddq.status === 'ANALYZED', 'Method 2 E2E: parameter status is ANALYZED');

      // Method 2 Insufficient Cohort (<3 same-lot units)
      const m2InsufficientRes = await request('POST', '/api/ai/detect-lot-anomalies', {
        componentId: 'C-001',
        lotId: 'LOT-E2E-001',
        components: [
          { componentId: 'C-001', lotId: 'LOT-E2E-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
          { componentId: 'C-002', lotId: 'LOT-E2E-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.05 } } } },
        ],
      });
      check(m2InsufficientRes.status === 200, 'Method 2 Insufficient: Returns 200 OK with contract');
      check(m2InsufficientRes.body.cohortQuality === 'INSUFFICIENT', 'Method 2 Insufficient: cohortQuality is INSUFFICIENT');
      check(m2InsufficientRes.body.aiStatus === 'NOT_EVALUATED', 'Method 2 Insufficient: aiStatus is NOT_EVALUATED');
      check(m2InsufficientRes.body.parameters.iddq.status === 'INSUFFICIENT_COHORT', 'Method 2 Insufficient: parameter status is INSUFFICIENT_COHORT');
      check(m2InsufficientRes.body.parameters.iddq.lotAnomalyScore === null, 'Method 2 Insufficient: lotAnomalyScore is null without fabrication');

      // 6. Engineering Status Calculations (Deterministic)
      check(
        engineeringStatus({ iddq: [2.0, 2.1], leakage: [0.38, 0.40] }, { iddq: { limitValue: 4.0 }, leakage: { limitValue: 1.5 } }) === 'NORMAL',
        'Engineering Status: 0 distinct parameter breaches -> NORMAL'
      );
      check(
        engineeringStatus({ iddq: [2.0, 4.5, 5.0], leakage: [0.38, 0.40] }, { iddq: { limitValue: 4.0 }, leakage: { limitValue: 1.5 } }) === 'SUSPECT',
        'Engineering Status: 1 distinct parameter breach (repeated across timepoints) -> SUSPECT'
      );
      check(
        engineeringStatus({ iddq: [2.0, 4.5], leakage: [0.38, 2.0] }, { iddq: { limitValue: 4.0 }, leakage: { limitValue: 1.5 } }) === 'CRITICAL',
        'Engineering Status: 2+ distinct parameter breaches -> CRITICAL'
      );

      // 7. AI Status Aggregation
      check(overallStatus(['FLAGGED', 'NOT_EVALUATED']) === 'FLAGGED', 'AI Status: FLAGGED + NOT_EVALUATED -> FLAGGED');
      check(overallStatus(['NOT FLAGGED', 'NOT_EVALUATED']) === 'NOT FLAGGED', 'AI Status: NOT FLAGGED + NOT_EVALUATED -> NOT FLAGGED');
      check(overallStatus(['NOT_EVALUATED', 'NOT_EVALUATED']) === 'NOT_EVALUATED', 'AI Status: Both NOT_EVALUATED -> NOT_EVALUATED');

      // 8. Current Yield Calculation
      const sampleLot = [
        { engineeringStatus: 'NORMAL' },
        { engineeringStatus: 'NORMAL' },
        { engineeringStatus: 'NORMAL' },
        { engineeringStatus: 'NORMAL' },
        { engineeringStatus: 'NORMAL' },
        { engineeringStatus: 'SUSPECT' },
        { engineeringStatus: 'SUSPECT' },
        { engineeringStatus: 'SUSPECT' },
        { engineeringStatus: 'SUSPECT' },
        { engineeringStatus: 'CRITICAL' },
        { engineeringStatus: 'CRITICAL' },
        { engineeringStatus: 'CRITICAL' },
      ];
      const y = currentYield(sampleLot);
      check(Number(y.toFixed(2)) === 41.67, 'Current Yield: 5 NORMAL out of 12 eligible -> 41.67% dynamically computed');

      console.log(`\n==================================================`);
      console.log(`STEP 7 E2E INTEGRATION RESULTS: ${passed}/${total} TESTS PASSED`);
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
