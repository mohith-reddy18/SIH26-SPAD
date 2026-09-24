/**
 * SPAD — STEP 9: Backend Screening Orchestration Verification Test Suite
 */

const http = require('http');
const express = require('express');
const cors = require('cors');

const ScreeningRecord = require('./models/ScreeningRecord');
const { runScreeningOrchestration } = require('./services/screeningOrchestrator');
const aiRouter = require('./routes/ai');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/ai', aiRouter);

// In-memory test store
const store = new Map();

// Mock Mongoose model methods on ScreeningRecord for offline testing
ScreeningRecord.findOne = function (query) {
  return {
    lean: async () => {
      for (const doc of store.values()) {
        let match = true;
        if (query.componentId && doc.componentId !== query.componentId) match = false;
        if (query.lotId && doc.lotId !== query.lotId) match = false;
        if (match) return JSON.parse(JSON.stringify(doc));
      }
      return null;
    },
  };
};

ScreeningRecord.find = function (query) {
  return {
    sort: function () {
      return this;
    },
    limit: function () {
      return this;
    },
    lean: async () => {
      const results = [];
      for (const doc of store.values()) {
        let match = true;
        if (query && query.lotId && doc.lotId !== query.lotId) match = false;
        if (match) results.push(JSON.parse(JSON.stringify(doc)));
      }
      return results;
    },
  };
};

ScreeningRecord.findOneAndUpdate = async function (query, update, options) {
  const key = `${query.componentId}_${query.lotId}`;
  const existing = store.get(key) || {};
  const merged = { ...existing, ...update.$set };
  store.set(key, merged);
  return JSON.parse(JSON.stringify(merged));
};

// Mount routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'SPAD backend is running', database: 'in-memory-test' });
});

app.post('/api/screening/run', async (req, res) => {
  try {
    const { componentId, lotId, engineeringLimits, context } = req.body || {};
    const result = await runScreeningOrchestration({
      componentId,
      lotId,
      customLimits: engineeringLimits,
      context,
    });
    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred during screening orchestration',
        componentId: error.componentId || req.body?.componentId || null,
        lotId: error.lotId || req.body?.lotId || null,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

app.post('/api/screening', async (req, res) => {
  const { componentId, lotId } = req.body || {};
  if (!componentId || !lotId) {
    return res.status(400).json({ success: false, message: 'Missing componentId or lotId' });
  }
  const key = `${componentId}_${lotId}`;
  store.set(key, req.body);
  return res.status(201).json({ success: true, data: req.body });
});

app.get('/api/screening', async (req, res) => {
  const { lotId } = req.query;
  const docs = await ScreeningRecord.find({ lotId }).lean();
  return res.status(200).json({ success: true, count: docs.length, data: docs });
});

app.get('/api/screening/:componentId', async (req, res) => {
  const doc = await ScreeningRecord.findOne({ componentId: req.params.componentId }).lean();
  if (!doc) {
    return res.status(404).json({ success: false, message: 'Not Found' });
  }
  return res.status(200).json({ success: true, data: doc });
});

const TEST_PORT = 5097;
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

async function runStep9Tests() {
  console.log('=== SPAD STEP 9: SCREENING ORCHESTRATION TEST SUITE ===\n');

  // Seed test documents into in-memory store
  store.set('C-0001_LOT-2026-001', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    stage: '24h',
    measurements: {
      iddq: [2.00, 2.10],
      leakage: [0.38, 0.40],
      propDelay: [8.10, 8.14],
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
      leakage: { limitValue: 1.5, direction: 'UPPER', source: 'DATABASE_CATALOG' },
      propDelay: { limitValue: 11.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  store.set('C-0002_LOT-2026-001', {
    componentId: 'C-0002',
    lotId: 'LOT-2026-001',
    stage: '24h',
    measurements: {
      iddq: [2.00, 2.05],
      leakage: [0.38, 0.41],
      propDelay: [8.10, 8.12],
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  store.set('C-0003_LOT-2026-001', {
    componentId: 'C-0003',
    lotId: 'LOT-2026-001',
    stage: '24h',
    measurements: {
      iddq: [2.00, 2.12],
      leakage: [0.38, 0.42],
      propDelay: [8.10, 8.15],
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  // Small lot with only 2 units (C-SMALL-1, C-SMALL-2)
  store.set('C-SMALL-1_LOT-SMALL-002', {
    componentId: 'C-SMALL-1',
    lotId: 'LOT-SMALL-002',
    stage: '24h',
    measurements: {
      iddq: [2.00, 2.10],
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  store.set('C-SMALL-2_LOT-SMALL-002', {
    componentId: 'C-SMALL-2',
    lotId: 'LOT-SMALL-002',
    stage: '24h',
    measurements: {
      iddq: [2.00, 2.08],
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  // Suspect component (1 limit breach)
  store.set('C-SUSPECT-1_LOT-2026-001', {
    componentId: 'C-SUSPECT-1',
    lotId: 'LOT-2026-001',
    stage: '24h',
    measurements: {
      iddq: [2.00, 4.50], // breaches 4.0 limit
      leakage: [0.38, 0.40],
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
      leakage: { limitValue: 1.5, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  // Critical component (2 limit breaches)
  store.set('C-CRIT-1_LOT-2026-001', {
    componentId: 'C-CRIT-1',
    lotId: 'LOT-2026-001',
    stage: '24h',
    measurements: {
      iddq: [2.00, 4.50], // breach 1
      leakage: [0.38, 2.00], // breach 2
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
      leakage: { limitValue: 1.5, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  // Repeated breach of same parameter at multiple timepoints
  store.set('C-MULTI-BREACH_LOT-2026-001', {
    componentId: 'C-MULTI-BREACH',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.00, 4.20, 4.80], // breaches at 24h and 96h -> 1 parameter
      leakage: [0.38, 0.40, 0.42],
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
      leakage: { limitValue: 1.5, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  // No engineering limit available
  store.set('C-NOLIMIT_LOT-2026-001', {
    componentId: 'C-NOLIMIT',
    lotId: 'LOT-2026-001',
    stage: '24h',
    measurements: {
      raw_sensor: [100, 105],
    },
    engineeringLimits: {},
  });

  server = app.listen(TEST_PORT, async () => {
    try {
      // CASE 1: Valid component with 0h+24h in lot of 3+ units
      const res1 = await request('POST', '/api/screening/run', {
        componentId: 'C-0001',
        lotId: 'LOT-2026-001',
      });
      if (res1.status !== 200) {
        console.error('DEBUG RES1 ERROR:', JSON.stringify(res1.body));
      }
      check(res1.status === 200, 'CASE 1: Responds with 200 OK');
      check(res1.body.success === true, 'CASE 1: success is true');
      check(res1.body.data.componentId === 'C-0001', 'CASE 1: componentId preserved');
      check(res1.body.data.engineeringStatus === 'NORMAL', 'CASE 1: engineeringStatus is NORMAL');
      check(res1.body.data.aiAssessment.prediction.status === 'PREDICTED', 'CASE 1: Method 1 evaluated');
      check(res1.body.data.aiAssessment.lotAnomaly.cohortQuality === 'SUFFICIENT', 'CASE 1: Method 2 cohortQuality is SUFFICIENT');
      check(res1.body.data.aiAssessment.overallStatus === 'NOT FLAGGED', 'CASE 1: overallStatus is NOT FLAGGED');

      // CASE 2: Cohort < 3 units (partial evaluation, Method 2 = NOT_EVALUATED, no crash)
      const res2 = await request('POST', '/api/screening/run', {
        componentId: 'C-SMALL-1',
        lotId: 'LOT-SMALL-002',
      });
      check(res2.status === 200, 'CASE 2: Insufficient cohort responds with 200 OK (does not fail)');
      check(res2.body.data.aiAssessment.prediction.status === 'PREDICTED', 'CASE 2: Method 1 ran successfully');
      check(res2.body.data.aiAssessment.lotAnomaly.cohortQuality === 'INSUFFICIENT', 'CASE 2: Method 2 cohortQuality is INSUFFICIENT');
      check(res2.body.data.aiAssessment.overallStatus === 'NOT FLAGGED', 'CASE 2: Overall AI status aggregated properly');

      // CASE 3: 1 parameter exceeding limit -> SUSPECT
      const res3 = await request('POST', '/api/screening/run', {
        componentId: 'C-SUSPECT-1',
        lotId: 'LOT-2026-001',
      });
      check(res3.status === 200, 'CASE 3: Responds with 200 OK');
      check(res3.body.data.engineeringStatus === 'SUSPECT', 'CASE 3: engineeringStatus is SUSPECT for 1 breached parameter');

      // CASE 4: 2 distinct parameters exceeding limits -> CRITICAL
      const res4 = await request('POST', '/api/screening/run', {
        componentId: 'C-CRIT-1',
        lotId: 'LOT-2026-001',
      });
      check(res4.status === 200, 'CASE 4: Responds with 200 OK');
      check(res4.body.data.engineeringStatus === 'CRITICAL', 'CASE 4: engineeringStatus is CRITICAL for 2 breached parameters');

      // CASE 5: Repeated breach of same parameter counts once -> SUSPECT
      const res5 = await request('POST', '/api/screening/run', {
        componentId: 'C-MULTI-BREACH',
        lotId: 'LOT-2026-001',
      });
      check(res5.status === 200, 'CASE 5: Responds with 200 OK');
      check(res5.body.data.engineeringStatus === 'SUSPECT', 'CASE 5: Repeated breach of same parameter counts once as SUSPECT');

      // CASE 6: No engineering limit -> prediction runs, projectedMargin=null
      const res6 = await request('POST', '/api/screening/run', {
        componentId: 'C-NOLIMIT',
        lotId: 'LOT-2026-001',
      });
      check(res6.status === 200, 'CASE 6: Responds with 200 OK');
      check(res6.body.data.aiAssessment.prediction.parameters.raw_sensor.predicted168h !== null, 'CASE 6: Prediction still runs without limit');
      check(res6.body.data.aiAssessment.prediction.parameters.raw_sensor.projectedMargin === null, 'CASE 6: projectedMargin is null when no limit');
      check(res6.body.data.aiAssessment.prediction.parameters.raw_sensor.limitBreachProbability === null, 'CASE 6: limitBreachProbability is null');

      // CASE 7: Nonexistent component -> 404 NOT_FOUND
      const res7 = await request('POST', '/api/screening/run', {
        componentId: 'C-NONEXISTENT',
        lotId: 'LOT-2026-001',
      });
      check(res7.status === 404, 'CASE 7: Nonexistent component returns 404 NOT_FOUND');
      check(res7.body.success === false, 'CASE 7: success is false');
      check(res7.body.error.code === 'NOT_FOUND', 'CASE 7: error code is NOT_FOUND');

      // Existing API Regression Checks
      const healthRes = await request('GET', '/api/health');
      check(healthRes.status === 200, 'Regression: GET /api/health works');

      const getListRes = await request('GET', '/api/screening');
      check(getListRes.status === 200, 'Regression: GET /api/screening works');

      const getItemRes = await request('GET', '/api/screening/C-0001');
      check(getItemRes.status === 200, 'Regression: GET /api/screening/:id works');

      const postM1Res = await request('POST', '/api/ai/predict-168h', {
        componentId: 'C-0001',
        lotId: 'LOT-2026-001',
        parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } },
      });
      check(postM1Res.status === 200, 'Regression: POST /api/ai/predict-168h works');

      const postM2Res = await request('POST', '/api/ai/detect-lot-anomalies', {
        componentId: 'C-0001',
        lotId: 'LOT-2026-001',
        components: [
          { componentId: 'C-0001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
          { componentId: 'C-0002', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
          { componentId: 'C-0003', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
        ],
      });
      check(postM2Res.status === 200, 'Regression: POST /api/ai/detect-lot-anomalies works');

      console.log(`\n==================================================`);
      server.close(() => {
        process.exit(passed === total ? 0 : 1);
      });
    } catch (err) {
      console.error('Test execution error:', err);
      if (server) {
        server.close(() => process.exit(1));
      } else {
        process.exit(1);
      }
    }
  });
}

runStep9Tests();
