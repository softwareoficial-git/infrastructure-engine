const motor = require('../core/motor');
const db = require('../core/db');

class SystemConfigDomain {
  static domain = 'SYSTEM';

  static schemas = {
    'set-global-config': {
      type: 'object',
      properties: {
        key: { type: 'string', minLength: 1 },
        value: { type: 'object' },
      },
      required: ['key', 'value'],
    },
    'get-global-config': {
      type: 'object',
      properties: {
        key: { type: 'string', minLength: 1 },
      },
      required: ['key'],
    },
  };

  static commands = {
    'set-global-config': async function (user, payload) {
      const { key, value } = payload;
      if (!key || !value) throw new Error('Key y Value son requeridos');

      await db.query(
        'INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, value]
      );

      return { status: 'success', message: 'Configuración global actualizada' };
    },

    'get-global-config': async function (user, payload) {
      const { key } = payload;
      const result = await db.query('SELECT value FROM system_settings WHERE key = $1', [key]);

      if (result.rows.length === 0) throw new Error('Configuración no encontrada');
      return { status: 'success', value: result.rows[0].value };
    },
  };
}

motor.registerDomain(SystemConfigDomain);

module.exports = {};
