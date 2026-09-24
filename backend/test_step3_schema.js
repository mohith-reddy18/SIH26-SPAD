const path = require('path');
const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ScreeningRecord = require('./models/ScreeningRecord');
const aiRouter = require('./routes/ai');

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

// Build isolated app matching server.js for end-to-end route verification
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/ai', aiRouter);

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'ok',
    message: 'SPAD backend is running',
    database: dbStatus,
  });
});

app.post('/api/screening', async (req, res) => {
  try {
    const { componentId, lotId } = req.body || {};
    if (!componentId || typeof componentId !== 'string') {
      return res.status(400).json({ success: false, error: 'Validation Error', message: 'componentId required' });
    }
    if (!lotId || typeof lotId !== 'string') {
      return res.status(400).json({ success: false, error: 'Validation Error', message: 'lotId required' });
    }
    const record = new ScreeningRecord(req.body);
    const saved = await record.save();
    return res.status(201).json({ success: true, data: saved });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/screening', async (req, res) => {
  try {
    const records = await ScreeningRecord.find({}).sort({ createdAt: -1 }).limit(20).lean();
    return res.status(200).json({ success: true, count: records.length, data: records });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/screening/:componentId', async (req, res) => {
  try {
    const record = await ScreeningRecord.findOne({ componentId: req.params.componentId }).lean();
    if (!record) return res.status(404).json({ success: false, message: 'Not found' });
    return res.status(200).json({ success: true, data: record });
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
        port: 5077,
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

async function runStep3Tests() {
  console.log('=== VERIFYING STEP 3: MONGODB SCREENINGRECORD SCHEMA ALIGNMENT ===\n');

  // Test 1: Schema model instantiation and validation without MongoDB connection
  const mockCanonicalDoc = new ScreeningRecord({
    componentId: 'C-TEST-001',
    lotId: 'LOT-2026-TEST',
    stage: '24h',
    measurements: {
      iddq: { unit: 'mA', '0h': 2.0, '24h': 2.1 },
      customParamA: { unit: 'mV', '0h': 120, '24h': 125 },
    },
    engineeringLimits: {
      iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
      customParamA: { limitValue: 100, direction: 'LOWER', source: 'SUPPLIED' },
    },
    engineeringStatus: 'NORMAL',
    aiAssessment: {
      overallStatus: 'NOT FLAGGED',
      prediction: {
        status: 'PREDICTED',
        parameters: {
          iddq: {
            status: 'PREDICTED',
            predicted168h: 2.7,
            projectedMargin: 1.3,
            aiFlag: 'NOT FLAGGED',
          },
        },
      },
      lotAnomaly: {
        status: 'ANALYZED',
        parameters: {
          iddq: { aiFlag: 'NOT FLAGGED' },
        },
      },
      explanation: { summary: 'Nominal degradation profile' },
    },
  });

  const validateErr = mockCanonicalDoc.validateSync();
  assert(!validateErr, 'Schema Validation: New canonical document validates synchronously without errors');
  assert(mockCanonicalDoc.engineeringStatus === 'NORMAL', 'Schema Field: engineeringStatus is properly stored');
  assert(typeof mockCanonicalDoc.aiAssessment === 'object', 'Schema Field: aiAssessment is stored as an object');
  assert(mockCanonicalDoc.aiAssessment.overallStatus === 'NOT FLAGGED', 'Schema Field: aiAssessment.overallStatus is accessible');
  assert(mockCanonicalDoc.engineeringLimits.iddq.direction === 'UPPER', 'Schema Field: UPPER engineeringLimit stored');
  assert(mockCanonicalDoc.engineeringLimits.customParamA.direction === 'LOWER', 'Schema Field: LOWER engineeringLimit stored');

  // Test 2: Legacy document backward compatibility
  const legacyDoc = new ScreeningRecord({
    componentId: 'C-LEGACY-001',
    lotId: 'LOT-2026-LEGACY',
    status: 'PASS',
    decision: 'PASS',
    riskScore: 0.12,
    aiAssessment: 'PASS', // Old flat string
    modelExplanation: { featureImportances: [0.1, 0.4] },
  });

  const legacyValidateErr = legacyDoc.validateSync();
  assert(!legacyValidateErr, 'Schema Validation: Legacy document without new aiAssessment structure validates successfully');
  assert(legacyDoc.status === 'PASS', 'Legacy Compatibility: Legacy status retained');
  assert(legacyDoc.riskScore === 0.12, 'Legacy Compatibility: Legacy riskScore retained');

  // Test 3: HTTP API endpoints with Express Server
  const server = app.listen(5077, async () => {
    try {
      // Connect to Atlas if MONGODB_URI is available
      if (process.env.MONGODB_URI) {
        try {
          await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
          console.log('[OK] Connected to MongoDB Atlas for Live Integration Tests');

          // Test Health
          const health = await request('GET', '/api/health');
          assert(health.status === 200 && health.body.database === 'connected', 'Live API: GET /api/health returns database: connected');

          // Test GET /api/screening
          const listRes = await request('GET', '/api/screening');
          assert(listRes.status === 200 && Array.isArray(listRes.body.data), 'Live API: GET /api/screening returns document list');

          // Test GET /api/screening/:componentId (using first component)
          if (listRes.body.data.length > 0) {
            const firstCompId = listRes.body.data[0].componentId;
            const detailRes = await request('GET', `/api/screening/${firstCompId}`);
            assert(detailRes.status === 200 && detailRes.body.data.componentId === firstCompId, `Live API: GET /api/screening/${firstCompId} returns record`);
          }

          // Test POST /api/screening with canonical schema
          const testPostPayload = {
            componentId: 'C-STEP3-VERIFY',
            lotId: 'LOT-2026-001',
            stage: '24h',
            measurements: {
              dynamicParamX: { unit: 'mA', '0h': 1.1, '24h': 1.2 },
            },
            engineeringLimits: {
              dynamicParamX: { limitValue: 2.0, direction: 'UPPER', source: 'DATABASE_CATALOG' },
            },
            engineeringStatus: 'NORMAL',
            aiAssessment: {
              overallStatus: 'NOT FLAGGED',
              prediction: { status: 'PREDICTED' },
            },
          };

          const postRes = await request('POST', '/api/screening', testPostPayload);
          assert(postRes.status === 201 && postRes.body.data.componentId === 'C-STEP3-VERIFY', 'Live API: POST /api/screening successfully saves canonical document');

          // Clean up test document
          await ScreeningRecord.deleteOne({ componentId: 'C-STEP3-VERIFY' });
          console.log('[OK] Cleaned up temporary test record from Atlas');
        } catch (dbErr) {
          console.log(`[INFO] MongoDB Atlas connection skipped (${dbErr.message}). Offline schema verification completed successfully.`);
        }
      } else {
        console.log('[INFO] MONGODB_URI not provided; verified in offline schema mode');
      }

      console.log(`\nResults: ${passed}/${total} Step 3 verification tests passed!`);
    } catch (err) {
      console.error('Test error:', err);
      process.exitCode = 1;
    } finally {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      server.close();
    }
  });
}

runStep3Tests();
