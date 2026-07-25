const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

class SalesDomain {
  static domain = 'SALES';

  static schemas = {
    'register-sale': {
      type: 'object',
      properties: {
        productName: { type: 'string', minLength: 1 },
        quantity: { type: 'integer', minimum: 1 },
        totalAmount: { type: 'number', minimum: 0 },
      },
      required: ['productName', 'quantity', 'totalAmount'],
    },
    'get-history': {
      type: 'object',
      properties: {},
      required: [],
    },
    'get-summary': {
      type: 'object',
      properties: {},
      required: [],
    },
  };

  static docs = {
    'register-sale': {
      description: 'Registra una nueva venta en el historial de las últimas 24 horas.',
      errors: ['DB_ERROR'],
    },
    'get-history': {
      description: 'Obtiene el resumen de ventas de las últimas 24 horas.',
      errors: ['DB_ERROR'],
    },
    'get-summary': {
      description: 'Obtiene el resumen consolidado de ventas de las últimas 24 horas por vendedor.',
      errors: ['DB_ERROR'],
    },
  };

  static commands = {
    'register-sale': async function (user, payload, txClient = null) {
      const { productName, quantity, totalAmount } = payload;
      const tenantId = user.cliente_id;
      const userId = user.id;

      if (!tenantId) {
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Usuario no asociado a un tenant.');
      }

      await (txClient || db).query(
        `INSERT INTO sales_history (tenant_id, user_id, product_name, quantity, total_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, userId, productName, quantity, totalAmount]
      );

      return { status: 'success', message: 'Venta registrada.' };
    },

    'get-history': async function (user, payload, txClient = null) {
      const tenantId = user.cliente_id;

      if (!tenantId) {
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Usuario no asociado a un tenant.');
      }

      const query = `
        SELECT product_name, quantity, total_amount, created_at, user_id
        FROM sales_history
        WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
      `;

      const result = await (txClient || db).query(query, [tenantId]);
      return { status: 'success', sales: result.rows };
    },

    'get-summary': async function (user, payload, txClient = null) {
      const tenantId = user.cliente_id;

      if (!tenantId) {
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Usuario no asociado a un tenant.');
      }

      const query = `
        SELECT 
          u.username as empleado,
          COUNT(*) as productos_vendidos,
          SUM(total_amount) as total
        FROM sales_history s
        JOIN usuarios u ON s.user_id = u.id
        WHERE s.tenant_id = $1 AND s.created_at > NOW() - INTERVAL '24 hours'
        GROUP BY u.username
      `;

      const result = await (txClient || db).query(query, [tenantId]);
      
      const totalQuery = `
        SELECT SUM(total_amount) as total_ventas_24h
        FROM sales_history
        WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      `;
      const totalResult = await (txClient || db).query(totalQuery, [tenantId]);

      return { 
        status: 'success', 
        summary: {
          total_ventas_24h: totalResult.rows[0].total_ventas_24h || 0,
          vendedores: result.rows
        }
      };
    },
  };
}

motor.registerDomain(SalesDomain);

module.exports = {};
