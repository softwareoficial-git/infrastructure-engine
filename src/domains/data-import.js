const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

class DataImportDomain {
  static domain = 'CLIENT';

  static schemas = {
    'data-import': {
      type: 'object',
      properties: {
        mapping: { type: 'object' },
        data: { type: 'array' },
      },
      required: ['mapping', 'data'],
    },
  };

  static docs = {
    'data-import': {
      description: 'Importa masivamente datos de stock y productos con mapeo de campos.',
      errors: ['DATA_INVALID', 'CLIENT_NOT_FOUND'],
    },
  };

  static commands = {
    'data-import': async function (user, payload) {
      const { mapping, data } = payload;
      const clienteId = user.targetTenantId;

      if (!Array.isArray(data)) throw new EngineError('DATA_INVALID', 'Data debe ser un array.');
      if (!mapping || Object.keys(mapping).length === 0)
        throw new EngineError('MAPPING_INVALID', 'Mapeo es obligatorio.');

      // 1. Fetch current config
      const clientRes = await db.query('SELECT public_config FROM clientes WHERE id = $1', [
        clienteId,
      ]);
      if (clientRes.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND', { id: clienteId });

      let publicConfig = clientRes.rows[0].public_config || { stock: {} };

      // 2. Map and Import
      const importedItems = data.map((item) => {
        const newItem = {};
        for (const [col, field] of Object.entries(mapping)) {
          if (item[col] !== undefined) {
            newItem[field] = item[col];
          }
        }
        return newItem;
      });

      // 3. Update public_config (append to stock)
      publicConfig.stock = [...(publicConfig.stock || []), ...importedItems];

      // 4. Persist
      await db.query('UPDATE clientes SET public_config = $2 WHERE id = $1', [
        clienteId,
        JSON.stringify(publicConfig),
      ]);

      return { status: 'success', message: 'Importación exitosa', count: importedItems.length };
    },
  };
}

motor.registerDomain(DataImportDomain);

module.exports = {};
