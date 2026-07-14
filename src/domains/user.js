const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');
const bcrypt = require('bcrypt');

class UserDomain {
  static domain = 'USER';

  static schemas = {
    login: {
      type: 'object',
      description: 'Authenticates a user and returns their access token.',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['username', 'password'],
    },
    'get-profile': {
      type: 'object',
      description: "Returns the authenticated user's profile and client information.",
      properties: {},
    },
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
        value: {}, // Allow any type (string, number, object, boolean)
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
    login: {
      description: 'Authenticates a user and returns a token.',
      errors: ['INVALID_CREDENTIALS'],
    },
    'get-profile': { description: "Returns the current user's profile.", errors: [] },
    read: {
      description: 'Fetch the full public config.',
      errors: ['CLIENT_NOT_FOUND', 'ACCESO_DENEGADO_ROL'],
    },
    write: { description: 'Global merge update of the config.', errors: ['ACCESO_DENEGADO_ROL'] },
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
      description:
        'Find items in an array that match a filter (e.g. "product_id: 123"). Supports limit and offset for pagination.',
      errors: ['CLIENT_NOT_FOUND'],
    },
  };

  // Helper to convert dot notation ("a.b.c") to Postgres path array ("{"a","b","c"}")
  static parsePath(path) {
    return `{${path
      .split('.')
      .map((part) => `"${part}"`)
      .join(',')}}`;
  }

  static commands = {
    login: async function (user, payload) {
      const { username, password } = payload;

      const result = await db.query(
        'SELECT u.*, r.nombre as role_name FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        throw new EngineError('INVALID_CREDENTIALS', 'Invalid username or password.');
      }

      const userData = result.rows[0];
      const isValid = await bcrypt.compare(password, userData.password);

      if (!isValid) {
        throw new EngineError('INVALID_CREDENTIALS', 'Invalid username or password.');
      }

      // Token Rotation & Multi-device: Create a new session
      const { v4: uuidv4 } = require('uuid');
      const newToken = uuidv4();
      await db.query('INSERT INTO sesiones (usuario_id, token) VALUES ($1, $2)', [
        userData.id,
        newToken,
      ]);

      return {
        status: 'success',
        token: newToken,
        user: {
          id: userData.id,
          username: userData.username,
          role_name: userData.role_name,
        },
      };
    },

    'get-profile': async function (user) {
      console.log(`[DEBUG] get-profile requested for user.id: ${user.id}`);
      const result = await db.query(
        'SELECT u.id, u.username, u.cliente_id, r.nombre as role_name, c.nombre as cliente_nombre FROM usuarios u JOIN roles r ON u.role_id = r.id LEFT JOIN clientes c ON u.cliente_id = c.id WHERE u.id = $1',
        [user.id]
      );

      if (result.rows.length === 0) throw new EngineError('USER_NOT_FOUND', { id: user.id });
      return { status: 'success', profile: result.rows[0] };
    },

    read: async function (user, payload) {
      const { clienteId } = payload;

      if (!clienteId) throw new EngineError('ACCESO_DENEGADO_ROL', 'Cliente no identificado.');

      const result = await db.query('SELECT public_config FROM clientes WHERE id = $1', [
        clienteId,
      ]);
      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND', { id: clienteId });
      return { status: 'success', data: result.rows[0].public_config };
    },

    write: async function (user, payload) {
      const { clienteId, data } = payload;

      const result = await db.query(
        "UPDATE clientes SET public_config = COALESCE(public_config, '{}'::jsonb) || $2 WHERE id = $1 RETURNING public_config",
        [clienteId, JSON.stringify(data)]
      );
      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND');
      return { status: 'success', updatedData: result.rows[0].public_config };
    },

    'read-path': async function (user, payload) {
      const { clienteId, path } = payload;

      const pgPath = UserDomain.parsePath(path);
      const result = await db.query(
        'SELECT public_config #> $2 as value FROM clientes WHERE id = $1',
        [clienteId, pgPath]
      );
      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND');
      const value = result.rows[0].value;
      if (value === null) throw new EngineError('PATH_NOT_FOUND');
      return { status: 'success', value };
    },

    'update-path': async function (user, payload) {
      const { clienteId, path, value } = payload;

      if (path.includes('[') || path.includes(']')) {
        throw new EngineError(
          'INVALID_PATH_FORMAT',
          `Ruta recibida: '${path}' -> Formato no soportado.`
        );
      }

      const pgPath = UserDomain.parsePath(path);
      const result = await db.query(
        "UPDATE clientes SET public_config = jsonb_set(COALESCE(public_config, '{}'::jsonb), $2, $3::jsonb, true) WHERE id = $1 RETURNING public_config",
        [clienteId, pgPath, JSON.stringify(value)]
      );
      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND', { id: clienteId });
      return { status: 'success', updatedData: result.rows[0].public_config };
    },

    'push-item': async function (user, payload) {
      const { clienteId, path, item } = payload;

      const pgPath = UserDomain.parsePath(path);

      const result = await db.query(
        `UPDATE clientes
         SET public_config = jsonb_set(
           COALESCE(public_config, '{}'::jsonb),
           $2,
           COALESCE(public_config #> $2, '[]'::jsonb) || $3::jsonb,
           true
         )
         WHERE id = $1
         RETURNING public_config`,
        [clienteId, pgPath, JSON.stringify([item])]
      );

      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND', { id: clienteId });
      return { status: 'success', updatedData: result.rows[0].public_config };
    },

    'query-json': async function (user, payload) {
      const { clienteId, path, filter, limit, offset } = payload;

      const pgPath = UserDomain.parsePath(path);

      let query = `
        SELECT item FROM (
          SELECT jsonb_array_elements(public_config #> $2) as item
          FROM clientes WHERE id = $1
        ) sub
        WHERE item @> $3::jsonb
      `;
      const params = [clienteId, pgPath, JSON.stringify(filter)];

      if (limit !== undefined) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }

      if (offset !== undefined) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(offset);
      }

      const result = await db.query(query, params);
      return { status: 'success', results: result.rows.map((r) => r.item) };
    },

    logout: async function (user, payload) {
      const tokenToInvalidate = payload.token || user.token;
      if (!tokenToInvalidate) {
        throw new EngineError('AUTH_REQUIRED', 'No session token provided to logout.');
      }

      const result = await db.query('DELETE FROM sesiones WHERE token = $1', [tokenToInvalidate]);

      if (result.rowCount === 0) {
        throw new EngineError(
          'SESSION_NOT_FOUND',
          'Session token not found or already invalidated.'
        );
      }

      return { status: 'success', message: 'Session invalidated successfully.' };
    },

    'list-sessions': async function (user) {
      const result = await db.query(
        'SELECT token, created_at FROM sesiones WHERE usuario_id = $1',
        [user.id]
      );
      return {
        status: 'success',
        sessions: result.rows.map((s) => ({
          token: s.token,
          createdAt: s.created_at,
        })),
      };
    },

    'revoke-session': async function (user, payload) {
      const { token } = payload;

      // Security: Only allow revoking sessions belonging to the user
      const result = await db.query('DELETE FROM sesiones WHERE token = $1 AND usuario_id = $2', [
        token,
        user.id,
      ]);

      if (result.rowCount === 0) {
        throw new EngineError(
          'SESSION_NOT_FOUND',
          'Session token not found or does not belong to this user.'
        );
      }

      return { status: 'success', message: 'Session revoked successfully.' };
    },
  };
}

motor.registerDomain(UserDomain);

module.exports = {};
