const motor = require('../core/motor');
const db = require('../core/db');

class ClientDomain {
  static domain = 'CLIENT';

  static schemas = {
    'user-create': {
      type: 'object',
      properties: {
        username: { type: 'string', minLength: 1 },
        password: { type: 'string', minLength: 6 },
        role_id: { type: 'integer' },
        clienteId: { type: 'integer' },
      },
      required: ['username', 'password', 'role_id', 'clienteId'],
    },
    'user-read': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        userId: { type: 'string', description: 'Can be the numeric ID or the username.' },
      },
      required: ['clienteId', 'userId'],
    },
    'user-update': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        userId: { type: 'string' },
        data: { type: 'object', description: 'Fields to update (e.g., password, role_id).' },
      },
      required: ['clienteId', 'userId', 'data'],
    },
    'user-list': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        filter: {
          type: 'object',
          properties: { role_name: { type: 'string' } },
        },
      },
      required: ['clienteId'],
    },
    'schema-extend': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        newFields: { type: 'object' },
      },
      required: ['clienteId', 'newFields'],
    },
  };

  static docs = {
    'user-create': { description: 'Creates a new user for a client.', errors: ['USER_EXISTS'] },
    'user-read': {
      description: 'Gets details of a specific user by ID or username.',
      errors: ['USER_NOT_FOUND'],
    },
    'user-update': {
      description: 'Updates user details like password or role.',
      errors: ['USER_NOT_FOUND'],
    },
    'user-list': {
      description: 'Lists users of a client with optional role filtering.',
      errors: [],
    },
    'schema-extend': {
      description: "Adds new fields to a client's config.",
      errors: ['CLIENT_NOT_FOUND'],
    },
  };

  static commands = {
    'user-create': async function (user, payload) {
      const { username, password, role_id, clienteId } = payload;
      if (!username || !password || !clienteId) throw new Error('Faltan datos requeridos');

      const result = await db.query(
        'INSERT INTO usuarios (username, password, role_id, token, cliente_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [username, password, role_id, `TOKEN_${Math.random().toString(36).substr(2, 9)}`, clienteId]
      );

      return { status: 'success', usuario: result.rows[0] };
    },

    'user-read': async function (user, payload) {
      const { clienteId, userId } = payload;
      const result = await db.query(
        'SELECT u.*, r.nombre as role_name FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.cliente_id = $1 AND (u.id::text = $2 OR u.username = $2)',
        [clienteId, userId]
      );

      if (result.rows.length === 0) throw new Error('USER_NOT_FOUND: Usuario no encontrado');
      return { status: 'success', usuario: result.rows[0] };
    },

    'user-update': async function (user, payload) {
      const { clienteId, userId, data } = payload;
      const keys = Object.keys(data);
      if (keys.length === 0) throw new Error('No hay datos para actualizar');

      const setClause = keys.map((key, i) => `${key} = $${i + 3}`).join(', ');
      const values = [...Object.values(data), clienteId, userId];

      const result = await db.query(
        `UPDATE usuarios SET ${setClause} WHERE cliente_id = $${values.length} AND (id::text = $${values.length + 1} OR username = $${values.length + 1}) RETURNING *`,
        [...Object.values(data), clienteId, userId]
      );

      if (result.rows.length === 0) throw new Error('USER_NOT_FOUND: Usuario no encontrado');
      return { status: 'success', usuario: result.rows[0] };
    },

    'user-list': async function (user, payload) {
      const { clienteId, filter } = payload;
      let query =
        'SELECT u.*, r.nombre as role_name FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.cliente_id = $1';
      const params = [clienteId];

      if (filter && filter.role_name) {
        query += ' AND r.nombre = $2';
        params.push(filter.role_name);
      }

      const result = await db.query(query, params);
      return { status: 'success', usuarios: result.rows };
    },

    'schema-extend': async function (user, payload) {
      const { clienteId, newFields } = payload;
      if (!clienteId || !newFields) throw new Error('clienteId y newFields son requeridos');

      const result = await db.query(
        'UPDATE clientes SET public_config = public_config || $2 WHERE id = $1 RETURNING public_config',
        [clienteId, JSON.stringify(newFields)]
      );

      if (result.rows.length === 0) throw new Error('Cliente no encontrado');

      return { status: 'success', newConfig: result.rows[0].public_config };
    },
  };
}

motor.registerDomain(ClientDomain);

module.exports = {};
