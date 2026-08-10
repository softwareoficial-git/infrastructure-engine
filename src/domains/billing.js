const db = require('../core/db');
const motor = require('../core/motor');

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
    },
    'list-gateways': {
      type: 'object',
      properties: {},
      required: []
    }
  };

  static commands = {
    'config': async (user, payload, client = null) => {
      const dbClient = client || db;
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
      
      const result = await dbClient.query(query, [
        tenant_id, 
        gateway_type, 
        JSON.stringify(config_data), 
        is_active ?? true, 
        environment ?? 'production'
      ]);
      
      return result.rows[0];
    },

    'get-config': async (user, payload, client = null) => {
      const dbClient = client || db;
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== payload.tenant_id) {
        throw new Error('No autorizado');
      }

      let query = 'SELECT * FROM PaymentConfigs WHERE tenant_id = $1';
      const params = [payload.tenant_id];

      if (payload.gateway_type) {
        query += ' AND gateway_type = $2';
        params.push(payload.gateway_type);
      }

      const result = await dbClient.query(query, params);
      return result.rows;
    },

    'list-gateways': async (user, payload, client = null) => {
      return ['mercadopago', 'crypto_eth', 'crypto_btc'];
    },

    'webhook-event': async (user, payload, client = null) => {
        const dbClient = client || db;
        const { tenant_id, body, headers } = payload;
        
        const configResult = await dbClient.query(
            'SELECT config_data FROM PaymentConfigs WHERE tenant_id = $1 AND gateway_type = $2',
            [tenant_id, 'mercadopago']
        );
        
        if (configResult.rows.length === 0) throw new Error('Configuración no encontrada');
        
        console.log(`[WEBHOOK] Recibido para tenant ${tenant_id}`, body);
        
        const backendUrl = process.env.BUSINESS_LOGIC_URL || 'http://localhost:3001';
        try {
            await require('axios').post(`${backendUrl}/api/billing/webhook-bridge`, {
                tenant_id,
                body
            });
            console.log(`[WEBHOOK] Reenviado a Business Logic V2 exitosamente.`);
        } catch (error) {
            console.error(`[WEBHOOK] Error al reenviar a Business Logic V2:`, error.message);
        }
        
        return { status: 'processed' };
    }
  };
}

motor.registerDomain(BillingDomain);
module.exports = BillingDomain;
