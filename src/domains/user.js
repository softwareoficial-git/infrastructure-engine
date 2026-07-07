const motor = require('../core/motor');
const db = require('../core/db');

class UserDomain {
  static domain = 'USER';

  static schemas = {
    read: {
      type: 'object',
      description: 'Reads the full public configuration of a specific client.',
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client.' },
      },
      required: ['clienteId'],
    },
    write: {
      type: 'object',
      description:
        "Updates or adds new data to a client's public configuration using a global merge.",
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client.' },
        data: { type: 'object', description: 'The JSON object to merge.' },
      },
      required: ['clienteId', 'data'],
    },
    'read-path': {
      type: 'object',
      description: 'Reads a specific value from the JSONB config using a path.',
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client.' },
        path: { type: 'string', description: 'Path in dot notation (e.g., "settings.theme").' },
      },
      required: ['clienteId', 'path'],
    },
    'update-path': {
      type: 'object',
      description: 'Updates a specific value at a path in the JSONB config.',
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client.' },
        path: { type: 'string', description: 'Path in dot notation (e.g., "settings.theme").' },
        value: { type: 'string' }, // Simplified to string for a general implementation
      },
      required: ['clienteId', 'path', 'value'],
    },
    'push-item': {
      type: 'object',
      description: 'Appends an item to a JSONB array at a specific path.',
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client.' },
        path: { type: 'string', description: 'Path to the array (e.g., "sales").' },
        item: { type: 'object', description: 'The item to push.' },
      },
      required: ['clienteId', 'path', 'item'],
    },
    'query-json': {
      type: 'object',
      description: 'Filters elements of a JSONB array based on a simple key-value match.',
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client.' },
        path: { type: 'string', description: 'Path to the array (e.g., "products").' },
        filter: {
          type: 'object',
          description: 'Object containing the key-value pair to filter by.',
        },
      },
      required: ['clienteId', 'path', 'filter'],
    },
  };

  static docs = {
    read: {
      description: 'Fetch the full public config.',
      errors: ['CLIENT_NOT_FOUND', 'FORBIDDEN'],
    },
    write: { description: 'Global merge update of the config.', errors: ['FORBIDDEN'] },
    'read-path': {
      description: 'Extract a specific value using a path (e.g. "settings.color").',
      errors: ['PATH_NOT_FOUND', 'CLIENT_NOT_FOUND'],
    },
    'update-path': {
      description: 'Update a single value at a specific path.',
      errors: ['PATH_NOT_FOUND', 'CLIENT_NOT_FOUND'],
    },
    'push-item': {
      description: 'Add an element to an array (e.g. adding a new sale to "sales").',
      errors: ['PATH_NOT_FOUND', 'CLIENT_NOT_FOUND'],
    },
    'query-json': {
      description: 'Find items in an array that match a filter (e.g. "product_id: 123").',
      errors: ['CLIENT_NOT_FOUND'],
    },
  };

  // Helper to convert dot notation ("a.b.c") to Postgres path array ("{a,b,c}")
  static parsePath(path) {
    return `{${path.split('.').join(',')}}`;
  }

  static commands = {
    read: async function (user, payload) {
      const { clienteId } = payload;
      const result = await db.query('SELECT public_config FROM clientes WHERE id = $1', [
        clienteId,
      ]);
      if (result.rows.length === 0) throw new Error('CLIENT_NOT_FOUND: Cliente no encontrado');
      return { status: 'success', data: result.rows[0].public_config };
    },

    write: async function (user, payload) {
      const { clienteId, data } = payload;
      const result = await db.query(
        'UPDATE clientes SET public_config = public_config || $2 WHERE id = $1 RETURNING public_config',
        [clienteId, JSON.stringify(data)]
      );
      return { status: 'success', updatedData: result.rows[0].public_config };
    },

    'read-path': async function (user, payload) {
      const { clienteId, path } = payload;
      const pgPath = UserDomain.parsePath(path);
      const result = await db.query('SELECT public_config #> $2 FROM clientes WHERE id = $1', [
        clienteId,
        pgPath,
      ]);
      if (result.rows.length === 0) throw new Error('CLIENT_NOT_FOUND: Cliente no encontrado');
      const value = result.rows[0].values[0];
      if (value === null) throw new Error('PATH_NOT_FOUND: La ruta especificada no existe');
      return { status: 'success', value };
    },

    'update-path': async function (user, payload) {
      const { clienteId, path, value } = payload;
      const pgPath = UserDomain.parsePath(path);
      const result = await db.query(
        'UPDATE clientes SET public_config = jsonb_set(public_config, $2, $3::jsonb, true) WHERE id = $1 RETURNING public_config',
        [clienteId, pgPath, JSON.stringify(value)]
      );
      if (result.rows.length === 0) throw new Error('CLIENT_NOT_FOUND: Cliente no encontrado');
      return { status: 'success', updatedData: result.rows[0].public_config };
    },

    'push-item': async function (user, payload) {
      const { clienteId, path, item } = { ...payload };
      const pgPath = UserDomain.parsePath(path);
      // In Postgres, appending to a JSONB array is usually done by getting the current array and concatenating
      const result = await db.query(
        'UPDATE clientes SET public_config = jsonb_set(public_config, $2, (public_config #> $2) || $3::jsonb, true) WHERE id = $1 RETURNING public_config',
        [clienteId, pgPath, JSON.stringify([item])]
      );
      if (result.rows.length === 0) throw new Error('CLIENT_NOT_FOUND: Cliente no encontrado');
      return { status: 'success', updatedData: result.rows[0].public_config };
    },

    'query-json': async function (user, payload) {
      const { clienteId, path, filter } = payload;
      const pgPath = UserDomain.parsePath(path);

      // This uses a subquery to expand the array elements and then filters them
      const query = `
        SELECT item FROM (
          SELECT jsonb_array_elements(public_config #> $2) as item
          FROM clientes WHERE id = $1
        ) sub
        WHERE item @> $3::jsonb
      `;
      const result = await db.query(query, [clienteId, pgPath, JSON.stringify(filter)]);
      return { status: 'success', results: result.rows.map((r) => r.item) };
    },
  };
}

motor.registerDomain(UserDomain);

module.exports = {};
