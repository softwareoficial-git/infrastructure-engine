const { v4: uuidv4 } = require('uuid');
const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

class SalesDomain {
  static domain = 'SALES';

  static schemas = {
    'register-sale': {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productName: { type: 'string', minLength: 1 },
              quantity: { type: 'integer', minimum: 1 },
              totalAmount: { type: 'number', minimum: 0 },
            },
            required: ['productName', 'quantity', 'totalAmount'],
          },
        },
      },
      required: ['items'],
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
      description: 'Registra un ticket de venta con múltiples productos.',
      errors: ['DB_ERROR'],
    },
    'get-history': {
      description: 'Obtiene el historial detallado de ventas.',
      errors: ['DB_ERROR'],
    },
    'get-summary': {
      description: 'Obtiene el resumen consolidado de ventas por ticket.',
      errors: ['DB_ERROR'],
    },
  };

  static commands = {
    'register-sale': async function (user, payload, txClient = null) {
      const { items } = payload;
      const tenantId = user.cliente_id;
      const userId = user.id;
      const ticketId = uuidv4();

      if (!tenantId) {
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Usuario no asociado a un tenant.');
      }

      for (const item of items) {
        await (txClient || db).query(
          `INSERT INTO sales_history (tenant_id, user_id, product_name, quantity, total_amount, ticket_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantId, userId, item.productName, item.quantity, item.totalAmount, ticketId]
        );
      }

      return { status: 'success', message: 'Ticket de venta registrado.', ticketId };
    },

    'get-history': async function (user, payload, txClient = null) {
      const tenantId = user.cliente_id;
      if (!tenantId) throw new EngineError('ACCESO_DENEGADO_ROL', 'Usuario no asociado a un tenant.');

      const query = `
        SELECT product_name, quantity, total_amount, created_at, user_id, ticket_id
        FROM sales_history
        WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
      `;
      const result = await (txClient || db).query(query, [tenantId]);
      return { status: 'success', sales: result.rows };
    },

    'get-summary': async function (user, payload, txClient = null) {
      const tenantId = user.cliente_id;
      if (!tenantId) throw new EngineError('ACCESO_DENEGADO_ROL', 'Usuario no asociado a un tenant.');

      const query = `
        SELECT 
          s.ticket_id,
          u.username as empleado,
          s.product_name,
          s.quantity,
          s.total_amount,
          s.created_at
        FROM sales_history s
        JOIN usuarios u ON s.user_id = u.id
        WHERE s.tenant_id = $1 AND s.created_at > NOW() - INTERVAL '24 hours'
        ORDER BY s.created_at DESC
      `;
      const result = await (txClient || db).query(query, [tenantId]);
      
      const summary = {
        total_ventas_24h: 0,
        tickets: {}
      };

      result.rows.forEach(row => {
        if (!summary.tickets[row.ticket_id]) {
          summary.tickets[row.ticket_id] = {
            empleado: row.empleado,
            fecha: row.created_at,
            productos: [],
            total_ticket: 0
          };
        }
        summary.tickets[row.ticket_id].productos.push({
          producto: row.product_name,
          cantidad: row.quantity,
          monto: parseFloat(row.total_amount)
        });
        summary.tickets[row.ticket_id].total_ticket += parseFloat(row.total_amount);
        summary.total_ventas_24h += parseFloat(row.total_amount);
      });

      return { status: 'success', summary };
    },
  };
}

motor.registerDomain(SalesDomain);

module.exports = {};
