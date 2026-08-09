const motor = require('../../core/motor');
const db = require('../../core/db');
const { EngineError } = require('../../core/errors');

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
        const code = (item.code || item.codigo || item.product_id || '').toString().trim().toUpperCase();
        if (!code || code === 'OBJECT' || code === '[OBJECT OBJECT]') continue;

        if (!consolidated[code]) {
          consolidated[code] = {
            code,
            names: [],
            categories: [],
            prices: [],
            count: 0,
          };
        }

        consolidated[code].names.push((item.name || item.product_name || 'Sin nombre').toString().trim());
        consolidated[code].categories.push((item.category || item.cat || 'Sin categoría').toString().trim());
        
        const price = parseFloat(item.price || item.precio || 0);
        if (!isNaN(price)) {
            consolidated[code].prices.push(price);
        }
        consolidated[code].count++;
      }

      const finalData = Object.values(consolidated).map((entry) => {
        return {
          code: entry.code,
          suggested_name: DataConsolidatorDomain.getMode(entry.names),
          suggested_category: DataConsolidatorDomain.getMode(entry.categories),
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
