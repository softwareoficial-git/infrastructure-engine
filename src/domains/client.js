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
    'schema-extend': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        newFields: { type: 'object' },
      },
      required: ['clienteId', 'newFields'],
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
