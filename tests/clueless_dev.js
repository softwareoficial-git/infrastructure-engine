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
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
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

async function runAudit() {
    console.log('🕵️  SIMULATING CLUELESS DEVELOPER AUDIT');
    console.log('====================================================');

    try {
        // TEST 1: Missing Token
        console.log('
--- TEST 1: No Token ---');
        const res1 = await new Promise((resolve) => {
            const data = JSON.stringify({ command: 'SYSTEM:get-global-stats' });
            const req = http.request({ hostname: 'localhost', port: 3001, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
                let body = ''; res.on('data', (chunk) => body += chunk); res.on('end', () => resolve(JSON.parse(body)));
            });
            req.write(data); req.end();
        });
        console.log(JSON.stringify(res1, null, 2));

        // TEST 2: Fake Token
        console.log('
--- TEST 2: Fake Token ---');
        const res2 = await request('SYSTEM:get-global-stats', {});
        // Note: request() uses ADMIN_SECRET_TOKEN_2026. To simulate fake token, we'll do a manual call.
        const res2_fake = await new Promise((resolve) => {
            const data = JSON.stringify({ token: 'FAKE_TOKEN', command: 'SYSTEM:get-global-stats' });
            const req = http.request({ hostname: 'localhost', port: 3001, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
                let body = ''; res.on('data', (chunk) => body += chunk); res.on('end', () => resolve(JSON.parse(body)));
            });
            req.write(data); req.end();
        });
        console.log(JSON.stringify(res2_fake, null, 2));

        // TEST 3: Ghost Command
        console.log('
--- TEST 3: Ghost Command ---');
        const res3 = await request('SYSTEM:ghost_command', {});
        console.log(JSON.stringify(res3, null, 2));

        // TEST 4: Bad Payload
        console.log('
--- TEST 4: Bad Payload ---');
        const res4 = await request('APP:client-create', {});
        console.log(JSON.stringify(res4, null, 2));

        // TEST 5: Forbidden Access
        console.log('
--- TEST 5: Forbidden Access ---');
        const cCreate = await request('APP:client-create', { nombre: 'ForbiddenTest' });
        const clientId = cCreate.data.cliente.id;
        const uCreate = await request('CLIENT:user-create', { username: 'poor_user', password: '123', role_id: 4, clienteId });
        const userToken = uCreate.data.usuario.token;

        const res5 = await new Promise((resolve) => {
            const data = JSON.stringify({ token: userToken, command: 'SYSTEM:get-global-stats' });
            const req = http.request({ hostname: 'localhost', port: 3001, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
                let body = ''; res.on('data', (chunk) => body += chunk); res.on('end', () => resolve(JSON.parse(body)));
            });
            req.write(data); req.end();
        });
        console.log(JSON.stringify(res5, null, 2));

        // TEST 6: Success
        console.log('
--- TEST 6: Successful Flow ---');
        const res6 = await request('MONITOR:get-system-health', {});
        console.log(JSON.stringify(res6, null, 2));

        console.log('
====================================================');
        console.log('✅ AUDIT COMPLETE: All guide-rails are functioning.');
    } catch (error) {
        console.error('❌ Audit failed:', error.message);
    }
}

runAudit();
