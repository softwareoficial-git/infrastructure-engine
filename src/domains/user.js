const motor = require('../core/motor');
const db = require('../core/db');

class UserDomain {
  static domain = 'USER';

  static schemas = {
    read: {
      type: 'object',
      description: 'Reads the public configuration of a specific client.',
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client to read.' },
      },
      required: ['clienteId'],
    },
    write: {
      type: 'object',
      description: "Updates or adds new data to a client's public configuration.",
      properties: {
        clienteId: { type: 'integer', description: 'The unique ID of the client to update.' },
        data: { type: 'object', description: 'The JSON object containing the data to merge.' },
      },
      required: ['clienteId', 'data'],
    },
  };

  static docs = {
    read: {
      description: 'Fetch the full public config (stock, prices, etc.) for a client.',
      errors: ['CLIENT_NOT_FOUND', 'FORBIDDEN'],
    },
    write: {
      description:
        "Update a client's config. Uses a JSON merge, so it only updates provided fields.",
      errors: ['FORBIDDEN'],
    },
  };

  static commands = {
    read: async function (user, payload) {
      const { clienteId } = payload;
      if (!clienteId) throw new Error('clienteId es requerido');

      const result = await db.query('SELECT public_config FROM clientes WHERE id = $1', [
        clienteId,
      ]);

      if (result.rows.length === 0) throw new Error('Cliente no encontrado');
      return { status: 'success', data: result.rows[0].public_config };
    },

    write: async function (user, payload) {
      const { clienteId, data } = payload;
      if (!clienteId || !data) throw new Error('clienteId y data son requeridos');

      const result = await db.query(
        'UPDATE clientes SET public_config = public_config || $2 WHERE id = $1 RETURNING public_config',
        [clienteId, JSON.stringify(data)]
      );

      return { status: 'success', updatedData: result.rows[0].public_config };
    },
  };
}

motor.registerDomain(UserDomain);

module.exports = {};
