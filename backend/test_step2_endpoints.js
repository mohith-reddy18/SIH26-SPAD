const http = require('http');
const express = require('express');
const cors = require('cors');
const aiRouter = require('./routes/ai');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/ai', aiRouter);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'SPAD backend is running' });
});

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

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5088,
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

async function runStep2Tests() {
  console.log('=== VERIFYING STEP 2: METHOD 1 & METHOD 2 ENDPOINTS ===\n');

  // --- HEALTH CHECK ---
  const healthRes = await request('GET', '/api/health');
  assert(healthRes.status === 200 && healthRes.body.status === 'ok', 'Health check responds with 200 OK');

  // --- METHOD 1 TESTS ---
  console.log('\n--- METHOD 1: POST /api/ai/predict-168h ---');

  // 1. Valid component with 0h + 24h
  const m1Valid = await request('POST', '/api/ai/predict-168h', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: {
        unit: 'mA',
        observed: { '0h': 2.0, '24h': 2.8 },
      },
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  assert(m1Valid.status === 200 && m1Valid.body.success === true, 'M1-1: Successful response for valid 0h + 24h telemetry');
  assert(m1Valid.body.method === 'FUTURE_PREDICTION', 'M1-1: Correct contract method identifier');
  assert(m1Valid.body.parameters.iddq.status === 'PREDICTED', 'M1-1: Parameter status is PREDICTED');
  assert(typeof m1Valid.body.parameters.iddq.predicted168h === 'number', 'M1-1: predicted168h is a number');
  assert(m1Valid.body.parameters.iddq.rateOfChangePerHour !== null, 'M1-1: rateOfChangePerHour is computed');

  // 2. Missing 24h -> validation error / insufficient data
  const m1Missing24h = await request('POST', '/api/ai/predict-168h', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: {
        unit: 'mA',
        observed: { '0h': 2.0 }, // missing 24h
      },
    },
  });
  assert(m1Missing24h.status === 400 && m1Missing24h.body.error.code === 'INSUFFICIENT_DATA', 'M1-2: Missing 24h returns 400 INSUFFICIENT_DATA');

  // 3. No engineering limit -> prediction works, margin/probability null
  const m1NoLimit = await request('POST', '/api/ai/predict-168h', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: {
        unit: 'mA',
        observed: { '0h': 2.0, '24h': 2.1 },
      },
    },
  });
  assert(m1NoLimit.status === 200, 'M1-3: Prediction works without engineering limit');
  assert(m1NoLimit.body.parameters.iddq.projectedMargin === null, 'M1-3: projectedMargin is null when no limit provided');
  assert(m1NoLimit.body.parameters.iddq.limitBreachProbability === null, 'M1-3: limitBreachProbability is null');

  // 4. UPPER limit -> limit - prediction
  const m1Upper = await request('POST', '/api/ai/predict-168h', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: {
        unit: 'mA',
        observed: { '0h': 2.0, '24h': 2.4 }, // roc = 0.4/24 = 0.016666, pred168 = 2.4 + 0.4*6 = 4.8
      },
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER' },
    },
  });
  // limit 4.0 - pred 4.8 = -0.8
  assert(m1Upper.status === 200, 'M1-4: UPPER limit evaluated');
  assert(Math.abs(m1Upper.body.parameters.iddq.projectedMargin - (-0.8)) < 1e-4, `M1-4: projectedMargin is UPPER limit - prediction (${m1Upper.body.parameters.iddq.projectedMargin})`);

  // 5. LOWER limit -> prediction - limit
  const m1Lower = await request('POST', '/api/ai/predict-168h', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      voltage: {
        unit: 'V',
        observed: { '0h': 3.3, '24h': 3.1 }, // pred168 = 3.1 + (3.1-3.3)*6 = 1.9
      },
    },
    engineeringLimits: {
      voltage: { limitValue: 2.5, direction: 'LOWER' },
    },
  });
  // pred 1.9 - limit 2.5 = -0.6
  assert(m1Lower.status === 200, 'M1-5: LOWER limit evaluated');
  assert(Math.abs(m1Lower.body.parameters.iddq?.projectedMargin ?? m1Lower.body.parameters.voltage.projectedMargin - (-0.6)) < 1e-4, 'M1-5: projectedMargin is prediction - LOWER limit');

  // 6. 96h omitted -> endpoint still works
  const m1No96h = await request('POST', '/api/ai/predict-168h', {
    componentId: 'C-0002',
    lotId: 'LOT-2026-001',
    parameters: {
      leakage: {
        unit: 'uA',
        observed: { '0h': 0.4, '24h': 0.42 }, // no 96h
      },
    },
  });
  assert(m1No96h.status === 200 && m1No96h.body.parameters.leakage.status === 'PREDICTED', 'M1-6: 96h is NOT required for Method 1');

  // --- METHOD 2 TESTS ---
  console.log('\n--- METHOD 2: POST /api/ai/detect-lot-anomalies ---');

  // 1. 3 components in same lot -> evaluated
  const m2Cohort3 = await request('POST', '/api/ai/detect-lot-anomalies', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    components: [
      { componentId: 'C-0001', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.12 } } } },
      { componentId: 'C-0003', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.09 } } } },
    ],
  });
  assert(m2Cohort3.status === 200, 'M2-1: 3 same-lot components evaluated successfully');
  assert(m2Cohort3.body.cohortQuality === 'SUFFICIENT', 'M2-1: cohortQuality is SUFFICIENT');
  assert(m2Cohort3.body.componentsAnalyzed === 3, 'M2-1: componentsAnalyzed includes target (3)');
  assert(m2Cohort3.body.eligiblePeersCount === 2, 'M2-1: eligiblePeersCount excludes target (2)');
  assert(m2Cohort3.body.parameters.iddq.status === 'ANALYZED', 'M2-1: Parameter status is ANALYZED');

  // 2. 2 components -> INSUFFICIENT / NOT_EVALUATED
  const m2Cohort2 = await request('POST', '/api/ai/detect-lot-anomalies', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    components: [
      { componentId: 'C-0001', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.12 } } } },
    ],
  });
  assert(m2Cohort2.status === 200, 'M2-2: 2 components returns 200 OK with contract metadata');
  assert(m2Cohort2.body.cohortQuality === 'INSUFFICIENT', 'M2-2: cohortQuality is INSUFFICIENT');
  assert(m2Cohort2.body.aiStatus === 'NOT_EVALUATED', 'M2-2: aiStatus is NOT_EVALUATED');
  assert(m2Cohort2.body.parameters.iddq.status === 'INSUFFICIENT_COHORT', 'M2-2: Parameter status is INSUFFICIENT_COHORT');
  assert(m2Cohort2.body.parameters.iddq.aiFlag === 'NOT_EVALUATED', 'M2-2: aiFlag is NOT_EVALUATED');

  // 3. Components from another lot must not be used as peers
  const m2MultiLot = await request('POST', '/api/ai/detect-lot-anomalies', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    components: [
      { componentId: 'C-0001', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.12 } } } },
      { componentId: 'C-9999', lotId: 'OTHER-LOT-999', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.15 } } } }, // Different lot
    ],
  });
  // Only 2 in LOT-2026-001 -> should be INSUFFICIENT
  assert(m2MultiLot.body.componentsAnalyzed === 2, 'M2-3: Foreign lot component filtered out (componentsAnalyzed=2)');
  assert(m2MultiLot.body.cohortQuality === 'INSUFFICIENT', 'M2-3: Result is INSUFFICIENT when foreign lot excluded');

  // 4. Unsupported parameter -> UNSUPPORTED_PARAMETER / NOT_EVALUATED
  const m2UnsupportedParam = await request('POST', '/api/ai/detect-lot-anomalies', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    components: [
      { componentId: 'C-0001', lotId: 'LOT-2026-001', parameters: { propDelay: { observed: { '0h': 12.0 } } } }, // missing 24h
      { componentId: 'C-0002', lotId: 'LOT-2026-001', parameters: { propDelay: { observed: { '0h': 12.0, '24h': 12.2 } } } },
      { componentId: 'C-0003', lotId: 'LOT-2026-001', parameters: { propDelay: { observed: { '0h': 12.0, '24h': 12.1 } } } },
    ],
  });
  assert(m2UnsupportedParam.body.parameters.propDelay.status === 'UNSUPPORTED_PARAMETER', 'M2-4: Malformed parameter returns UNSUPPORTED_PARAMETER');
  assert(m2UnsupportedParam.body.parameters.propDelay.aiFlag === 'NOT_EVALUATED', 'M2-4: Unsupported parameter returns aiFlag NOT_EVALUATED');

  console.log(`\nResults: ${passed}/${total} Step 2 endpoint tests passed!`);
}

const server = app.listen(5088, async () => {
  try {
    await runStep2Tests();
  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
