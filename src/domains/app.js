const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

// --- SCHEMAS ---
const BASE_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    stock: { type: 'array' },
    precios: { type: 'object' },
    categorias: { type: 'array' },
  },
  required: ['stock', 'precios'],
};

class AppDomain {
  static domain = 'APP';

  static schemas = {
    'template-create': {
      type: 'object',
      properties: {
        nombre: { type: 'string', minLength: 1 },
        contenido: BASE_CONFIG_SCHEMA,
      },
      required: ['nombre', 'contenido'],
    },
    'template-publish': {
      type: 'object',
      properties: {
        templateId: { type: 'integer' },
      },
      required: ['templateId'],
    },
    'client-create': {
      type: 'object',
      properties: {
        nombre: { type: 'string', minLength: 1 },
      },
      required: ['nombre'],
    },
    'update-client-plan': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        plan: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
      },
      required: ['clienteId', 'plan'],
    },
    'migrate-global': {
      type: 'object',
      properties: {
        targetVersion: { type: 'integer' },
        transformation: { type: 'object' },
      },
      required: ['targetVersion', 'transformation'],
    },
    'client-delete': {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
      },
      required: ['clienteId'],
    },
    'self-register': {
      type: 'object',
      properties: {
        nombreCliente: { type: 'string', minLength: 1 },
        username: { type: 'string', minLength: 3 },
        password: { type: 'string', minLength: 6 },
      },
      required: ['nombreCliente', 'username', 'password'],
    },
  };

  static docs = {
    'client-create': {
      description: 'Creates a new client with a default official template and a "free" plan.',
      errors: ['NO_OFFICIAL_TEMPLATE'],
    },
    'update-client-plan': {
      description:
        "Updates a client's subscription plan (e.g., from free to pro) in their private configuration.",
      errors: ['CLIENT_NOT_FOUND', 'FORBIDDEN'],
    },
    'template-create': { description: 'Creates a global template.', errors: ['INVALID_PAYLOAD'] },
    'template-publish': {
      description: 'Sets a template as the official default.',
      errors: ['TEMPLATE_NOT_FOUND'],
    },
    'migrate-global': {
      description: 'Migrates all clients to a new schema version.',
      errors: ['DB_ERROR'],
    },
    'client-delete': {
      description: 'Deletes a client and all their users.',
      errors: ['CLIENT_NOT_FOUND'],
    },
    'self-register': {
      description: 'Public endpoint to register a new client and its administrative user.',
      errors: ['USER_EXISTS', 'NO_OFFICIAL_TEMPLATE', 'DB_ERROR'],
    },
  };

  static commands = {
    'template-create': async function (user, payload) {
      const { nombre, contenido } = payload;

      const result = await db.query(
        'INSERT INTO plantillas (nombre, contenido) VALUES ($1, $2) RETURNING *',
        [nombre, contenido]
      );

      return { status: 'success', template: result.rows[0] };
    },

    'template-publish': async function (user, payload, txClient = null) {
      const { templateId } = payload;

      const executePublish = async (client) => {
        await client.query('UPDATE plantillas SET es_oficial = false');
        const result = await client.query(
          'UPDATE plantillas SET es_oficial = true WHERE id = $1 RETURNING *',
          [templateId]
        );
        return result;
      };

      if (txClient) {
        const result = await executePublish(txClient);
        if (result.rows.length === 0) throw new EngineError('TEMPLATE_NOT_FOUND');
        return { status: 'success', message: 'Plantilla publicada', template: result.rows[0] };
      }

      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        const result = await executePublish(client);
        await client.query('COMMIT');
        if (result.rows.length === 0) throw new EngineError('TEMPLATE_NOT_FOUND');
        return { status: 'success', message: 'Plantilla publicada', template: result.rows[0] };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    'client-create': async function (user, payload) {
      const { nombre } = payload;

      const templateRes = await db.query(
        'SELECT contenido FROM plantillas WHERE es_oficial = true LIMIT 1'
      );
      if (templateRes.rows.length === 0) throw new EngineError('NO_OFFICIAL_TEMPLATE');

      const officialContent = templateRes.rows[0].contenido;

      const clientRes = await db.query(
        'INSERT INTO clientes (nombre, public_config, private_config) VALUES ($1, $2, $3) RETURNING *',
        [nombre, officialContent, JSON.stringify({ plan: 'free' })]
      );

      return { status: 'success', cliente: clientRes.rows[0] };
    },

    'update-client-plan': async function (user, payload) {
      const { clienteId, plan } = payload;

      const result = await db.query(
        "UPDATE clientes SET private_config = private_config || jsonb_build_object('plan', $2::text) WHERE id = $1 RETURNING private_config",
        [clienteId, plan]
      );

      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND');
      return {
        status: 'success',
        message: `Plan actualizado a ${plan}`,
        newPrivateConfig: result.rows[0].private_config,
      };
    },

    'migrate-global': async function (user, payload) {
      const { targetVersion, transformation } = payload;

      if (transformation.add_field) {
        // Perform a bulk update using jsonb_set for all clients in a single query
        await db.query(
          `UPDATE clientes
           SET public_config = jsonb_set(public_config, $1, $2::jsonb, true),
               schema_version = $3`,
          [`{${transformation.add_field}}`, JSON.stringify(transformation.default), targetVersion]
        );
      } else {
        // If no specific transformation, just update the version
        await db.query('UPDATE clientes SET schema_version = $1', [targetVersion]);
      }

      return {
        status: 'success',
        message: `Migración a versión ${targetVersion} completada masivamente para todos los clientes`,
      };
    },

    'client-delete': async function (user, payload) {
      const { clienteId } = payload;
      // Delete associated users first to avoid FK violation
      await db.query('DELETE FROM usuarios WHERE cliente_id = $1', [clienteId]);

      const result = await db.query('DELETE FROM clientes WHERE id = $1 RETURNING id', [clienteId]);
      if (result.rows.length === 0) throw new EngineError('CLIENT_NOT_FOUND');
      return { status: 'success', message: 'Cliente eliminado' };
    },

    'self-register': async function (user, payload) {
      const { nombreCliente, username, password } = payload;
      const { v4: uuidv4 } = require('uuid');

      // 1. Check if username already exists
      const userCheck = await db.query('SELECT id FROM usuarios WHERE username = $1', [username]);
      if (userCheck.rows.length > 0) {
        throw new EngineError('USER_EXISTS', `The username '${username}' is already taken.`);
      }

      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // 2. Create Client (Logic mirrored from client-create)
        const templateRes = await client.query(
          'SELECT contenido FROM plantillas WHERE es_oficial = true LIMIT 1'
        );
        if (templateRes.rows.length === 0) throw new EngineError('NO_OFFICIAL_TEMPLATE');
        const officialContent = templateRes.rows[0].contenido;

        const clientRes = await client.query(
          'INSERT INTO clientes (nombre, public_config, private_config) VALUES ($1, $2, $3) RETURNING *',
          [nombreCliente, officialContent, JSON.stringify({ plan: 'free' })]
        );
        const newCliente = clientRes.rows[0];

        // 3. Find the 'CLIENTE' role ID
        const roleRes = await client.query("SELECT id FROM roles WHERE nombre = 'CLIENTE'");
        if (roleRes.rows.length === 0)
          throw new EngineError('INTERNAL_ERROR', 'Role CLIENTE not found.');
        const roleId = roleRes.rows[0].id;

        // 4. Create User
        const token = uuidv4();
        const userRes = await client.query(
          'INSERT INTO usuarios (username, password, role_id, token, cliente_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [username, password, roleId, token, newCliente.id]
        );
        const newUser = userRes.rows[0];

        await client.query('COMMIT');

        return {
          status: 'success',
          message: 'Registration successful',
          cliente: {
            id: newCliente.id,
            nombre: newCliente.nombre,
          },
          user: {
            id: newUser.id,
            username: newUser.username,
            token: token,
          },
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

motor.registerDomain(AppDomain);

module.exports = {};
