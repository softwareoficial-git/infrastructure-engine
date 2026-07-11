/**
 * Dynamic Payload Dictionary for Deep System Audit
 * These functions allow the scanner to use IDs generated during the audit process.
 */
module.exports = {
  // --- POSITIVE CASES (Should work if system is healthy) ---
  positive: {
    'CLIENT:user-create': (ctx) => ({
      username: `audit_user_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      password: 'password123',
      role: 'EMPLEADO',
      clienteId: ctx.clienteId
    }),
    'CLIENT:user-read': (ctx) => ({
      userId: ctx.userId,
      clienteId: ctx.clienteId
    }),
    'CLIENT:user-list': (ctx) => ({
      clienteId: ctx.clienteId
    }),
    'CLIENT:user-update': (ctx) => ({
      userId: ctx.userId,
      clienteId: ctx.clienteId,
      data: { username: `updated_audit_user_${Date.now()}` }
    }),
    'CLIENT:user-permissions-update': (ctx) => ({
      userId: ctx.userId,
      clienteId: ctx.clienteId,
      permissions: ['USER:read', 'USER:write']
    }),
    'CLIENT:schema-extend': (ctx) => ({
      clienteId: ctx.clienteId,
      newFields: { audit_mode: true }
    }),
    'APP:client-create': () => ({
      nombre: `Audit Corp ${Math.floor(Math.random() * 1000)}`
    }),
    'APP:update-client-plan': (ctx) => ({
      clienteId: ctx.clienteId,
      plan: 'pro'
    }),
    'APP:migrate-global': {
      targetVersion: 8,
      transformation: { add_field: 'version_note', default: 'v8' }
    },
    'APP:init-business': (ctx) => ({
      clienteId: ctx.clienteId
    }),
    'APP:self-register': {
      nombreCliente: 'Auto Register Test',
      username: `reg_user_${Math.floor(Math.random() * 1000)}`,
      password: 'password123'
    },
    'APP:template-create': () => ({
      nombre: 'Audit Template',
      contenido: {
        stock: [],
        precios: {}
      }
    }),
    'APP:template-publish': (ctx) => ({
      templateId: 1
    }),
    'USER:login': (ctx) => ({
      username: 'superadmin',
      password: 'admin123'
    }),
    'USER:read': (ctx) => ({
      clienteId: ctx.clienteId
    }),
    'USER:write': (ctx) => ({
      clienteId: ctx.clienteId,
      data: { audit_note: 'Deep scan verified' }
    }),
    'USER:read-path': (ctx) => ({
      clienteId: ctx.clienteId,
      path: 'stock'
    }),
    'USER:update-path': (ctx) => ({
      clienteId: ctx.clienteId,
      path: 'stock',
      value: []
    }),
    'USER:push-item': (ctx) => ({
      clienteId: ctx.clienteId,
      path: 'stock',
      item: { id: `prod_${Date.now()}`, qty: 1 }
    }),
    'USER:query-json': (ctx) => ({
      clienteId: ctx.clienteId,
      path: 'stock',
      filter: { id: 'audit_prod' }
    }),
    'MONITOR:get-client-report': (ctx) => ({
      clienteId: ctx.clienteId
    }),
    'MONITOR:get-system-health': (ctx) => ({
      clienteId: ctx.clienteId
    }),
    'MONITOR:get-my-version': (ctx) => ({
      clienteId: ctx.clienteId
    }),
    'SYSTEM:batch': (ctx) => ({
      commands: [
        { cmd: 'SYSTEM:help', payload: {} },
        { cmd: 'SYSTEM:list-commands', payload: {} }
      ]
    }),
    'SYSTEM:log-event': (ctx) => ({
      status: 'SUCCESS',
      source: 'BACKEND',
      tenantId: ctx.clienteId,
      command: 'AUDIT_SCAN'
    }),
    'SYSTEM:events-filter': (ctx) => ({
      tenantId: ctx.clienteId,
      source: 'BACKEND'
    }),
    'SYSTEM:events-stats': (ctx) => ({
      tenantId: ctx.clienteId,
      rangeDays: 7
    }),
    'SYSTEM:events-top-errors': (ctx) => ({
      tenantId: ctx.clienteId,
      limit: 5
    }),
    'SYSTEM:events-user-activity': (ctx) => ({
      userId: ctx.userId,
      limit: 10
    }),
    'SYSTEM:events-clear': (ctx) => ({
      tenantId: ctx.clienteId,
      olderThanDays: 30
    }),
    'SYSTEM:events-archive': (ctx) => ({
      tenantId: ctx.clienteId,
      olderThanDays: 30
    }),
    'SYSTEM:set-global-config': {
      key: 'audit_last_run',
      value: { date: new Date().toISOString() }
    },
    'SYSTEM:get-global-config': {
      key: 'audit_last_run'
    },
    'ANALYTICS:list-visits': (ctx) => ({
      tenantId: ctx.clienteId,
      limit: 10
    })
  },

  // --- NEGATIVE CASES (Should fail with specific error codes) ---
  negative: {
    'CLIENT:user-create': {
      missingPassword: { username: 'no_pass', role: 'EMPLEADO' },
      invalidRole: { username: 'bad_role', password: '123', role: 'SUPER_GOD' }
    },
    'USER:push-item': {
      invalidPath: { clienteId: 1, path: 'non_existent_path', item: {} }
    }
  }
};
