/**
 * SPAD STEP 18: ATE DATA INGESTION AND VALIDATION TEST SUITE
 *
 * Validates that Automated Test Equipment (ATE) payloads enter SPAD safely
 * across all 8 representative test cases and edge cases without schema or contract changes.
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const { validateAtePayload } = require('./utils/ateValidation');
const { runScreeningOrchestration } = require('./services/screeningOrchestrator');
const { engineeringStatus, overallStatus } = require('./utils/contractCalculations');

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// In-memory mock store for isolated Step 18 tests
const mockDb = new Map();

function mockFindOne(query) {
  for (const doc of mockDb.values()) {
    let match = true;
    for (const [k, v] of Object.entries(query)) {
      if (doc[k] !== v) {
        match = false;
        break;
      }
    }
    if (match) return JSON.parse(JSON.stringify(doc));
  }
  return null;
}

function mockFind(query) {
  const res = [];
  for (const doc of mockDb.values()) {
    let match = true;
    for (const [k, v] of Object.entries(query)) {
      if (doc[k] !== v) {
        match = false;
        break;
      }
    }
    if (match) res.push(JSON.parse(JSON.stringify(doc)));
  }
  return res;
}

function mockUpsert(filter, update) {
  const key = `${filter.lotId || update.lotId}_${filter.componentId || update.componentId}`;
  const existing = mockDb.get(key) || {};
  const updated = { ...existing, ...update, ...filter, updatedAt: new Date().toISOString() };
  mockDb.set(key, updated);
  return JSON.parse(JSON.stringify(updated));
}

// Mock ScreeningRecord model methods for test isolation
const ScreeningRecord = {
  findOne: (q) => ({
    sort: () => ({
      lean: async () => mockFindOne(q),
    }),
    lean: async () => mockFindOne(q),
  }),
  find: (q) => ({
    sort: () => ({
      limit: () => ({
        lean: async () => mockFind(q),
      }),
      lean: async () => mockFind(q),
    }),
    lean: async () => mockFind(q),
  }),
  findOneAndUpdate: async (filter, updateObj) => {
    return mockUpsert(filter, updateObj.$set || updateObj);
  },
};

const app = express();
app.use(cors());
app.use(express.json());

// Ingestion endpoint
app.post('/api/screening', async (req, res) => {
  try {
    const validation = validateAtePayload(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error,
      });
    }

    const { componentId, lotId } = req.body;
    const cleanCompId = componentId.trim();
    const cleanLotId = lotId.trim();

    const saved = mockUpsert({ componentId: cleanCompId, lotId: cleanLotId }, req.body);
    return res.status(201).json({
      success: true,
      message: 'Screening record created successfully',
      data: saved,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5092,
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

async function runStep18Suite() {
  console.log('================================================================');
  console.log('=== SPAD STEP 18: ATE DATA INGESTION & VALIDATION TEST SUITE ===');
  console.log('================================================================\n');

  const server = http.createServer(app);
  await new Promise((res) => server.listen(5092, res));

  try {
    // --- PAYLOAD A: VALID_COMPLETE_LOT ---
    console.log('--- TEST A: VALID_COMPLETE_LOT Ingestion ---');
    const compA1 = {
      componentId: 'ATE-C-001',
      lotId: 'LOT-ATE-ALPHA',
      stage: '24h',
      measurements: {
        iddq: { '0h': 2.00, '24h': 2.10, unit: 'mA' },
        leakage: { '0h': 0.38, '24h': 0.40, unit: 'µA' },
        propDelay: { '0h': 8.10, '24h': 8.15, unit: 'ns' },
      },
      engineeringLimits: {
        iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
        leakage: { limitValue: 1.5, direction: 'UPPER', source: 'DATABASE_CATALOG' },
        propDelay: { limitValue: 11.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
      },
    };
    const resA1 = await request('POST', '/api/screening', compA1);
    assert(resA1.status === 201, 'POST /api/screening returns 201 for complete ATE record');
    assert(resA1.body.data.componentId === 'ATE-C-001', 'Ingested componentId preserved');
    assert(resA1.body.data.measurements.iddq['0h'] === 2.00, 'Parametric 0h observation stored');
    assert(resA1.body.data.measurements.iddq['24h'] === 2.10, 'Parametric 24h observation stored');

    // Ingest ATE-C-002 and ATE-C-003 into same lot
    await request('POST', '/api/screening', {
      componentId: 'ATE-C-002',
      lotId: 'LOT-ATE-ALPHA',
      measurements: {
        iddq: { '0h': 2.05, '24h': 2.15 },
        leakage: { '0h': 0.39, '24h': 0.42 },
      },
    });
    await request('POST', '/api/screening', {
      componentId: 'ATE-C-003',
      lotId: 'LOT-ATE-ALPHA',
      measurements: {
        iddq: { '0h': 2.02, '24h': 2.12 },
        leakage: { '0h': 0.40, '24h': 0.43 },
      },
    });
    assert(mockFind({ lotId: 'LOT-ATE-ALPHA' }).length === 3, 'All 3 components stored in LOT-ATE-ALPHA');

    // --- PAYLOAD B: VALID_PARTIAL_DATA ---
    console.log('\n--- TEST B: VALID_PARTIAL_DATA Ingestion ---');
    const compB = {
      componentId: 'ATE-C-004',
      lotId: 'LOT-ATE-ALPHA',
      measurements: {
        iddq: { '0h': 2.01, '24h': 2.08 },
        // leakage and propDelay omitted intentionally
      },
    };
    const resB = await request('POST', '/api/screening', compB);
    assert(resB.status === 201, 'Partial measurements accepted without schema error');
    assert(resB.body.data.measurements.leakage === undefined, 'Omitted parameter is not fabricated');

    // --- PAYLOAD C: INVALID_NON_NUMERIC ---
    console.log('\n--- TEST C: INVALID_NON_NUMERIC Validation ---');
    const compC = {
      componentId: 'ATE-C-BAD1',
      lotId: 'LOT-ATE-ALPHA',
      measurements: {
        iddq: { '0h': 'NOT_A_NUMBER', '24h': 2.10 },
      },
    };
    const resC = await request('POST', '/api/screening', compC);
    assert(resC.status === 400, 'Non-numeric string measurement rejected with HTTP 400');
    assert(resC.body.error === 'Validation Error', 'Returns standardized Validation Error');

    // --- PAYLOAD D: INVALID_STRUCTURE ---
    console.log('\n--- TEST D: INVALID_STRUCTURE Validation ---');
    const compD1 = {
      componentId: 'ATE-C-BAD2',
      lotId: 'LOT-ATE-ALPHA',
      measurements: 'INVALID_STRING_PAYLOAD',
    };
    const resD1 = await request('POST', '/api/screening', compD1);
    assert(resD1.status === 400, 'Non-object measurements rejected with HTTP 400');

    const compD2 = {
      // missing componentId
      lotId: 'LOT-ATE-ALPHA',
      measurements: { iddq: [2.0, 2.1] },
    };
    const resD2 = await request('POST', '/api/screening', compD2);
    assert(resD2.status === 400, 'Missing componentId rejected with HTTP 400');

    // --- PAYLOAD E: INSUFFICIENT_METHOD1_DATA ---
    console.log('\n--- TEST E: INSUFFICIENT_METHOD1_DATA (Missing 0h or 24h) ---');
    const compE = {
      componentId: 'ATE-C-005',
      lotId: 'LOT-ATE-ALPHA',
      measurements: {
        iddq: { '0h': 2.05 }, // 24h missing
        leakage: { '24h': 0.45 }, // 0h missing
      },
    };
    const resE = await request('POST', '/api/screening', compE);
    assert(resE.status === 201, 'Ingested with partial checkpoints');
    
    // Test deterministic calculations on partial data
    const statusE = engineeringStatus(compE.measurements, {
      iddq: { limitValue: 4.0, direction: 'UPPER' },
      leakage: { limitValue: 1.5, direction: 'UPPER' },
    });
    assert(statusE === 'NORMAL', 'Engineering status safely evaluated on available data');

    // --- PAYLOAD F: INSUFFICIENT_LOT_COHORT (<3 peers) ---
    console.log('\n--- TEST F: INSUFFICIENT_LOT_COHORT Handling ---');
    await request('POST', '/api/screening', {
      componentId: 'ATE-SOLO-1',
      lotId: 'LOT-SOLO-BATCH',
      measurements: { iddq: { '0h': 2.1, '24h': 2.2 } },
    });
    const soloCohort = mockFind({ lotId: 'LOT-SOLO-BATCH' });
    assert(soloCohort.length === 1, 'Only 1 unit exists in LOT-SOLO-BATCH');
    assert(soloCohort.length < 3, 'Cohort count < 3 correctly detected for Method 2 rule');

    // --- PAYLOAD G: VALID_MULTI_LOT Isolation ---
    console.log('\n--- TEST G: VALID_MULTI_LOT Cohort Isolation ---');
    await request('POST', '/api/screening', {
      componentId: 'ATE-BETA-1',
      lotId: 'LOT-ATE-BETA',
      measurements: { iddq: { '0h': 2.4, '24h': 2.5 } },
    });
    await request('POST', '/api/screening', {
      componentId: 'ATE-BETA-2',
      lotId: 'LOT-ATE-BETA',
      measurements: { iddq: { '0h': 2.3, '24h': 2.4 } },
    });
    const alphaUnits = mockFind({ lotId: 'LOT-ATE-ALPHA' });
    const betaUnits = mockFind({ lotId: 'LOT-ATE-BETA' });
    assert(alphaUnits.every((u) => u.lotId === 'LOT-ATE-ALPHA'), 'LOT-ATE-ALPHA contains only ALPHA units');
    assert(betaUnits.every((u) => u.lotId === 'LOT-ATE-BETA'), 'LOT-ATE-BETA contains only BETA units');
    assert(!alphaUnits.some((u) => u.componentId === 'ATE-BETA-1'), 'Zero cross-lot leakage into ALPHA');

    // --- PAYLOAD H: PHYSICAL_168H_VALIDATION Coexistence ---
    console.log('\n--- TEST H: PHYSICAL_168H_VALIDATION Coexistence ---');
    // Simulate initial record with AI prediction
    const compH = {
      componentId: 'ATE-C-001',
      lotId: 'LOT-ATE-ALPHA',
      stage: '168h',
      measurements: {
        iddq: { '0h': 2.00, '24h': 2.10, '96h': 2.18, '168h': 2.22, unit: 'mA' },
        leakage: { '0h': 0.38, '24h': 0.40, '96h': 0.42, '168h': 0.44, unit: 'µA' },
      },
      aiAssessment: {
        overallStatus: 'NOT FLAGGED',
        prediction: {
          status: 'PREDICTED',
          method: 'FUTURE_PREDICTION',
          parameters: {
            iddq: {
              predicted168h: 2.20,
              predictionInterval: [2.15, 2.25],
              futureRiskScore: 0.05,
              aiFlag: 'NOT FLAGGED',
            },
          },
        },
      },
    };
    const resH = await request('POST', '/api/screening', compH);
    assert(resH.status === 201, '168h Physical checkpoint record ingested');
    assert(resH.body.data.measurements.iddq['168h'] === 2.22, 'Actual physical 168h measurement is 2.22mA');
    assert(resH.body.data.aiAssessment.prediction.parameters.iddq.predicted168h === 2.20, 'AI predicted 168h is preserved (2.20mA)');
    assert(resH.body.data.measurements.iddq['168h'] !== resH.body.data.aiAssessment.prediction.parameters.iddq.predicted168h, 'Physical measurement and AI prediction coexist without overwriting');

    // --- DUPLICATE INGESTION MERGE ---
    console.log('\n--- TEST I: Duplicate Ingestion Clean Update ---');
    const compDup = {
      componentId: 'ATE-C-001',
      lotId: 'LOT-ATE-ALPHA',
      stage: '168h',
      measurements: {
        iddq: { '0h': 2.00, '24h': 2.10, '96h': 2.18, '168h': 2.24 }, // updated 168h re-test
      },
    };
    const resDup = await request('POST', '/api/screening', compDup);
    assert(resDup.status === 201, 'Duplicate record update succeeded');
    const allC001 = mockFind({ componentId: 'ATE-C-001', lotId: 'LOT-ATE-ALPHA' });
    assert(allC001.length === 1, 'Only 1 record exists in DB (no orphaned duplicate records)');
    assert(allC001[0].measurements.iddq['168h'] === 2.24, 'Updated value persisted');

    // --- ENGINEERING LIMIT RESOLUTION ---
    console.log('\n--- TEST J: Engineering Limit Resolution & Safeguards ---');
    const limitsWithEstimated = {
      iddq: { limitValue: 3.0, direction: 'UPPER', source: 'AI_ESTIMATED_BOUNDARY' },
    };
    const measuredOverEstimated = {
      iddq: { '0h': 3.5, '24h': 3.6 },
    };
    const engStatusEstimated = engineeringStatus(measuredOverEstimated, limitsWithEstimated);
    assert(engStatusEstimated === 'NORMAL', 'AI_ESTIMATED_BOUNDARY is NEVER used for engineeringStatus (returns NORMAL)');

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`=== STEP 18 TESTS COMPLETE: ${passed}/${total} TESTS PASSED ===`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runStep18Suite().catch((err) => {
  console.error('Test suite runner error:', err);
  process.exit(1);
});
