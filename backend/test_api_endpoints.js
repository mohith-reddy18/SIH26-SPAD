const http = require('http');
const express = require('express');
const cors = require('cors');
const aiRouter = require('./routes/ai');

// Build isolated app for testing routes without interfering with main server
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/ai', aiRouter);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'SPAD backend is running' });
});

const server = app.listen(5099, async () => {
  console.log('Test server started on port 5099');
  try {
    await runTests();
  } catch (err) {
    console.error('Test run error:', err);
    process.exitCode = 1;
  } finally {
    server.close(() => {
      console.log('Test server stopped');
    });
  }
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5099,
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
          } catch (e) {
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

async function runTests() {
  console.log('\n--- 1. Testing GET /api/health ---');
  const healthRes = await request('GET', '/api/health');
  console.log('Health Response:', healthRes.status, healthRes.body);
  if (healthRes.status !== 200) throw new Error('Health check failed');

  console.log('\n--- 2. Testing POST /api/ai/predict-168h (Invalid Payload) ---');
  const m1Invalid = await request('POST', '/api/ai/predict-168h', {});
  console.log('Method 1 Invalid Response:', m1Invalid.status, m1Invalid.body);
  if (m1Invalid.status !== 400 || m1Invalid.body.errorCode !== 'INVALID_INPUT_SCHEMA') {
    throw new Error('Method 1 invalid payload validation failed');
  }

  console.log('\n--- 3. Testing POST /api/ai/predict-168h (Valid Payload -> AI Pending Placeholder) ---');
  const m1Valid = await request('POST', '/api/ai/predict-168h', {
    componentId: 'C-0004',
    lotId: 'LOT-2026-001',
    parameters: {
      iddq: {
        unit: 'mA',
        history: { '0h': 2.1, '24h': 2.45 },
        engineeringLimit: { upper: 3.0, lower: 0.5 },
      },
      leakage: {
        unit: 'uA',
        history: { '0h': 0.41, '24h': 0.58 },
        engineeringLimit: { upper: 0.8 },
      },
    },
    context: {
      chamberTempC: 125,
      voltageV: 1.8,
    },
  });
  console.log('Method 1 Valid Response:', m1Valid.status, m1Valid.body);
  if (m1Valid.status !== 503 || m1Valid.body.errorCode !== 'AI_SERVICE_NOT_CONNECTED') {
    throw new Error('Method 1 placeholder response failed');
  }

  console.log('\n--- 4. Testing POST /api/ai/detect-lot-anomalies (Invalid Payload) ---');
  const m2Invalid = await request('POST', '/api/ai/detect-lot-anomalies', { lotId: 'LOT-2026-001' });
  console.log('Method 2 Invalid Response:', m2Invalid.status, m2Invalid.body);
  if (m2Invalid.status !== 400 || m2Invalid.body.errorCode !== 'INVALID_INPUT_SCHEMA') {
    throw new Error('Method 2 invalid payload validation failed');
  }

  console.log('\n--- 5. Testing POST /api/ai/detect-lot-anomalies (Insufficient Cohort < 3) ---');
  const m2Insufficient = await request('POST', '/api/ai/detect-lot-anomalies', {
    lotId: 'LOT-2026-001',
    targetComponentId: 'C-0001',
    components: [
      { componentId: 'C-0001', parameters: { iddq: { history: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', parameters: { iddq: { history: { '0h': 2.0, '24h': 2.15 } } } },
    ],
  });
  console.log('Method 2 Insufficient Cohort Response:', m2Insufficient.status, m2Insufficient.body);
  if (m2Insufficient.body.cohortQuality !== 'INSUFFICIENT' || m2Insufficient.body.aiStatus !== 'NOT_EVALUATED') {
    throw new Error('Method 2 insufficient cohort check failed');
  }

  console.log('\n--- 6. Testing POST /api/ai/detect-lot-anomalies (Sufficient Cohort >= 3 -> AI Pending Placeholder) ---');
  const m2Sufficient = await request('POST', '/api/ai/detect-lot-anomalies', {
    lotId: 'LOT-2026-001',
    targetComponentId: 'C-0004',
    components: [
      { componentId: 'C-0001', parameters: { iddq: { history: { '0h': 2.0, '24h': 2.1 } } } },
      { componentId: 'C-0002', parameters: { iddq: { history: { '0h': 2.0, '24h': 2.15 } } } },
      { componentId: 'C-0003', parameters: { iddq: { history: { '0h': 2.05, '24h': 2.12 } } } },
      { componentId: 'C-0004', parameters: { iddq: { history: { '0h': 2.1, '24h': 2.45 } } } },
    ],
  });
  console.log('Method 2 Sufficient Cohort Response:', m2Sufficient.status, m2Sufficient.body);
  if (m2Sufficient.status !== 503 || m2Sufficient.body.errorCode !== 'AI_SERVICE_NOT_CONNECTED') {
    throw new Error('Method 2 placeholder response failed');
  }

  console.log('\nALL ENDPOINT TESTS PASSED SUCCESSFULLY!');
}
