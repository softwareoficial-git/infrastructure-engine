const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

class DataConsolidatorDomain {
  static domain = 'DATACONSOLIDATOR';

  static schemas = {
    collectData: {
      type: 'object',
      properties: {},
    },
    sanitizeAndDeduplicate: {
      type: 'object',
      properties: {
        rawItems: { type: 'array' },
      },
      required: ['rawItems'],
    },
  };

  static docs = {
    collectData: { description: 'Extrae datos de productos.', errors: [] },
    sanitizeAndDeduplicate: { description: 'Limpia y consolida productos.', errors: [] },
  };

  static commands = {
    collectData: async function (user, payload) {
      const result = await db.query('SELECT id, public_config FROM clientes');
      const allStockItems = [];
      for (const row of result.rows) {
        const stock = row.public_config?.stock;
        if (Array.isArray(stock)) allStockItems.push(...stock);
      }
      return { status: 'success', data: allStockItems };
    },

    sanitizeAndDeduplicate: async function (user, payload) {
      const { rawItems } = payload;
      const consolidated = {};

      for (const item of rawItems) {
        if (!item.code) continue;

        const code = item.code.trim().toUpperCase();
        if (!consolidated[code]) {
          consolidated[code] = {
            code,
            names: [],
            categories: [],
            prices: [],
            count: 0,
          };
        }

        consolidated[code].names.push(item.name?.trim() || 'Sin nombre');
        consolidated[code].categories.push(item.category?.trim() || 'Sin categoría');
        consolidated[code].prices.push(parseFloat(item.price) || 0);
        consolidated[code].count++;
      }

      const finalData = Object.values(consolidated).map((entry) => {
        return {
          code: entry.code,
          suggested_name: this.getMode(entry.names),
          suggested_category: this.getMode(entry.categories),
          average_price: entry.prices.reduce((a, b) => a + b, 0) / entry.prices.length,
          source_count: entry.count,
        };
      });

      return { status: 'success', data: finalData };
    },
  };

  static getMode(arr) {
    return arr
      .sort((a, b) => arr.filter((v) => v === a).length - arr.filter((v) => v === b).length)
      .pop();
  }
}

motor.registerDomain(DataConsolidatorDomain);

module.exports = {};
