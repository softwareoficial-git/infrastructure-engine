const motor = require('../core/motor');
const db = require('../core/db');

class SystemDomain {
  static domain = 'SYSTEM';

  static schemas = {
    init: { type: 'object', properties: {}, additionalProperties: true },
  };

  static commands = {
    init: async function (user, payload) {
      console.log('Inicializando base de datos...');

      // 1. Crear Tablas Base
      await db.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(50) UNIQUE NOT NULL,
          parent_id INTEGER REFERENCES roles(id)
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role_id INTEGER REFERENCES roles(id),
          token VARCHAR(255) UNIQUE NOT NULL,
          cliente_id INTEGER
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS clientes (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          public_config JSONB DEFAULT '{}',
          private_config JSONB DEFAULT '{}',
          schema_version INTEGER DEFAULT 1
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS plantillas (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL,
          contenido JSONB DEFAULT '{}',
          version INTEGER DEFAULT 1,
          es_oficial BOOLEAN DEFAULT false
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL
        );
      `);

      // Indexación para alto volumen de datos en JSONB
      // Usamos GIN con jsonb_path_ops para búsquedas rápidas de productos/claves
      await db.query(`
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
        const parentName = hierarchy[roleName];
        let parentId = null;
        if (parentName) {
          const parentRes = await db.query('SELECT id FROM roles WHERE nombre = $1', [parentName]);
          if (parentRes.rows.length > 0) parentId = parentRes.rows[0].id;
        }

        await db.query(
          'INSERT INTO roles (nombre, parent_id) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING',
          [roleName, parentId]
        );
      }

      // 3. Crear Super Admin Inicial
      const adminToken = 'ADMIN_SECRET_TOKEN_2026';
      await db.query(
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
  };
}

motor.registerDomain(SystemDomain);

module.exports = {};
