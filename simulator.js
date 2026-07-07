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

async function runSimulation() {
  try {
    console.log('🚀 Starting Business Simulation via Node.js Client...');
    console.log('====================================================');

    // 1. Template
    console.log('Step 1: Creating Retail Template...');
    const tCreate = await request('APP:template-create', {
      nombre: 'Retail Base',
      contenido: { stock: [], precios: {} },
    });
    const templateId = tCreate.data.template.id;
    console.log(`✅ Template created. ID: ${templateId}`);

    await request('APP:template-publish', { templateId });
    console.log('✅ Template published.');

    // 2. Client
    console.log('\nStep 2: Creating TechStore...');
    const cCreate = await request('APP:client-create', { nombre: 'TechStore' });
    const clientId = cCreate.data.cliente.id;
    console.log(`✅ Client created. ID: ${clientId}`);

    // 3. Users
    console.log('\nStep 3: Creating Personnel...');
    await request('CLIENT:user-create', {
      username: 'manager',
      password: 'pass123',
      role_id: 2,
      clienteId: clientId,
    });
    await request('CLIENT:user-create', {
      username: 'seller',
      password: 'pass123',
      role_id: 4,
      clienteId: clientId,
    });
    console.log('✅ Admin and Seller created.');

    // 4. Stock
    console.log('\nStep 4: Loading Inventory...');
    const stockInit = {
      stock: [
        { id: 1, name: 'Laptop', qty: 10 },
        { id: 2, name: 'Mouse', qty: 50 },
      ],
      precios: { 1: 1200, 2: 25 },
    };
    await request('USER:write', { clienteId: clientId, data: stockInit });
    console.log('✅ Stock loaded.');

    // 5. Sale
    console.log('\nStep 5: Processing Sale (2 Laptops)...');
    const current = await request('USER:read', { clienteId: clientId });
    const currentStock = current.data;

    // Business logic on client side
    currentStock.stock[0].qty -= 2;

    await request('USER:write', { clienteId: clientId, data: currentStock });
    console.log('✅ Sale processed. Stock updated.');

    // Final Audit
    console.log('\n--- FINAL AUDIT (State of Client) ---');
    const final = await request('USER:read', { clienteId: clientId });
    console.log(JSON.stringify(final.data, null, 2));

    console.log('====================================================');
  } catch (error) {
    console.error('❌ Simulation Failed:', error.message);
  }
}

runSimulation();
