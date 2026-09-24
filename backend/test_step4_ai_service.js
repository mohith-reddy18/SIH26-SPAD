const http = require('http');
const express = require('express');
const cors = require('cors');
const aiRouter = require('./routes/ai');
const aiService = require('./services/aiService');

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
        port: 5066,
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

async function runStep4Tests() {
  console.log('=== VERIFYING STEP 4: AI MODEL INTERFACE & ENDPOINT INTEGRATION ===\n');

  // 1. Direct aiService Unit Tests
  console.log('--- 1. Testing aiService directly ---');
  const servicePred = aiService.predict168h({
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: { observed: { '0h': 2.0, '24h': 2.4 } },
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER' },
    },
  });

  assert(servicePred.componentId === 'C-0001', 'aiService.predict168h: Preserves componentId');
  assert(servicePred.predictions.iddq.status === 'PREDICTED', 'aiService.predict168h: Returns status PREDICTED');
  assert(typeof servicePred.predictions.iddq.predicted168h === 'number', 'aiService.predict168h: Returns numeric predicted168h');
  assert(servicePred.predictions.iddq.predictionInterval === null, 'aiService.predict168h: Uncalibrated predictionInterval is null');
  assert(servicePred.predictions.iddq.futureRiskPercent === null, 'aiService.predict168h: Uncalibrated futureRiskPercent is null');

  const serviceAnomaly = aiService.detectLotAnomalies({
    targetComponentId: 'C-0001',
    lotId: 'LOT-2026-001',
    cohort: [
      { componentId: 'C-0001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.12 } } } },
      { componentId: 'C-0003', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.11 } } } },
    ],
  });

  assert(serviceAnomaly.targetComponentId === 'C-0001', 'aiService.detectLotAnomalies: Preserves targetComponentId');
  assert(serviceAnomaly.anomalyResults.iddq.status === 'ANALYZED', 'aiService.detectLotAnomalies: Returns status ANALYZED');
  assert(typeof serviceAnomaly.anomalyResults.iddq.lotAnomalyScore === 'number', 'aiService.detectLotAnomalies: Returns numeric lotAnomalyScore');
  assert(serviceAnomaly.anomalyResults.iddq.peerComparisonEvidence.peerCount === 2, 'aiService.detectLotAnomalies: Peer count excludes target');

  // 2. HTTP Endpoint Integration via aiRouter
  console.log('\n--- 2. Testing HTTP Endpoints via aiRouter ---');

  // Method 1 HTTP Integration
  const m1Res = await request('POST', '/api/ai/predict-168h', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: {
        unit: 'mA',
        observed: { '0h': 2.0, '24h': 2.4 },
      },
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
    },
  });

  assert(m1Res.status === 200, 'HTTP Method 1: Responds with 200 OK');
  assert(m1Res.body.method === 'FUTURE_PREDICTION', 'HTTP Method 1: Returns FUTURE_PREDICTION');
  assert(m1Res.body.parameters.iddq.rateOfChangePerHour !== undefined, 'HTTP Method 1: rateOfChangePerHour integrated by backend');
  assert(m1Res.body.parameters.iddq.projectedMargin !== undefined, 'HTTP Method 1: projectedMargin integrated by backend');
  assert(m1Res.body.aiAssessment.overallStatus !== undefined, 'HTTP Method 1: overallStatus integrated by backend');

  // Method 2 HTTP Integration (Sufficient Cohort)
  const m2Res = await request('POST', '/api/ai/detect-lot-anomalies', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    components: [
      { componentId: 'C-0001', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.12 } } } },
      { componentId: 'C-0003', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.11 } } } },
    ],
  });

  assert(m2Res.status === 200, 'HTTP Method 2: Responds with 200 OK');
  assert(m2Res.body.cohortQuality === 'SUFFICIENT', 'HTTP Method 2: cohortQuality is SUFFICIENT');
  assert(m2Res.body.componentsAnalyzed === 3, 'HTTP Method 2: componentsAnalyzed includes target (3)');
  assert(m2Res.body.eligiblePeersCount === 2, 'HTTP Method 2: eligiblePeersCount excludes target (2)');
  assert(m2Res.body.parameters.iddq.status === 'ANALYZED', 'HTTP Method 2: iddq status is ANALYZED');

  // Method 2 HTTP Integration (Insufficient Cohort < 3)
  const m2Insufficient = await request('POST', '/api/ai/detect-lot-anomalies', {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    components: [
      { componentId: 'C-0001', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', lotId: 'LOT-2026-001', parameters: { iddq: { observed: { '0h': 2.0, '24h': 2.12 } } } },
    ],
  });

  assert(m2Insufficient.status === 200, 'HTTP Method 2: Insufficient cohort responds with 200 OK');
  assert(m2Insufficient.body.cohortQuality === 'INSUFFICIENT', 'HTTP Method 2: cohortQuality is INSUFFICIENT');
  assert(m2Insufficient.body.aiStatus === 'NOT_EVALUATED', 'HTTP Method 2: aiStatus is NOT_EVALUATED');
  assert(m2Insufficient.body.parameters.iddq.status === 'INSUFFICIENT_COHORT', 'HTTP Method 2: parameter status is INSUFFICIENT_COHORT');

  console.log(`\nResults: ${passed}/${total} Step 4 verification tests passed!`);
}

const server = app.listen(5066, async () => {
  try {
    await runStep4Tests();
  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
