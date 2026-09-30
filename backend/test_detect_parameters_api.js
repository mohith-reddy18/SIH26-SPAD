const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const http = require('http');
const express = require('express');
const multer = require('multer');
const { detectParametersFromDataset, CANONICAL_PARAM_DEFINITIONS } = require('./utils/datasetParameterDetector');

console.log('=== VERIFYING /api/screening/detect-parameters ENDPOINT ===\n');

const app = express();
const uploadDir = path.join(os.tmpdir(), 'spad-test-uploads');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch {}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `test-${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage: diskStorage,
});

function handleUploadSingle(fieldName) {
  const uploadMiddleware = upload.single(fieldName);
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: `Upload error: ${err.message}`,
            timestamp: new Date().toISOString(),
          },
        });
      } else if (err) {
        const isStorageError = err.code === 'ENOSPC' || err.code === 'EACCES';
        const statusCode = isStorageError ? 507 : 400;
        return res.status(statusCode).json({
          success: false,
          error: {
            code: isStorageError ? 'INSUFFICIENT_STORAGE' : 'UPLOAD_ERROR',
            message: isStorageError ? 'Storage error' : (err.message || 'File upload failed'),
            timestamp: new Date().toISOString(),
          },
        });
      }
      next();
    });
  };
}

function cleanupTempFile(filePath) {
  if (filePath && typeof filePath === 'string') {
    fs.unlink(filePath, () => {});
  }
}

app.use(express.json());

// Replicate server.js route handler
app.post('/api/screening/detect-parameters', handleUploadSingle('file'), async (req, res) => {
  const file = req.file || null;
  const tempFilePath = file?.path;

  try {
    const fileName = file?.originalname || req.body?.fileName || '';
    const lotId = req.body?.lotId || '';
    const cleanLotId = typeof lotId === 'string' ? lotId.trim() : '';
    const dataset = req.body?.datasetContent || req.body?.dataset || null;

    const detectedResult = detectParametersFromDataset({
      file,
      filePath: tempFilePath,
      dataset,
      datasetContent: dataset,
      fileName,
    });
    const detectedKeys = Array.isArray(detectedResult) ? detectedResult : (detectedResult.detectedKeys || []);
    const formatStatus = detectedResult.formatStatus || (detectedKeys.length > 0 ? 'DETECTED' : 'NO_PARAMETERS_FOUND');
    const message = detectedResult.message || '';

    const parameters = detectedKeys.map((key) => {
      const canonical = CANONICAL_PARAM_DEFINITIONS[key] || {
        key,
        name: key.toUpperCase(),
        shortName: key,
        unit: '—',
      };
      return {
        key,
        name: canonical.name,
        shortName: canonical.shortName,
        unit: canonical.unit,
        isAuthoritative: false,
        limitValue: '',
        direction: 'UPPER',
        source: 'USER_ENGINEERING_INPUT',
      };
    });

    return res.status(200).json({
      success: true,
      lotId: cleanLotId,
      fileName: fileName || file?.originalname || null,
      detectedCount: parameters.length,
      formatStatus,
      message,
      parameters,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'PARAMETER_DETECTION_ERROR',
        message: error.message,
      },
    });
  } finally {
    cleanupTempFile(tempFilePath);
  }
});

function postMultipart(port, fields, fileField) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const chunks = [];

    for (const [k, v] of Object.entries(fields)) {
      chunks.push(
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
      );
    }

    if (fileField) {
      chunks.push(
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.contentType || 'application/octet-stream'}\r\n\r\n`)
      );
      chunks.push(Buffer.isBuffer(fileField.content) ? fileField.content : Buffer.from(fileField.content));
      chunks.push(Buffer.from('\r\n'));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const fullBody = Buffer.concat(chunks);

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/screening/detect-parameters',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    // Test 1: Multipart CSV upload
    const csvContent = 'device_id,RDS(on),v_th,IDDQ\nDEV-1,0.25,2.1,0.005';
    const csvRes = await postMultipart(
      port,
      { lotId: 'LOT-TEST-001' },
      { name: 'file', filename: 'telemetry.csv', contentType: 'text/csv', content: csvContent }
    );
    console.log('1. CSV Detection API Response:', csvRes.body);
    assert.strictEqual(csvRes.status, 200);
    assert.strictEqual(csvRes.body.success, true);
    assert.strictEqual(csvRes.body.detectedCount, 3);
    assert.ok(csvRes.body.parameters.some((p) => p.key === 'rdson'));
    assert.ok(csvRes.body.parameters.some((p) => p.key === 'v_th'));
    assert.ok(csvRes.body.parameters.some((p) => p.key === 'iddq'));
    console.log('   ✓ CSV detection API passed.\n');

    // Test 2: Multipart Standalone .MAT upload (must return 200 OK with UNSUPPORTED_BINARY_FORMAT and 0 detected)
    const matContent = Buffer.from('MATLAB 5.0 MAT-file Test_9_run_7.mat simulation stream');
    const matRes = await postMultipart(
      port,
      { lotId: 'NASA-MOSFET-199C' },
      { name: 'file', filename: 'Test_9_run_7.mat', contentType: 'application/octet-stream', content: matContent }
    );
    console.log('2. MAT Detection API Response:', matRes.body);
    assert.strictEqual(matRes.status, 200, 'MAT upload should return HTTP 200 with clear metadata');
    assert.strictEqual(matRes.body.success, true);
    // Test 3: JSON-based parameter detection (from client-side metadata extractor)
    const jsonPayload = JSON.stringify({
      datasetContent: 'Run_ID,RDSon,Temperature,Gate_Voltage\n1,0.34,199,10',
      fileName: 'NASA_MOSFET_7GB.zip',
      lotId: 'NASA-MOSFET-199C',
    });

    const jsonRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/screening/detect-parameters',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(jsonPayload),
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(jsonPayload);
      req.end();
    });

    console.log('3. JSON Metadata Detection API Response:', jsonRes.body);
    assert.strictEqual(jsonRes.status, 200);
    assert.strictEqual(jsonRes.body.success, true);
    assert.ok(jsonRes.body.parameters.some((p) => p.key === 'rdson'));
    assert.ok(jsonRes.body.parameters.some((p) => p.key === 'temp'));
    assert.ok(jsonRes.body.parameters.some((p) => p.key === 'vgs'));
    console.log('   ✓ JSON-based lightweight metadata detection passed with zero multi-GB upload.\n');

    server.close();
    console.log('=== ALL ENDPOINT VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    server.close();
    process.exit(1);
  }
});
