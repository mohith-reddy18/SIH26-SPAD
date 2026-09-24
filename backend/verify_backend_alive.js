const http = require('http');

function checkEndpoint(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:5000${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function verifyServer() {
  console.log('Testing live/local backend endpoints...');
  try {
    const health = await checkEndpoint('/api/health');
    console.log('[OK] /api/health responded with status:', health.status, health.body);
  } catch (err) {
    console.log('Local server on 5000 is not currently running or listening (normal if run standalone). Error:', err.message);
  }
}

verifyServer();
