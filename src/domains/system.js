const motor = require('../core/motor');
const db = require('../core/db');

class SystemDomain {
  static domain = 'SYSTEM';

  static schemas = {
    init: { type: 'object', properties: {}, additionalProperties: true },
    batch: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              cmd: { type: 'string', minLength: 1 },
              payload: { type: 'object' },
            },
            required: ['cmd'],
          },
        },
      },
      required: ['commands'],
    },
  };

  static docs = {
    init: {
      description: 'Initializes the database tables and default roles.',
      errors: ['DB_ERROR'],
    },
    batch: {
      description:
        'Executes multiple commands atomically in a single transaction. If one fails, all are rolled back.',
      errors: ['BATCH_ERROR', 'CMD_NOT_FOUND', 'INVALID_PAYLOAD', 'FORBIDDEN'],
    },
    'list-commands': {
      description: 'Returns a full catalog of all available domains and commands.',
      errors: [],
    },
    help: {
      description: 'Provides general usage instructions for the engine.',
      errors: [],
    },
  };

  static commands = {
    batch: async function (user, payload, txClient = null) {
      // If already in a transaction, we just execute sequentially without a new transaction
      if (txClient) {
        const results = [];
        for (const item of payload.commands) {
          results.push(await motor.execute(user, item.cmd, item.payload || {}, txClient));
        }
        return { status: 'success', results };
      }

      // Start a new atomic transaction
      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        const results = [];
        for (const item of payload.commands) {
          const res = await motor.execute(user, item.cmd, item.payload || {}, client);
          results.push(res);
        }

        await client.query('COMMIT');
        return { status: 'success', results };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    init: async function (user, payload, txClient = null) {
      console.log('Inicializando base de datos...');

      // 1. Crear Tablas Base
      await (txClient || db).query(`
        CREATE TABLE IF NOT EXISTS roles (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(50) UNIQUE NOT NULL,
          parent_id INTEGER REFERENCES roles(id)
        );
      `);

      await (txClient || db).query(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role_id INTEGER REFERENCES roles(id),
          token VARCHAR(255) UNIQUE NOT NULL,
          cliente_id INTEGER
        );
      `);

      await (txClient || db).query(`
        CREATE TABLE IF NOT EXISTS clientes (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          public_config JSONB DEFAULT '{}',
          private_config JSONB DEFAULT '{}',
          schema_version INTEGER DEFAULT 1
        );
      `);

      await (txClient || db).query(`
        CREATE TABLE IF NOT EXISTS plantillas (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL,
          contenido JSONB DEFAULT '{}',
          version INTEGER DEFAULT 1,
          es_oficial BOOLEAN DEFAULT false
        );
      `);

      await (txClient || db).query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL
        );
      `);

      // Indexación para alto volumen de datos en JSONB
      // Usamos GIN con jsonb_path_ops para búsquedas rápidas de productos/claves
      await (txClient || db).query(`
        CREATE INDEX IF NOT EXISTS idx_clientes_public_config
        ON clientes USING GIN (public_config jsonb_path_ops);
      `);

      // 2. Cargar Roles Jerárquicos (Dinámicamente)
      const rolesToCreate = ['SUPER_ADMIN', 'APP', 'CLIENTE', 'USUARIO'];
      const hierarchy = {
        SUPER_ADMIN: null,
        APP: 'SUPER_ADMIN',
        CLIENTE: 'APP',
        USUARIO: 'CLIENTE',
      };

      for (const roleName of rolesToCreate) {
        await (txClient || db).query(
          'INSERT INTO roles (nombre, parent_id) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING',
          [roleName, null]
        );
      }

      for (const [roleName, parentName] of Object.entries(hierarchy)) {
        if (parentName) {
          const parentRes = await (txClient || db).query('SELECT id FROM roles WHERE nombre = $1', [
            parentName,
          ]);
          if (parentRes.rows.length > 0) {
            const parentId = parentRes.rows[0].id;
            await (txClient || db).query('UPDATE roles SET parent_id = $1 WHERE nombre = $2', [
              parentId,
              roleName,
            ]);
          }
        }
      }

      // 3. Crear Super Admin Inicial
      const adminToken = process.env.ADMIN_SECRET_TOKEN;
      await (txClient || db).query(
        `INSERT INTO usuarios (username, password, role_id, token)
         VALUES ('superadmin', 'admin123', (SELECT id FROM roles WHERE nombre = 'SUPER_ADMIN'), $1)
         ON CONFLICT (username) DO NOTHING`,
        [adminToken]
      );

      return {
        status: 'success',
        message: 'Sistema inicializado correctamente',
        adminToken: adminToken,
      };
    },

    'list-commands': async function (user, payload, txClient = null) {
      return {
        status: 'success',
        commands: motor.listCommands(),
      };
    },

    help: async function (user, payload, txClient = null) {
      return {
        status: 'success',
        message: 'Welcome to the Infrastructure Engine Help!',
        instructions:
          'Use the format DOMAIN:action. For a full list of commands, use SYSTEM:list-commands.',
      };
    },
  };
}

motor.registerDomain(SystemDomain);

module.exports = {};
