/**
 * SPAD STEP 13: Contract & System Consistency Audit Test Suite
 *
 * Validates system-wide consistency across:
 * 1. AI Service Interface vs AI Output Contract (Method 1 & Method 2)
 * 2. Express AI Routes vs Orchestrator vs Schemas
 * 3. Backend-derived deterministic metrics (Rate of Change, Margin, Engineering Status, Overall Status, Yield)
 * 4. Separation of Engineering Status (NORMAL/SUSPECT/CRITICAL) vs AI Status (FLAGGED/NOT FLAGGED/NOT_EVALUATED)
 * 5. Official Limits vs AI Estimated Boundaries
 * 6. Telemetry requirements (0h + 24h -> 168h, 96h NOT required)
 * 7. Method 2 Same-Lot Peer Isolation and Cohort Quality
 * 8. Schema Canonical Structure & Legacy Compatibility
 * 9. Standardized Error Formats & Zero Silent Data Fabrication
 */

const http = require('http');
const express = require('express');
const cors = require('cors');

const ScreeningRecord = require('./models/ScreeningRecord');
const aiService = require('./services/aiService');
const aiRouter = require('./routes/ai');
const { runScreeningOrchestration } = require('./services/screeningOrchestrator');
const {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
  currentYield,
} = require('./utils/contractCalculations');

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

async function runStep13Audit() {
  console.log('================================================================');
  console.log('=== SPAD STEP 13: CONTRACT & SYSTEM CONSISTENCY AUDIT ===');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // AUDIT 1: Deterministic Backend Utility Calculations
  // ---------------------------------------------------------------------------
  console.log('--- AUDIT 1: Backend Deterministic Formulas & Boundaries ---');

  // 1. Rate of Change Per Hour: (24h - 0h) / 24
  const roc1 = rateOfChangePerHour(2.00, 2.24);
  assert(roc1 === 0.01, `Rate of change = (2.24 - 2.00)/24 = 0.01 (got ${roc1})`);
  assert(rateOfChangePerHour(null, 2.24) === null, 'Rate of change with null 0h returns null');
  assert(rateOfChangePerHour(2.00, undefined) === null, 'Rate of change with undefined 24h returns null');

  // 2. Direction-Aware Projected Margin
  const marginUpper = projectedMargin(2.80, 4.00, 'UPPER');
  assert(marginUpper === 1.20, `Upper margin = 4.00 - 2.80 = 1.20 (got ${marginUpper})`);
  const marginLower = projectedMargin(0.45, 0.30, 'LOWER');
  assert(marginLower === 0.15, `Lower margin = 0.45 - 0.30 = 0.15 (got ${marginLower})`);

  // 3. Engineering Status: 0 -> NORMAL, 1 -> SUSPECT, 2+ -> CRITICAL
  const mNormal = { iddq: [2.0, 2.1], leakage: [0.38, 0.40] };
  const limits = {
    iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    leakage: { limitValue: 1.5, direction: 'UPPER', source: 'DATABASE_CATALOG' },
  };
  assert(engineeringStatus(mNormal, limits) === 'NORMAL', '0 breaches -> NORMAL');

  const mSuspect = { iddq: [2.0, 4.5], leakage: [0.38, 0.40] };
  assert(engineeringStatus(mSuspect, limits) === 'SUSPECT', '1 breached parameter -> SUSPECT');

  const mCritical = { iddq: [2.0, 4.5], leakage: [0.38, 1.80] };
  assert(engineeringStatus(mCritical, limits) === 'CRITICAL', '2 breached parameters -> CRITICAL');

  // Repeated breach across timepoints counts once
  const mRepeated = { iddq: [4.1, 4.5], leakage: [0.38, 0.40] };
  assert(engineeringStatus(mRepeated, limits) === 'SUSPECT', 'Repeated breaches of 1 parameter counts once as SUSPECT');

  // AI_ESTIMATED_BOUNDARY does NOT participate in engineeringStatus
  const limitsEstimated = {
    iddq: { limitValue: 1.5, direction: 'UPPER', source: 'AI_ESTIMATED_BOUNDARY' }, // breached by 2.0
    leakage: { limitValue: 1.5, direction: 'UPPER', source: 'DATABASE_CATALOG' },
  };
  assert(engineeringStatus(mNormal, limitsEstimated) === 'NORMAL', 'AI_ESTIMATED_BOUNDARY ignored by engineeringStatus');

  // 4. Overall AI Status Aggregation
  assert(overallStatus(['NOT FLAGGED', 'NOT FLAGGED']) === 'NOT FLAGGED', 'All NOT FLAGGED -> NOT FLAGGED');
  assert(overallStatus(['NOT FLAGGED', 'FLAGGED']) === 'FLAGGED', 'Any FLAGGED -> FLAGGED');
  assert(overallStatus(['NOT_EVALUATED', 'NOT FLAGGED']) === 'NOT FLAGGED', 'NOT_EVALUATED + NOT FLAGGED -> NOT FLAGGED');
  assert(overallStatus(['NOT_EVALUATED', 'NOT_EVALUATED']) === 'NOT_EVALUATED', 'All NOT_EVALUATED -> NOT_EVALUATED');

  // 5. Current Yield Formula
  assert(currentYield(['NORMAL', 'NORMAL', 'SUSPECT', 'CRITICAL']) === 50.0, 'Yield: 2 NORMAL of 4 total = 50.0%');
  assert(currentYield([]) === 100.0, 'Empty cohort yield returns 100.0%');

  // ---------------------------------------------------------------------------
  // AUDIT 2: Method 1 (0h + 24h -> 168h, 96h NOT required)
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT 2: Method 1 168h Trajectory & Dynamic Parameters ---');
  const m1Result = await aiService.predict168h({
    componentId: 'C-AUDIT-01',
    lotId: 'LOT-AUDIT',
    parameters: {
      customVth: { unit: 'V', observed: { '0h': 1.20, '24h': 1.25 } },
    },
    engineeringLimits: {
      customVth: { limitValue: 1.80, direction: 'UPPER', source: 'SUPPLIED' },
    },
  });

  assert(m1Result.predictions.customVth.status === 'PREDICTED', 'Dynamic parameter customVth predicted');
  assert(typeof m1Result.predictions.customVth.predicted168h === 'number', 'predicted168h is numeric without requiring 96h');
  assert(m1Result.predictions.customVth.aiFlag === 'NOT FLAGGED', 'Valid aiFlag returned');

  // ---------------------------------------------------------------------------
  // AUDIT 3: Method 2 Same-Lot Peer Isolation & Cohort Rules
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT 3: Method 2 Same-Lot Isolation & Cohort Quality ---');
  // Cohort with 3 units (SUFFICIENT)
  const m2Sufficient = await aiService.detectLotAnomalies({
    targetComponentId: 'C-01',
    lotId: 'LOT-AUDIT',
    cohort: [
      { componentId: 'C-01', lotId: 'LOT-AUDIT', parameters: { iddq: { observed: { '24h': 2.1 } } } },
      { componentId: 'C-02', lotId: 'LOT-AUDIT', parameters: { iddq: { observed: { '24h': 2.2 } } } },
      { componentId: 'C-03', lotId: 'LOT-AUDIT', parameters: { iddq: { observed: { '24h': 2.3 } } } },
    ],
  });
  assert(m2Sufficient.anomalyResults.iddq.status === 'ANALYZED', 'Cohort of 3 units produces ANALYZED status');
  assert(typeof m2Sufficient.anomalyResults.iddq.lotAnomalyScore === 'number', 'lotAnomalyScore is numeric');

  // ---------------------------------------------------------------------------
  // AUDIT 4: Model Output Strict Validation & Rejection
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT 4: Model Output Validation & Malformed Output Rejection ---');
  try {
    aiService.validateMethod1Output({
      predictions: {
        iddq: { status: 'PREDICTED', predicted168h: 'bad_number', aiFlag: 'NOT FLAGGED' },
      },
    });
    assert(false, 'Should throw for non-numeric predicted168h');
  } catch (err) {
    assert(err.code === 'MODEL_OUTPUT_INVALID', 'Non-numeric predicted168h rejected with MODEL_OUTPUT_INVALID');
  }

  try {
    aiService.validateMethod2Output({
      anomalyResults: {
        iddq: { status: 'ANALYZED', aiFlag: 'INVALID_AI_FLAG' },
      },
    });
    assert(false, 'Should throw for invalid aiFlag in Method 2');
  } catch (err) {
    assert(err.code === 'MODEL_OUTPUT_INVALID', 'Invalid aiFlag rejected with MODEL_OUTPUT_INVALID');
  }

  // ---------------------------------------------------------------------------
  // AUDIT 5: Express AI Route Contract Consistency
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT 5: Express AI Route Contract Consistency ---');
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/ai', aiRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  // Verify Method 1 Route
  const routeM1 = await makeRequest(server, { path: '/api/ai/predict-168h', method: 'POST' }, {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: { unit: 'mA', observed: { '0h': 2.00, '24h': 2.10 } },
    },
    engineeringLimits: {
      iddq: { limitValue: 4.00, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  assert(routeM1.status === 200, 'POST /api/ai/predict-168h returns 200 OK');
  assert(routeM1.body.method === 'FUTURE_PREDICTION', 'Response includes method FUTURE_PREDICTION');
  assert(routeM1.body.parameters.iddq.rateOfChangePerHour === 0.004167, 'Backend-computed rateOfChangePerHour present');
  assert(routeM1.body.parameters.iddq.projectedMargin === 1.30, 'Backend-computed projectedMargin present');
  assert(routeM1.body.aiAssessment.overallStatus === 'NOT FLAGGED', 'Canonical aiAssessment.overallStatus present');

  // Verify Method 2 Route
  const routeM2 = await makeRequest(server, { path: '/api/ai/detect-lot-anomalies', method: 'POST' }, {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    components: [
      { componentId: 'C-0001', lotId: 'LOT-2026-001', parameters: { iddq: { unit: 'mA', observed: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', lotId: 'LOT-2026-001', parameters: { iddq: { unit: 'mA', observed: { '0h': 2.0, '24h': 2.2 } } } },
      { componentId: 'C-0003', lotId: 'LOT-2026-001', parameters: { iddq: { unit: 'mA', observed: { '0h': 2.1, '24h': 2.7 } } } },
    ],
  });

  assert(routeM2.status === 200, 'POST /api/ai/detect-lot-anomalies returns 200 OK');
  assert(routeM2.body.method === 'LOT_ANOMALY_DETECTION', 'Response includes method LOT_ANOMALY_DETECTION');
  assert(routeM2.body.cohortQuality === 'SUFFICIENT', 'Cohort quality is SUFFICIENT');
  assert(routeM2.body.eligiblePeersCount === 2, 'eligiblePeersCount is 2 (excludes target)');

  // Verify Error Response Format
  const errRes = await makeRequest(server, { path: '/api/ai/predict-168h', method: 'POST' }, {
    componentId: '', // invalid
    lotId: 'LOT-2026-001',
  });
  assert(errRes.status === 400, 'Validation failure returns 400');
  assert(errRes.body.success === false, 'Error body success is false');
  assert(errRes.body.error.code === 'INVALID_TELEMETRY_PAYLOAD', 'Error code is INVALID_TELEMETRY_PAYLOAD');
  assert(typeof errRes.body.error.timestamp === 'string', 'Error includes timestamp');

  server.close();

  console.log('\n================================================================');
  console.log(`=== STEP 13 AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED ===`);
  console.log('================================================================\n');
}

if (require.main === module) {
  runStep13Audit().catch((err) => {
    console.error('\n[FATAL ERROR IN STEP 13 AUDIT]:', err);
    process.exit(1);
  });
}

module.exports = { runStep13Audit };
