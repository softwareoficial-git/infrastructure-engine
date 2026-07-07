const http = require('http');

const TOKEN = 'ADMIN_SECRET_TOKEN_2026';
const URL = 'http://localhost:3001/execute';

async function request(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ token: TOKEN, command, payload });
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/execute',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + body));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

async function stressTest() {
  try {
    console.log('🚀 STARTING STRESS TEST: 5 CLIENTS x 1000 PRODUCTS');
    console.log('====================================================');

    // 1. Ensure a published template exists
    const tCreate = await request('APP:template-create', {
      nombre: 'Stress Template',
      contenido: { stock: [], precios: {} },
    });
    const templateId = tCreate.data.template.id;
    await request('APP:template-publish', { templateId });
    console.log('✅ Published base template.');

    const clientIds = [];

    // 2. Create 5 Clients and populate with 1000 products each
    for (let i = 1; i <= 5; i++) {
      process.stdout.write(`Creating Client ${i}/5... `);
      const cCreate = await request('APP:client-create', { nombre: `StressClient_${i}` });
      const cid = cCreate.data.cliente.id;
      clientIds.push(cid);

      // Generate 1000 products
      const stock = [];
      const prices = {};
      for (let j = 1; j <= 1000; j++) {
        stock.push({ id: j, name: `Product_${j}`, qty: Math.floor(Math.random() * 100) });
        prices[j] = Math.floor(Math.random() * 1000);
      }

      await request('USER:write', { clienteId: cid, data: { stock, prices } });
      console.log(`Done (ID: ${cid})`);
    }

    console.log('\n✅ Data Population Complete. 5,000 products in DB.');
    console.log('--- Starting Simultaneous Random Reads ---');

    // 3. Simultaneous Random Requests
    const NUM_REQUESTS = 100;
    const start = Date.now();

    const requests = [];
    for (let r = 0; r < NUM_REQUESTS; r++) {
      const randomClientId = clientIds[Math.floor(Math.random() * clientIds.length)];
      requests.push(request('USER:read', { clienteId: randomClientId }));
    }

    const results = await Promise.all(requests);
    const end = Date.now();

    const successCount = results.filter((r) => r.status === 'success').length;
    console.log('\nRESULTS:');
    console.log(`- Total Requests: ${NUM_REQUESTS}`);
    console.log(`- Successful: ${successCount}`);
    console.log(`- Failed: ${NUM_REQUESTS - successCount}`);
    console.log(`- Total Time: ${end - start}ms`);
    console.log(`- Avg Response Time: ${(end - start) / NUM_REQUESTS}ms`);
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Stress Test Failed:', error.message);
  }
}

stressTest();
