const axios = require('axios');
const payloads = require('./payloads');
const { performance } = require('perf_hooks');
const db = require('../src/core/db');

class SystemScanner {
  constructor(endpoint = 'http://localhost:3001/execute') {
    this.endpoint = endpoint;
    this.results = [];
    this.state = {
      clients: [],
      users: [],
      lastCreated: { user: null, client: null }
    };
    this.personas = {
      SISTEMA_ADMIN: {
        token: 'BOOTSTRAP_TOKEN',
        clienteId: null,
        userId: null,
        role: 'SUPER_ADMIN'
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
      // 0. Ensure an official template exists to avoid NO_OFFICIAL_TEMPLATE error
      try {
        const templateRes = await axios.post(this.endpoint, {
          token: this.personas.SISTEMA_ADMIN.token,
          cmd: 'APP:template-create',
          payload: {
            nombre: 'Template Base Auditoría',
            contenido: { stock: [], precios: {} }
          }
        });
        const templateId = templateRes.data.data.template.id;
        
        await axios.post(this.endpoint, {
          token: this.personas.SISTEMA_ADMIN.token,
          cmd: 'APP:template-publish',
          payload: { templateId: templateId }
        });
        console.log('  - Official Template ensured/created.');
      } catch (e) {
        console.log('  - Template setup skipped or already exists (ignoring error).');
      }

      // 1. Admin creates a client for the tests
      const clientRes = await axios.post(this.endpoint, {
        token: this.personas.SISTEMA_ADMIN.token,
        cmd: 'APP:client-create',
        payload: payloads.positive['APP:client-create']()
      });
      const clienteId = clientRes.data.data.cliente.id;
      
      this.state.clients.push(clienteId);
      this.state.lastCreated.client = clienteId;
      this.personas.SISTEMA_ADMIN.clienteId = clienteId;
      console.log('  - Test Client Created: ID ' + clienteId);

      // 2. Admin creates a DUEÑO for this client
      const ownerRes = await axios.post(this.endpoint, {
        token: this.personas.SISTEMA_ADMIN.token,
        cmd: 'CLIENT:user-create',
        payload: {
          username: 'audit_owner_' + Date.now(),
          password: 'password123',
          role: 'DUEÑO',
          clienteId: clienteId
        }
      });
      const owner = ownerRes.data.data.usuario;
      
      this.state.users.push(owner);
      this.state.lastCreated.user = owner.id;

      // To get the token, we must login
      const ownerLogin = await axios.post(this.endpoint, {
        token: null,
        cmd: 'USER:login',
        payload: { username: owner.username, password: 'password123' }
      });
      this.personas.DUEÑO = {
        token: ownerLogin.data.data.token,
        clienteId: clienteId,
        userId: owner.id,
        role: 'DUEÑO'
      };
      console.log('  - Test Owner Created: ID ' + owner.id);

      // 3. Admin creates an EMPLEADO for this client
      const empRes = await axios.post(this.endpoint, {
        token: this.personas.SISTEMA_ADMIN.token,
        cmd: 'CLIENT:user-create',
        payload: {
          username: 'audit_emp_' + Date.now(),
          password: 'password123',
          role: 'EMPLEADO',
          clienteId: clienteId
        }
      });
      const emp = empRes.data.data.usuario;
      
      this.state.users.push(emp);
      this.state.lastCreated.user = emp.id;

      const empLogin = await axios.post(this.endpoint, {
        token: null,
        cmd: 'USER:login',
        payload: { username: emp.username, password: 'password123' }
      });
      this.personas.EMPLEADO = {
        token: empLogin.data.data.token,
        clienteId: clienteId,
        userId: emp.id,
        role: 'EMPLEADO'
      };
      console.log('  - Test Employee Created: ID ' + emp.id);

      console.log('Session context ready.');
    } catch (error) {
      console.error('Session setup failed:');
      if (error.response) {
        console.error('  -> Server Response:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.error('  -> Error:', error.message);
      }
      throw error;
    }
  }

  async runAudit(commandsCatalog) {
    console.log('Starting Multi-Persona RBAC Audit...');
    const rbacMatrix = require('./rbac_matrix');
    const domains = Object.keys(commandsCatalog);
    
    for (const domain of domains) {
      console.log('\nMODULE: ' + domain);
      const actions = commandsCatalog[domain];

      for (const action in actions) {
        const cmdStr = domain + ':' + action;
        const expectations = rbacMatrix[cmdStr];
        
        if (!expectations) {
          console.log(`     ⚠️  Skipping ${cmdStr}: No defined expectations in rbac_matrix.js`);
          continue;
        }

        // Test each persona defined in the matrix for this command
        for (const [persona, expectedOutcome] of Object.entries(expectations)) {
          await this.testPersona(cmdStr, persona, expectedOutcome);
        }
      }
    }
  }

  async testPersona(cmdStr, persona, expectedOutcome) {
    const start = performance.now();
    const token = this.getPersonaToken(persona);
    
    let payload;
    if (typeof payloads.positive[cmdStr] === 'function') {
      // Pass the correct context based on persona
      const context = this.getPersonaContext(persona);
      payload = payloads.positive[cmdStr](context);
    } else {
      payload = payloads.positive[cmdStr] || {};
    }

    try {
      const res = await axios.post(this.endpoint, {
        token: token,
        cmd: cmdStr,
        payload: payload
      }, { timeout: 2000 });

      const isSuccess = res.data.status === 'success';
      const actualOutcome = isSuccess ? 'ALLOW' : 'DENY';
      const status = actualOutcome === expectedOutcome ? '✅' : '❌';
      const note = isSuccess ? 'OK' : (res.data.error?.code || 'UNKNOWN_ERROR');

      this.results.push({ cmd: cmdStr, persona, expected: expectedOutcome, actual: actualOutcome, status, note, duration: (performance.now() - start).toFixed(2) });
      console.log(`     ${status} ${persona} -> ${cmdStr} [${expectedOutcome}] -> ${note}`);
      
      if (isSuccess && this.personas.SISTEMA_ADMIN.token === token) {
        await this.verifyDatabaseState(cmdStr, res.data.data, payload);
      }
    } catch (error) {
      const actualOutcome = 'DENY';
      const status = actualOutcome === expectedOutcome ? '✅' : '❌';
      const errData = error.response?.data;
      const errCode = errData?.error?.code || 'CRITICAL_FAIL';
      
      this.results.push({ cmd: cmdStr, persona, expected: expectedOutcome, actual: actualOutcome, status, note: errCode, duration: (performance.now() - start).toFixed(2) });
      console.log(`     ${status} ${persona} -> ${cmdStr} [${expectedOutcome}] -> ${errCode}`);
      
      if (errData) {
        // Solo imprimimos el detalle completo si es un fallo inesperado (era ALLOW pero dio DENY)
        if (actualOutcome !== expectedOutcome) {
          console.log(`     🔍 Detail: ${JSON.stringify(errData.error, null, 2)}`);
        }
      }
    }
  }

  getPersonaToken(persona) {
    switch (persona) {
      case 'SISTEMA_ADMIN': return this.personas.SISTEMA_ADMIN.token;
      case 'CLIENTE_DUEÑO': return this.personas.DUEÑO?.token;
      case 'CLIENTE_EMPLEADO': return this.personas.EMPLEADO?.token;
      case 'GUEST': return null;
      default: return null;
    }
  }

  getPersonaContext(persona) {
    let context = {};
    if (persona === 'SISTEMA_ADMIN') context = this.personas.SISTEMA_ADMIN;
    else if (persona === 'CLIENTE_DUEÑO') context = this.personas.DUEÑO;
    else if (persona === 'CLIENTE_EMPLEADO') context = this.personas.EMPLEADO;

    // Fallback logic: if context is missing essential IDs, use the state store
    return {
      ...context,
      clienteId: context.clienteId || this.state.lastCreated.client,
      userId: context.userId || this.state.lastCreated.user
    };
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
    console.log('\nAPI Health Score: ' + ((passed / total) * 100).toFixed(2) + '%');
    console.log('='.repeat(60) + '\n');
  }
}

module.exports = SystemScanner;
