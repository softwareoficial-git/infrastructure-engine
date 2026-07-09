const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

class ClientDomain {
  static domain = 'CLIENT';

  static schemas = {
    'user-create': {
      type: 'object',
      properties: {
        username: { type: 'string', minLength: 1 },
        password: { type: 'string', minLength: 6 },
        role_id: { type: 'integer' },
        role: { type: 'string' },
        clienteId: { type: 'integer' },
      },
      required: ['username', 'password'],
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
      description:
        'Lists users of a client with optional role filtering. Supports limit and offset for pagination.',
      errors: [],
    },
    'schema-extend': {
      description: "Adds new fields to a client's config.",
      errors: ['CLIENT_NOT_FOUND'],
    },
  };

  static commands = {
    'user-create': async function (user, payload) {
      let { username, password, role_id, role, clienteId } = payload;

      // 1. Resolve ClienteId from context if missing
      if (!clienteId) {
        if (user && typeof user.cliente_id === 'number') {
          clienteId = user.cliente_id;
        } else {
          throw new EngineError('FORBIDDEN', 'No active client context found for user creation.');
        }
      }

      // IDOR Check: User must belong to the client they are creating users for (unless SUPER_ADMIN)
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== clienteId) {
        throw new EngineError('FORBIDDEN', 'You cannot create users for another client.');
      }

      // 2. Resolve RoleId from role name if missing
      if (!role_id && role) {
        const roleRes = await db.query('SELECT id FROM roles WHERE nombre = $1', [
          role.toUpperCase(),
        ]);
        if (roleRes.rows.length === 0) {
          throw new EngineError('INVALID_PAYLOAD', `Role '${role}' not found.`);
        }
        role_id = roleRes.rows[0].id;
      }

      if (!role_id) {
        throw new EngineError('INVALID_PAYLOAD', 'Either role_id or role must be provided.');
      }

      // RBAC: Prevent Privilege Escalation. Only SUPER_ADMIN can assign roles other than 'USUARIO'.
      const roleCheck = await db.query('SELECT nombre FROM roles WHERE id = $1', [role_id]);
      const assignedRoleName = roleCheck.rows[0]?.nombre;
      if (assignedRoleName !== 'USUARIO' && user.role_name !== 'SUPER_ADMIN') {
        throw new EngineError('FORBIDDEN', 'Only system administrators can assign elevated roles.');
      }

      try {
        const result = await db.query(
          'INSERT INTO usuarios (username, password, role_id, token, cliente_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [
            username,
            password,
            role_id,
            `TOKEN_${Math.random().toString(36).substr(2, 9)}`,
            clienteId,
          ]
        );

        return { status: 'success', usuario: result.rows[0] };
      } catch (error) {
        if (error.code === '23505') {
          throw new EngineError('USER_EXISTS');
        }
        if (error.code === '23503') {
          throw new EngineError('INVALID_PAYLOAD', 'The provided role_id or clienteId is invalid.');
        }
        throw error;
      }
    },

    'user-read': async function (user, payload) {
      const { clienteId, userId } = payload;

      // IDOR Check
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== clienteId) {
        throw new EngineError('FORBIDDEN', "Access denied to this client's users.");
      }

      const result = await db.query(
        'SELECT u.*, r.nombre as role_name FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.cliente_id = $1 AND (u.id::text = $2 OR u.username = $2)',
        [clienteId, userId]
      );

      if (result.rows.length === 0) throw new EngineError('USER_NOT_FOUND');
      return { status: 'success', usuario: result.rows[0] };
    },

    'user-update': async function (user, payload) {
      const { clienteId, userId, data } = payload;

      // IDOR Check
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== clienteId) {
        throw new EngineError('FORBIDDEN', "Access denied to this client's users.");
      }

      const ALLOWED_FIELDS = ['password', 'role_id', 'username'];
      const keys = Object.keys(data).filter((key) => ALLOWED_FIELDS.includes(key));

      if (keys.length === 0) throw new EngineError('INVALID_PAYLOAD');

      // RBAC: Check if role_id is being updated and if the user is allowed to do so
      if (data.role_id) {
        const roleCheck = await db.query('SELECT nombre FROM roles WHERE id = $1', [data.role_id]);
        const targetRoleName = roleCheck.rows[0]?.nombre;
        if (targetRoleName !== 'USUARIO' && user.role_name !== 'SUPER_ADMIN') {
          throw new EngineError(
            'FORBIDDEN',
            'Only system administrators can assign elevated roles.'
          );
        }
      }

      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      const values = keys.map((key) => data[key]);

      const finalParams = [...values, clienteId, userId];
      const clienteParamIdx = values.length + 1;
      const userParamIdx = values.length + 2;

      try {
        const result = await db.query(
          `UPDATE usuarios SET ${setClause} WHERE cliente_id = $${clienteParamIdx} AND (id::text = $${userParamIdx} OR username = $${userParamIdx}) RETURNING *`,
          finalParams
        );

        if (result.rows.length === 0) throw new EngineError('USER_NOT_FOUND');
        return { status: 'success', usuario: result.rows[0] };
      } catch (error) {
        if (error.code === '23505') {
          throw new EngineError('USER_EXISTS');
        }
        if (error.code === '23503') {
          throw new EngineError('INVALID_PAYLOAD', 'The provided role_id is invalid.');
        }
        if (error.name === 'EngineError') throw error;
        throw error;
      }
    },

    'user-list': async function (user, payload) {
      const { clienteId, filter, limit, offset } = payload;

      // IDOR Check
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== clienteId) {
        throw new EngineError('FORBIDDEN', "Access denied to this client's users.");
      }

      let query =
        'SELECT u.*, r.nombre as role_name FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.cliente_id = $1';
      const params = [clienteId];

      if (filter && filter.role_name) {
        query += ' AND r.nombre = $2';
        params.push(filter.role_name);
      }

      if (limit !== undefined) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }

      if (offset !== undefined) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(offset);
      }

      const result = await db.query(query, params);
      return { status: 'success', usuarios: result.rows };
    },

    'schema-extend': async function (user, payload) {
      const { clienteId, newFields } = payload;

      // IDOR Check
      if (user.role_name !== 'SUPER_ADMIN' && user.cliente_id !== clienteId) {
        throw new EngineError('FORBIDDEN', "Access denied to this client's config.");
      }

      const result = await db.query(
        'UPDATE clientes SET public_config = public_config || $2 WHERE id = $1 RETURNING public_config',
        [clienteId, JSON.stringify(newFields)]
      );

      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND');

      return { status: 'success', newConfig: result.rows[0].public_config };
    },
  };
}

motor.registerDomain(ClientDomain);

module.exports = {};
