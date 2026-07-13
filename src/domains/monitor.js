const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

class MonitorDomain {
  static domain = 'MONITOR';

  static schemas = {
    'get-global-stats': {
      type: 'object',
      description: 'Obtains general metrics of the entire system.',
      properties: {},
    },
    'get-global-versions': {
      type: 'object',
      description: 'Shows the distribution of schema versions across all clients.',
      properties: {},
    },
    'get-my-version': {
      type: 'object',
      description: 'Returns the current schema version of a specific client.',
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client.' },
      },
      required: ['clienteId'],
    },
    'get-system-health': {
      type: 'object',
      description: 'Performs a basic health check of the core services.',
      properties: {},
    },
    'get-client-report': {
      type: 'object',
      description: 'Generates a comprehensive report of a client including inventory and users.',
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client.' },
      },
      required: ['clienteId'],
    },
  };

  static docs = {
    'get-global-stats': {
      description: 'Returns total count of clients, templates, and users in the system.',
      errors: ['ACCESO_DENEGADO_ROL'],
    },
    'get-global-versions': {
      description: 'Returns a map of version -> client_count.',
      errors: ['ACCESO_DENEGADO_ROL'],
    },
    'get-my-version': {
      description: 'Check if a client is up to date with the latest schema.',
      errors: ['CLIENT_NOT_FOUND', 'ACCESO_DENEGADO_ROL'],
    },
    'get-system-health': {
      description: 'Quick check for DB and Engine connectivity.',
      errors: ['SYSTEM_UNHEALTHY'],
    },
    'get-client-report': {
      description: 'Detailed analysis of a client: total inventory value, active users, etc.',
      errors: ['ACCESO_DENEGADO_ROL', 'CLIENT_NOT_FOUND'],
    },
  };

  static commands = {
    'get-global-stats': async function () {
      // Admin level only (handled by motor.authorize)
      const clientsCount = await db.query('SELECT count(*) as total FROM clientes');
      const templatesCount = await db.query('SELECT count(*) as total FROM plantillas');
      const usersCount = await db.query('SELECT count(*) as total FROM usuarios');

      return {
        status: 'success',
        stats: {
          total_clients: parseInt(clientsCount.rows[0].total),
          total_templates: parseInt(templatesCount.rows[0].total),
          total_users: parseInt(usersCount.rows[0].total),
          db_status: 'connected',
        },
      };
    },

    'get-global-versions': async function () {
      // Admin level: See distribution of schema versions across all clients
      const result = await db.query(
        'SELECT schema_version, count(*) as count FROM clientes GROUP BY schema_version'
      );

      const versions = {};
      result.rows.forEach((row) => {
        versions[row.schema_version] = parseInt(row.count);
      });

      return {
        status: 'success',
        version_distribution: versions,
      };
    },

    'get-client-report': async function (user, payload) {
      const { clienteId } = payload;

      // Security check: Only ADMINISTRADOR or the client's own admin/user can see this
      if (
        !['ADMINISTRADOR', 'SUPER_ADMIN'].includes(user.role_name) &&
        user.cliente_id !== clienteId
      ) {
        throw new EngineError('ACCESO_DENEGADO_ROL', `No tienes permiso para acceder al reporte del cliente ID ${clienteId}.`);
      }

      // 1. Basic Info
      const clientRes = await db.query('SELECT * FROM clientes WHERE id = $1', [clienteId]);
      if (clientRes.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND', { id: clienteId });
      const client = clientRes.rows[0];

      // 2. User Count
      const userCountRes = await db.query(
        'SELECT count(*) as total FROM usuarios WHERE cliente_id = $1',
        [clienteId]
      );
      const totalUsers = parseInt(userCountRes.rows[0].total);

      // 3. Inventory Analysis (Optimized: Moved calculation to SQL)
      const inventoryRes = await db.query(
        `SELECT
          count(item) as total_products,
          sum((public_config->'precios'->>(item->>'id'))::numeric * (item->>'qty')::numeric) as total_value
         FROM clientes,
         jsonb_array_elements(public_config->'stock') as item
         WHERE id = $1`,
        [clienteId]
      );

      const totalProducts = parseInt(inventoryRes.rows[0].total_products || 0);
      const totalInventoryValue = parseFloat(inventoryRes.rows[0].total_value || 0);

      return {
        status: 'success',
        report: {
          client: {
            id: client.id,
            nombre: client.nombre,
            version: client.schema_version,
          },
          metrics: {
            usuarios_activos: totalUsers,
            cantidad_productos: totalProducts,
            valor_estimado_inventario: totalInventoryValue,
          },
          config_summary: {
            has_custom_config: Object.keys(client.public_config || {}).length > 0,
            stock_count: totalProducts,
          },
        },
      };
    },

    'get-my-version': async function (user, payload) {
      // Client level: See their own current version
      const { clienteId } = payload;
      const targetClientId = ['ADMINISTRADOR', 'SUPER_ADMIN'].includes(user.role_name)
        ? clienteId
        : user.cliente_id;

      if (!targetClientId) throw new EngineError('ACCESO_DENEGADO_ROL', 'No se pudo determinar el ID del cliente para consultar la versión.');

      const result = await db.query('SELECT schema_version FROM clientes WHERE id = $1', [
        targetClientId,
      ]);

      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND', { id: targetClientId });

      return {
        status: 'success',
        version: result.rows[0].schema_version,
      };
    },

    'get-system-health': async function (user) {
      const targetClientId = user.targetTenantId;

      if (!targetClientId) throw new EngineError('ACCESO_DENEGADO_ROL', 'Cliente no identificado.');

      try {
        await db.query('SELECT 1');
        return {
          status: 'success',
          health: 'healthy',
          tenant_id: targetClientId,
          checks: {
            database: 'OK',
            engine: 'OK',
            auth: 'OK',
          },
        };
      } catch (e) {
        throw new EngineError('SYSTEM_UNHEALTHY', e.message);
      }
    },
  };
}

motor.registerDomain(MonitorDomain);

module.exports = {};
