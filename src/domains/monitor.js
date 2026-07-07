const motor = require('../core/motor');
const db = require('../core/db');

class MonitorDomain {
  static domain = 'MONITOR';

  static schemas = {
    'get-global-stats': {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    'get-global-versions': {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    'get-my-version': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
      },
      required: ['clienteId'],
    },
    'get-system-health': {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    'get-client-report': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
      },
      required: ['clienteId'],
    },
  };

  static commands = {
    'get-global-stats': async function (user, payload) {
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

    'get-global-versions': async function (user, payload) {
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

      // Security check: Only SUPER_ADMIN or the client's own admin/user can see this
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== clienteId) {
        throw new Error('FORBIDDEN: No tienes permisos para ver el reporte de este cliente');
      }

      // 1. Basic Info
      const clientRes = await db.query('SELECT * FROM clientes WHERE id = $1', [clienteId]);
      if (clientRes.rows.length === 0) throw new Error('CLIENT_NOT_FOUND: Cliente no encontrado');
      const client = clientRes.rows[0];

      // 2. User Count
      const userCountRes = await db.query(
        'SELECT count(*) as total FROM usuarios WHERE cliente_id = $1',
        [clienteId]
      );
      const totalUsers = parseInt(userCountRes.rows[0].total);

      // 3. Inventory Analysis (JSONB)
      const config = client.public_config || {};
      const stock = config.stock || [];
      const prices = config.precios || {};

      let totalProducts = stock.length;
      let totalInventoryValue = 0;

      stock.forEach((item) => {
        const price = prices[item.id] || prices[item.name] || 0;
        totalInventoryValue += price * (item.qty || 0);
      });

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
            has_custom_config: Object.keys(config).length > 0,
            stock_count: totalProducts,
          },
        },
      };
    },

    'get-my-version': async function (user, payload) {
      // Client level: See their own current version
      const { clienteId } = payload;
      const result = await db.query('SELECT schema_version FROM clientes WHERE id = $1', [
        clienteId,
      ]);

      if (result.rows.length === 0) throw new Error('CLIENT_NOT_FOUND: Cliente no encontrado');

      return {
        status: 'success',
        version: result.rows[0].schema_version,
      };
    },

    'get-system-health': async function (user, payload) {
      // Basic health check for the engine
      try {
        await db.query('SELECT 1');
        return {
          status: 'success',
          health: 'healthy',
          checks: {
            database: 'OK',
            engine: 'OK',
            auth: 'OK',
          },
        };
      } catch (e) {
        throw new Error(`SYSTEM_UNHEALTHY: ${e.message}`);
      }
    },
  };
}

motor.registerDomain(MonitorDomain);

module.exports = {};
