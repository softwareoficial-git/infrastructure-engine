const db = require('../core/db');

class BillingDomain {
  static domain = 'BILLING';

  static schemas = {
    'config': {
      type: 'object',
      properties: {
        tenant_id: { type: 'integer' },
        gateway_type: { type: 'string', minLength: 1 },
        config_data: { type: 'object' },
        is_active: { type: 'boolean' },
        environment: { type: 'string' }
      },
      required: ['tenant_id', 'gateway_type', 'config_data']
    },
    'get-config': {
      type: 'object',
      properties: {
        tenant_id: { type: 'integer' },
        gateway_type: { type: 'string' }
      },
      required: ['tenant_id']
    }
  };

  static commands = {
    'config': async (user, payload, client = db) => {
      // Autorización básica: Solo DUEÑO de su propio tenant o SUPER_ADMIN
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== payload.tenant_id) {
        throw new Error('No autorizado');
      }

      const { tenant_id, gateway_type, config_data, is_active, environment } = payload;
      
      const query = `
        INSERT INTO PaymentConfigs (tenant_id, gateway_type, config_data, is_active, environment)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, gateway_type) 
        DO UPDATE SET 
            config_data = EXCLUDED.config_data,
            is_active = EXCLUDED.is_active,
            environment = EXCLUDED.environment,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      
      const result = await client.query(query, [
        tenant_id, 
        gateway_type, 
        JSON.stringify(config_data), 
        is_active ?? true, 
        environment ?? 'production'
      ]);
      
      return result.rows[0];
    },

    'get-config': async (user, payload, client = db) => {
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== payload.tenant_id) {
        throw new Error('No autorizado');
      }

      let query = 'SELECT * FROM PaymentConfigs WHERE tenant_id = $1';
      const params = [payload.tenant_id];

      if (payload.gateway_type) {
        query += ' AND gateway_type = $2';
        params.push(payload.gateway_type);
      }

      const result = await client.query(query, params);
      return result.rows;
    }
  };
}

module.exports = BillingDomain;
