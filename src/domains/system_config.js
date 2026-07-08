const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

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
    'set-global-config': async function (user, payload, txClient = null) {
      const { key, value } = payload;
      if (!key || !value) throw new EngineError('INVALID_PAYLOAD');

      await (txClient || db).query(
        'INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, value]
      );

      return { status: 'success', message: 'Configuración global actualizada' };
    },

    'get-global-config': async function (user, payload, txClient = null) {
      const { key } = payload;
      const result = await (txClient || db).query(
        'SELECT value FROM system_settings WHERE key = $1',
        [key]
      );

      if (result.rows.length === 0) throw new EngineError('CONFIG_NOT_FOUND');
      return { status: 'success', value: result.rows[0].value };
    },
  };
}

motor.registerDomain(SystemConfigDomain);

module.exports = {};
