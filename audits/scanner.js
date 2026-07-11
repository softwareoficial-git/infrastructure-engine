const axios = require('axios');
const payloads = require('./payloads');
const { performance } = require('perf_hooks');
const db = require('../src/core/db');

class SystemScanner {
  constructor(endpoint = 'http://localhost:3001/execute') {
    this.endpoint = endpoint;
    this.results = [];
    this.personas = {
      SISTEMA_ADMIN: {
        token: 'BOOTSTRAP_TOKEN',
        clienteId: null,
        userId: null,
        role: 'ADMINISTRADOR'
      }
    };
  }

  async init() {
    console.log('Initializing System Discovery...');
    try {
      const res = await axios.post(this.endpoint, {
        token: this.personas.SISTEMA_ADMIN.token,
        cmd: 'SYSTEM:list-commands',
        payload: {}
      });
      return res.data.data.commands;
    } catch (error) {
      throw new Error('Failed to discover commands: ' + error.message);
    }
  }

  async setupSession() {
    console.log('Setting up Session Context...');
    try {
      const clientRes = await axios.post(this.endpoint, {
        token: this.personas.SISTEMA_ADMIN.token,
        cmd: 'APP:client-create',
        payload: payloads.positive['APP:client-create']()
      });
      const clienteId = clientRes.data.data.cliente.id;
      this.personas.SISTEMA_ADMIN.clienteId = clienteId;
      console.log('  - Test Client Created: ID ' + clienteId);

      const userRes = await axios.post(this.endpoint, {
        token: this.personas.SISTEMA_ADMIN.token,
        cmd: 'CLIENT:user-create',
        payload: {
          username: 'audit_user_' + Date.now(),
          password: 'password123',
          role: 'EMPLEADO',
          clienteId: clienteId
        }
      });
      const userId = userRes.data.data.usuario.id;
      this.personas.SISTEMA_ADMIN.userId = userId;
      console.log('  - Test User Created: ID ' + userId);

      console.log('Session context ready.');
    } catch (error) {
      console.error('Session setup failed: ' + error.message);
      throw error;
    }
  }

  async runAudit(commandsCatalog) {
    console.log('Starting API Functional Validation...');
    const domains = Object.keys(commandsCatalog);
    
    for (const domain of domains) {
      console.log('\nMODULE: ' + domain);
      const actions = commandsCatalog[domain];

      for (const action in actions) {
        const cmdStr = domain + ':' + action;
        await this.testStandard(cmdStr);
      }
    }
  }

  async verifyDatabaseState(cmdStr, responseData, payload) {
    const checks = [];
    
    try {
      switch (cmdStr) {
        case 'APP:client-create': {
          const id = responseData.cliente?.id;
          if (id) {
            const res = await db.query('SELECT id, nombre FROM clientes WHERE id = $1', [id]);
            const exists = res.rows.length > 0;
            checks.push({ name: 'ID Existencia', ok: exists, detail: exists ? `ID: ${id}` : 'No encontrado' });
            if (exists) {
              const nameMatch = res.rows[0].nombre === payload.nombre;
              checks.push({ name: 'Nombre Correcto', ok: nameMatch, detail: `Valor: "${res.rows[0].nombre}"` });
            }
          }
          break;
        }
        case 'CLIENT:user-create': {
          const id = responseData.usuario?.id;
          const username = payload.username;
          if (id) {
            const res = await db.query('SELECT id, username FROM usuarios WHERE id = $1', [id]);
            const exists = res.rows.length > 0;
            checks.push({ name: 'ID Existencia', ok: exists, detail: exists ? `ID: ${id}` : 'No encontrado' });
            if (exists) {
              const userMatch = res.rows[0].username === username;
              checks.push({ name: 'Username Correcto', ok: userMatch, detail: `Valor: "${res.rows[0].username}"` });
            }
          }
          break;
        }
        case 'CLIENT:user-update': {
          const id = payload.userId;
          const { username } = payload.data || {};
          if (id) {
            const res = await db.query('SELECT username FROM usuarios WHERE id = $1', [id]);
            if (res.rows[0]) {
              checks.push({ name: 'Usuario Actualizado', ok: !username || res.rows[0].username === username, detail: `ID: ${id} -> Valor: "${res.rows[0].username}"` });
            } else {
              checks.push({ name: 'Usuario Not Found', ok: false, detail: `ID: ${id}` });
            }
          }
          break;
        }
        case 'CLIENT:user-permissions-update': {
          const id = payload.userId;
          const permissions = payload.permissions;
          if (id) {
            const res = await db.query('SELECT permisos FROM usuarios WHERE id = $1', [id]);
            if (res.rows[0]) {
              const currentPerms = res.rows[0].permisos;
              checks.push({ name: 'Permisos Actualizados', ok: JSON.stringify(currentPerms) === JSON.stringify(permissions), detail: `ID: ${id} -> Permisos: ${JSON.stringify(currentPerms)}` });
            } else {
              checks.push({ name: 'Usuario Not Found', ok: false, detail: `ID: ${id}` });
            }
          }
          break;
        }
        case 'USER:push-item': {
          const clienteId = payload.clienteId;
          const path = payload.path;
          const item = payload.item;
          const res = await db.query('SELECT public_config FROM clientes WHERE id = $1', [clienteId]);
          if (res.rows[0]) {
            const config = res.rows[0].public_config;
            const array = config[path] || [];
            const exists = array.some(i => JSON.stringify(i) === JSON.stringify(item));
            checks.push({ name: `JSONB Item Added [${path}]`, ok: exists, detail: `Item: ${JSON.stringify(item)}` });
          } else {
            checks.push({ name: 'Cliente Not Found', ok: false, detail: `ID: ${clienteId}` });
          }
          break;
        }
        case 'USER:update-path': {
          const clienteId = payload.clienteId;
          const path = payload.path;
          const value = payload.value;
          const res = await db.query('SELECT public_config FROM clientes WHERE id = $1', [clienteId]);
          if (res.rows[0]) {
            const config = res.rows[0].public_config;
            const actualValue = path.split('.').reduce((o, i) => (o ? o[i] : null), config);
            checks.push({ name: `JSONB Path [${path}] Value Updated`, ok: JSON.stringify(actualValue) === JSON.stringify(value), detail: `ID: ${clienteId} -> Valor: ${JSON.stringify(actualValue)}` });
          } else {
            checks.push({ name: 'Cliente Not Found', ok: false, detail: `ID: ${clienteId}` });
          }
          break;
        }
        case 'USER:write': {
          const clienteId = payload.clienteId;
          const data = payload.data;
          const res = await db.query('SELECT public_config FROM clientes WHERE id = $1', [clienteId]);
          if (res.rows[0]) {
            const config = res.rows[0].public_config;
            const allMatch = Object.entries(data).every(([k, v]) => JSON.stringify(config[k]) === JSON.stringify(v));
            checks.push({ name: 'Global Merge Write Verified', ok: allMatch, detail: `ID: ${clienteId} -> Config: ${JSON.stringify(config)}` });
          } else {
            checks.push({ name: 'Cliente Not Found', ok: false, detail: `ID: ${clienteId}` });
          }
          break;
        }
        case 'APP:update-client-plan': {
          const clienteId = payload.clienteId;
          const plan = payload.plan;
          const res = await db.query('SELECT private_config FROM clientes WHERE id = $1', [clienteId]);
          if (res.rows[0]) {
            const config = res.rows[0].private_config;
            checks.push({ name: 'Private Config Plan Updated', ok: config.plan === plan, detail: `ID: ${clienteId} -> Plan: ${config.plan}` });
          } else {
            checks.push({ name: 'Cliente Not Found', ok: false, detail: `ID: ${clienteId}` });
          }
          break;
        }
        case 'APP:migrate-global': {
          const targetVersion = payload.targetVersion;
          const res = await db.query('SELECT schema_version FROM clientes LIMIT 1');
          if (res.rows[0]) {
            checks.push({ name: 'Global Schema Version Updated', ok: res.rows[0].schema_version === targetVersion, detail: `Version: ${res.rows[0].schema_version}` });
          } else {
            checks.push({ name: 'No Clients Found', ok: false });
          }
          break;
        }
        case 'APP:init-business': {
          const clienteId = payload.clienteId;
          const res = await db.query('SELECT public_config FROM clientes WHERE id = $1', [clienteId]);
          if (res.rows[0]) {
            const config = res.rows[0].public_config;
            const hasStruct = config.stock !== undefined && config.sales !== undefined && config.employees !== undefined;
            checks.push({ name: 'Business Structure Initialized', ok: hasStruct, detail: `ID: ${clienteId} -> Struct: {stock:${!!config.stock}, sales:${!!config.sales}, employees:${!!config.employees}}` });
          } else {
            checks.push({ name: 'Cliente Not Found', ok: false, detail: `ID: ${clienteId}` });
          }
          break;
        }
        case 'APP:self-register': {
          const { cliente, user } = responseData;
          if (cliente && user) {
            const clientRes = await db.query('SELECT id FROM clientes WHERE id = $1', [cliente.id]);
            const userRes = await db.query('SELECT id FROM usuarios WHERE id = $1', [user.id]);
            checks.push({ name: 'Cliente Created', ok: clientRes.rows.length > 0, detail: `ID: ${cliente.id}` });
            checks.push({ name: 'Usuario Created', ok: userRes.rows.length > 0, detail: `ID: ${user.id}` });
          }
          break;
        }
        case 'APP:template-create': {
          const template = responseData.template;
          if (template) {
            const res = await db.query('SELECT id FROM plantillas WHERE id = $1', [template.id]);
            checks.push({ name: 'Template Persisted', ok: res.rows.length > 0, detail: `ID: ${template.id}` });
          }
          break;
        }
        case 'APP:template-publish': {
          const template = responseData.template;
          if (template) {
            const res = await db.query('SELECT count(*) FROM plantillas WHERE es_oficial = true');
            const currentOfficial = await db.query('SELECT id FROM plantillas WHERE es_oficial = true');
            checks.push({ name: 'Only One Official Template', ok: parseInt(res.rows[0].count) === 1, detail: `Count: ${res.rows[0].count}` });
            checks.push({ name: 'Correct Template Official', ok: currentOfficial.rows[0]?.id === template.id, detail: `ID: ${currentOfficial.rows[0]?.id}` });
          }
          break;
        }
        case 'CLIENT:schema-extend': {
          const clienteId = payload.clienteId;
          const newFields = payload.newFields;
          const res = await db.query('SELECT public_config FROM clientes WHERE id = $1', [clienteId]);
          if (res.rows[0]) {
            const config = res.rows[0].public_config;
            const allMatch = Object.entries(newFields).every(([k, v]) => JSON.stringify(config[k]) === JSON.stringify(v));
            checks.push({ name: 'JSONB Schema Extended', ok: allMatch, detail: `ID: ${clienteId} -> Config: ${JSON.stringify(config)}` });
          } else {
            checks.push({ name: 'Cliente Not Found', ok: false, detail: `ID: ${clienteId}` });
          }
          break;
        }
        case 'SYSTEM:log-event': {
          const { tenantId, command } = payload;
          const res = await db.query(
            'SELECT id FROM system_events WHERE tenant_id = $1 AND command = $2 ORDER BY created_at DESC LIMIT 1',
            [tenantId, command]
          );
          checks.push({ name: 'Event Logged in DB', ok: res.rows.length > 0, detail: res.rows.length > 0 ? `Event ID: ${res.rows[0].id}` : 'No event found' });
          break;
        }
        case 'SYSTEM:set-global-config': {
          const { key, value } = payload;
          const res = await db.query('SELECT value FROM system_settings WHERE key = $1', [key]);
          if (res.rows[0]) {
            checks.push({ name: 'Global Config Updated', ok: JSON.stringify(res.rows[0].value) === JSON.stringify(value), detail: `Key: ${key} -> Value: ${JSON.stringify(res.rows[0].value)}` });
          } else {
            checks.push({ name: 'Config Key Not Found', ok: false });
          }
          break;
        }
        case 'SYSTEM:events-clear': {
          const { tenantId, olderThanDays } = payload;
          const res = await db.query(
            'SELECT count(*) FROM system_events WHERE tenant_id = $1 AND created_at < NOW() - ($2 || \' days\')::interval',
            [tenantId, olderThanDays]
          );
          checks.push({ name: 'Old Events Cleared', ok: parseInt(res.rows[0].count) === 0, detail: `Count remaining: ${res.rows[0].count}` });
          break;
        }
        case 'SYSTEM:events-archive': {
          const { tenantId, olderThanDays } = payload;
          const res = await db.query(
            'SELECT count(*) FROM system_events WHERE tenant_id = $1 AND created_at < NOW() - ($2 || \' days\')::interval',
            [tenantId, olderThanDays]
          );
          checks.push({ name: 'Events Moved Out of Main Table', ok: parseInt(res.rows[0].count) === 0, detail: `Count remaining: ${res.rows[0].count}` });
          break;
        }
      }

      if (checks.length > 0) {
        console.log('   --- 🔍 DB REAL CHECKER ---');
        checks.forEach(c => {
          console.log(`     ${c.ok ? '✅' : '❌'} ${c.name} -> ${c.detail || 'N/A'}`);
        });
        console.log('   -------------------------');
      }
    } catch (error) {
      console.log('   --- ❌ DB CHECKER ERROR ---');
      console.log(`     ${error.message}`);
      console.log('   -------------------------');
    }
  }

  async testStandard(cmdStr) {
    const start = performance.now();
    let payload;
    if (typeof payloads.positive[cmdStr] === 'function') {
      payload = payloads.positive[cmdStr](this.personas.SISTEMA_ADMIN);
    } else {
      payload = payloads.positive[cmdStr] || {};
    }

    try {
      const res = await axios.post(this.endpoint, {
        token: this.personas.SISTEMA_ADMIN.token,
        cmd: cmdStr,
        payload: payload
      }, { timeout: cmdStr === 'SYSTEM:init' ? 10000 : 2000 });

      const duration = (performance.now() - start).toFixed(2);
      const isSuccess = res.data.status === 'success';
      
      const status = isSuccess ? '✅' : '❌';
      const note = isSuccess ? 'OK' : (res.data.error?.code || 'UNKNOWN_ERROR');

      if (!isSuccess) {
        console.log('   --- DIAGNÓSTICO DE FALLO ---');
        console.log('   Comando: ' + cmdStr);
        console.log('   Payload: ' + JSON.stringify(payload, null, 2));
        console.log('   Respuesta: ' + JSON.stringify(res.data, null, 2));
        console.log('   ---------------------------');
      }

      this.results.push({ cmd: cmdStr, persona: 'SISTEMA_ADMIN', expected: 'ALLOW', actual: isSuccess ? 'ALLOW' : 'DENY', status, note, duration });
      console.log(status + ' ' + cmdStr + ' [POS] -> ' + note + ' (' + duration + 'ms)');
      
      if (isSuccess) {
        await this.verifyDatabaseState(cmdStr, res.data.data, payload);
      }
    } catch (error) {
      const duration = (performance.now() - start).toFixed(2);
      const errCode = error.response?.data?.error?.code || 'CRITICAL_FAIL';
      
      const status = '❌';
      
      console.log('   --- DIAGNÓSTICO CRÍTICO ---');
      console.log('   Comando: ' + cmdStr);
      console.log('   Payload: ' + JSON.stringify(payload, null, 2));
      if (error.response) {
        console.log('   Respuesta Error: ' + JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('   Error Técnico: ' + error.message);
      }
      console.log('   --------------------------');

      this.results.push({ cmd: cmdStr, persona: 'SISTEMA_ADMIN', expected: 'ALLOW', actual: 'DENY', status, note: errCode, duration });
      console.log(status + ' ' + cmdStr + ' [POS] -> ' + errCode + ' (' + duration + 'ms)');
    }
  }

  generateFinalReport() {
    console.log('\n' + '='.repeat(60));
    console.log('API FUNCTIONAL VALIDATION REPORT');
    console.log('='.repeat(60));

    const total = this.results.length;
    const passed = this.results.filter(r => r.status === '✅').length;
    const failed = this.results.filter(r => r.status === '❌').length;
    const avgLatency = (this.results.reduce((acc, r) => acc + parseFloat(r.duration), 0) / total).toFixed(2);

    console.log('\nGlobal Metrics:');
    console.log('- Total Commands Tested: ' + total);
    console.log('- Functional: ' + passed);
    console.log('- Broken: ' + failed);
    console.log('- Avg Latency: ' + avgLatency + 'ms');
    console.log('\nAPI Health Score: ' + ((passed / total) * 100).toFixed(2) + '%');
    console.log('='.repeat(60) + '\n');
  }
}

module.exports = SystemScanner;
