const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');
const { hashPassword, generateSecureToken } = require('../utils/security');

class ClientDomain {
  static domain = 'CLIENT';

  static schemas = {
    'user-create': {
      type: 'object',
      properties: {
        username: { type: 'string', minLength: 1 },
        password: { type: 'string', minLength: 6 },
        role: { type: 'string', enum: ['DUEÑO', 'EMPLEADO'] },
        clienteId: { type: 'integer' },
      },
      required: ['username', 'password'],
    },
    'user-read': {
      type: 'object',
      properties: {
        clienteId: { type: ['integer', 'null'] },
        userId: { type: ['integer', 'null'] },
      },
      required: ['userId'],
    },
    'user-update': {
      type: 'object',
      properties: {
        clienteId: { type: ['integer', 'null'] },
        userId: { type: ['integer', 'null'] },
        data: {
          type: 'object',
          properties: {
            password: { type: 'string', minLength: 6 },
            role: { type: 'string', enum: ['CLIENT_ADMIN', 'USER'] },
            username: { type: 'string' },
          },
        },
      },
      required: ['userId', 'data'],
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
      required: [],
    },
    'schema-extend': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        newFields: { type: 'object' },
      },
      required: ['newFields'],
    },
  };

  static docs = {
    'user-create': { description: 'Creates a new user for a client.', errors: ['USER_EXISTS'] },
    'user-read': { description: 'Gets details of a specific user.', errors: ['USER_NOT_FOUND'] },
    'user-update': { description: 'Updates user details.', errors: ['USER_NOT_FOUND'] },
    'user-list': { description: 'Lists users of a client.', errors: [] },
    'schema-extend': {
      description: "Adds new fields to a client's config.",
      errors: ['CLIENT_NOT_FOUND'],
    },
  };

  static commands = {
    'user-create': async function (user, payload) {
      let { username, password, role, clienteId } = payload;

      const targetClientId = ['ADMINISTRADOR', 'SUPER_ADMIN'].includes(user.role_name)
        ? clienteId
        : user.cliente_id;
      if (!targetClientId)
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Contexto de cliente ausente.');

      if (!role) role = 'EMPLEADO';

      const roleRes = await db.query('SELECT id FROM roles WHERE nombre = $1', [
        role.toUpperCase(),
      ]);
      if (roleRes.rows.length === 0)
        throw new EngineError('INVALID_PAYLOAD', `Role ${role} not found.`);
      const roleId = roleRes.rows[0].id;

      const hashedPassword = await hashPassword(password);
      const token = generateSecureToken();

      try {
        const result = await db.query(
          'INSERT INTO usuarios (username, password, role_id, token, cliente_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [username, hashedPassword, roleId, token, targetClientId]
        );
        return { status: 'success', usuario: result.rows[0] };
      } catch (error) {
        if (error.code === '23505') throw new EngineError('USER_EXISTS');
        throw error;
      }
    },

    'user-read': async function (user, payload) {
      const { userId } = payload;
      const targetClientId =
        user.role_name === 'ADMINISTRADOR' ? payload.clienteId : user.cliente_id;

      const result = await db.query(
        'SELECT u.*, r.nombre as role_name FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.cliente_id = $1 AND (u.id::text = $2 OR u.username = $2)',
        [targetClientId, userId]
      );

      if (result.rows.length === 0) throw new EngineError('USER_NOT_FOUND', { id: userId });
      return { status: 'success', usuario: result.rows[0] };
    },

    'user-update': async function (user, payload) {
      const { userId, data } = payload;
      const targetClientId =
        user.role_name === 'ADMINISTRADOR' ? payload.clienteId : user.cliente_id;

      const ALLOWED_FIELDS = ['password', 'role', 'username'];
      const keys = Object.keys(data).filter((key) => ALLOWED_FIELDS.includes(key));
      if (keys.length === 0) throw new EngineError('INVALID_PAYLOAD');

      const updates = [];
      const params = [];
      let paramIdx = 1;

      for (const key of keys) {
        let value = data[key];
        if (key === 'password') value = await hashPassword(value);
        if (key === 'role') {
          const roleRes = await db.query('SELECT id FROM roles WHERE nombre = $1', [
            value.toUpperCase(),
          ]);
          if (roleRes.rows.length === 0) throw new EngineError('INVALID_PAYLOAD', 'Invalid role.');
          value = roleRes.rows[0].id;
        }
        const dbKey = key === 'role' ? 'role_id' : key;
        updates.push(`${dbKey} = $${paramIdx++}`);
        params.push(value);
      }

      params.push(targetClientId, userId);
      const result = await db.query(
        `UPDATE usuarios SET ${updates.join(', ')} WHERE cliente_id = $${params.length - 1} AND (id::text = $${params.length} OR username = $${params.length}) RETURNING *`,
        params
      );

      if (result.rows.length === 0) throw new EngineError('USER_NOT_FOUND', { id: userId });
      return { status: 'success', usuario: result.rows[0] };
    },

    'user-list': async function (user, payload) {
      const targetClientId = ['SUPER_ADMIN', 'ADMINISTRADOR'].includes(user.role_name)
        ? payload.clienteId
        : user.cliente_id;

      let query =
        'SELECT u.*, r.nombre as role_name FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.cliente_id = $1';
      const params = [targetClientId];

      if (payload.filter && payload.filter.role_name) {
        query += ' AND r.nombre = $2';
        params.push(payload.filter.role_name);
      }

      const result = await db.query(query, params);
      return { status: 'success', usuarios: result.rows };
    },

    'user-permissions-update': async function (user, payload) {
      const { userId, permissions } = payload;
      const targetClientId = ['SUPER_ADMIN', 'ADMINISTRADOR'].includes(user.role_name)
        ? payload.clienteId
        : user.cliente_id;

      const result = await db.query(
        'UPDATE usuarios SET permisos = $2 WHERE id = $1 AND cliente_id = $3 RETURNING permisos',
        [userId, JSON.stringify(permissions), targetClientId]
      );

      if (result.rows.length === 0) throw new EngineError('USER_NOT_FOUND');
      return { status: 'success', newPermissions: result.rows[0].permisos };
    },

    'schema-extend': async function (user, payload) {
      const targetClientId = user.targetTenantId;
      const { newFields } = payload;

      const result = await db.query(
        'UPDATE clientes SET public_config = public_config || $2 WHERE id = $1 RETURNING public_config',
        [targetClientId, JSON.stringify(newFields)]
      );

      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND');
      return { status: 'success', newConfig: result.rows[0].public_config };
    },
  };
}

motor.registerDomain(ClientDomain);

module.exports = {};
