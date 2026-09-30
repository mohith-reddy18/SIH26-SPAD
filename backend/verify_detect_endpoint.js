/**
 * Startup and route verification test for server.js
 */

const assert = require('assert');
const http = require('http');

console.log('Testing server.js startup and detect-parameters endpoint...');

// We spin up a child process running node server.js on an ephemeral port
const { spawn } = require('child_process');
const serverProc = spawn('C:\\college\\nodejs\\node.exe', ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: '5055' },
});

let serverStarted = false;

serverProc.stdout.on('data', (data) => {
  const str = data.toString();
  console.log('[SERVER STDOUT]:', str.trim());
  if (str.includes('running on port 5055')) {
    serverStarted = true;
    runTests();
  }
});

serverProc.stderr.on('data', (data) => {
  console.error('[SERVER STDERR]:', data.toString().trim());
});

serverProc.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

async function runTests() {
  try {
    console.log('\n1. Checking GET /api/health...');
    await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:5055/api/health', (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          assert.strictEqual(res.statusCode, 200);
          const json = JSON.parse(body);
          assert.strictEqual(json.status, 'ok');
          console.log('   ✓ Health check 200 OK:', json.message);
          resolve();
        });
      }).on('error', reject);
    });

    console.log('\n2. Checking POST /api/screening/detect-parameters with multipart form...');
    const boundary = '----TestBoundaryXYZ789';
    const csvContent = 'device_id,RDS(on),v_th,IDDQ\nDEV-001,0.25,2.1,0.005';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="lotId"',
      '',
      'LOT-2026-03A',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="telemetry.csv"',
      'Content-Type: text/csv',
      '',
      csvContent,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 5055,
        path: '/api/screening/detect-parameters',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${body}`);
          const json = JSON.parse(body);
          console.log('   ✓ Detect parameters response:', JSON.stringify(json, null, 2));
          assert.strictEqual(json.success, true);
          assert.strictEqual(json.detectedCount, 3);
          assert.ok(json.parameters.some((p) => p.key === 'rdson'));
          assert.ok(json.parameters.some((p) => p.key === 'v_th'));
          assert.ok(json.parameters.some((p) => p.key === 'iddq'));
          console.log('   ✓ Detected parameters matches expected parameters!\n');
          resolve();
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    console.log('=== ALL SERVER TESTS PASSED PERFECTLY ===');
    serverProc.kill();
    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err);
    serverProc.kill();
    process.exit(1);
  }
}

// Timeout protection
setTimeout(() => {
  if (!serverStarted) {
    console.error('Server startup timed out after 10s');
    serverProc.kill();
    process.exit(1);
  }
}, 10000);
