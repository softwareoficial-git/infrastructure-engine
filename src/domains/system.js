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
    'log-event': {
      type: 'object',
      properties: {
        tenantId: { type: 'integer' },
        userId: { type: 'integer' },
        command: { type: 'string' },
        status: { type: 'string', enum: ['SUCCESS', 'ERROR'] },
        errorCode: { type: 'string' },
        source: { type: 'string', enum: ['FRONTEND', 'BACKEND', 'CLIENT_APP'] },
        payload: { type: 'object' },
      },
      required: ['tenantId', 'status', 'source'],
    },
    'events-list': {
      type: 'object',
      properties: {
        tenantId: { type: 'integer' },
        userId: { type: 'integer' },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        limit: { type: 'integer', default: 50 },
        offset: { type: 'integer', default: 0 },
      },
      required: ['tenantId'],
    },
    'events-filter': {
      type: 'object',
      properties: {
        tenantId: { type: 'integer' },
        source: { type: 'string' },
        command: { type: 'string' },
        status: { type: 'string' },
        searchTerm: { type: 'string' },
      },
      required: ['tenantId'],
    },
    'events-stats': {
      type: 'object',
      properties: {
        tenantId: { type: 'integer' },
        rangeDays: { type: 'integer', default: 7 },
      },
      required: ['tenantId'],
    },
    'events-top-errors': {
      type: 'object',
      properties: {
        tenantId: { type: 'integer' },
        limit: { type: 'integer', default: 5 },
      },
      required: ['tenantId'],
    },
    'events-user-activity': {
      type: 'object',
      properties: {
        userId: { type: 'integer' },
        limit: { type: 'integer', default: 10 },
      },
      required: ['userId'],
    },
    'events-clear': {
      type: 'object',
      properties: {
        tenantId: { type: 'integer' },
        olderThanDays: { type: 'integer' },
      },
      required: ['tenantId', 'olderThanDays'],
    },
    'events-archive': {
      type: 'object',
      properties: {
        tenantId: { type: 'integer' },
        olderThanDays: { type: 'integer' },
      },
      required: ['tenantId', 'olderThanDays'],
    },
    'events-global': {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 100 },
        offset: { type: 'integer', default: 0 },
        role: { type: 'string' },
      },
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
    'log-event': {
      description: 'Records a system event from any source (Frontend, Backend, Client).',
      errors: ['DB_ERROR'],
    },
    'events-list': {
      description: 'Retrieves the raw event history with basic filtering.',
      errors: ['DB_ERROR'],
    },
    'events-filter': {
      description: 'Advanced filtering of events by technical attributes.',
      errors: ['DB_ERROR'],
    },
    'events-stats': {
      description: 'Generates statistical health summary for a tenant.',
      errors: ['DB_ERROR'],
    },
    'events-top-errors': {
      description: 'Lists the most frequent error codes for a tenant.',
      errors: ['DB_ERROR'],
    },
    'events-user-activity': {
      description: 'Analyzes the behavior and most used commands of a specific user.',
      errors: ['DB_ERROR'],
    },
    'events-clear': {
      description: 'Deletes old events to maintain performance.',
      errors: ['DB_ERROR'],
    },
    'events-archive': {
      description: 'Archives old events before deletion.',
      errors: ['DB_ERROR'],
    },
    'events-global': {
      description:
        'Retrieves all system events across all tenants, enriched with user roles and client names. Restricted to SUPER_ADMIN.',
      errors: ['DB_ERROR'],
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

      await (txClient || db).query(`
        CREATE TABLE IF NOT EXISTS system_events (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER,
          user_id INTEGER,
          command VARCHAR(100),
          status VARCHAR(20),
          error_code VARCHAR(50),
          source VARCHAR(50),
          payload JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await (txClient || db).query(`
        CREATE INDEX IF NOT EXISTS idx_events_tenant ON system_events(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_events_user ON system_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_events_created ON system_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_events_command ON system_events(command);
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

    'list-commands': async function () {
      return {
        status: 'success',
        commands: motor.listCommands(),
      };
    },

    help: async function () {
      return {
        status: 'success',
        message: 'Welcome to the Infrastructure Engine Help!',
        instructions:
          'Use the format DOMAIN:action. For a full list of commands, use SYSTEM:list-commands.',
      };
    },

    'log-event': async function (user, payload, txClient = null) {
      const { tenantId, userId, command, status, errorCode, source, payload: eventData } = payload;

      await (txClient || db).query(
        `INSERT INTO system_events (tenant_id, user_id, command, status, error_code, source, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, userId, command, status, errorCode, source, eventData || {}]
      );

      return { status: 'success', message: 'Evento registrado' };
    },

    'events-list': async function (user, payload, txClient = null) {
      const { tenantId, userId, startDate, endDate, limit = 50, offset = 0 } = payload;

      let query = 'SELECT * FROM system_events WHERE tenant_id = $1';
      const params = [tenantId];
      let paramIdx = 2;

      if (userId) {
        query += ` AND user_id = $${paramIdx++}`;
        params.push(userId);
      }
      if (startDate) {
        query += ` AND created_at >= $${paramIdx++}`;
        params.push(startDate);
      }
      if (endDate) {
        query += ` AND created_at <= $${paramIdx++}`;
        params.push(endDate);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(limit, offset);

      const result = await (txClient || db).query(query, params);
      return { status: 'success', events: result.rows };
    },

    'events-filter': async function (user, payload, txClient = null) {
      const { tenantId, source, command, status, searchTerm } = payload;

      let query = 'SELECT * FROM system_events WHERE tenant_id = $1';
      const params = [tenantId];
      let paramIdx = 2;

      if (source) {
        query += ` AND source = $${paramIdx++}`;
        params.push(source);
      }
      if (command) {
        query += ` AND command = $${paramIdx++}`;
        params.push(command);
      }
      if (status) {
        query += ` AND status = $${paramIdx++}`;
        params.push(status);
      }
      if (searchTerm) {
        query += ` AND (command ILIKE $${paramIdx} OR error_code ILIKE $${paramIdx + 1} OR payload::text ILIKE $${paramIdx + 2})`;
        params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
      }

      query += ` ORDER BY created_at DESC LIMIT 100`;

      const result = await (txClient || db).query(query, params);
      return { status: 'success', events: result.rows };
    },
    'events-stats': async function (user, payload) {
      const { tenantId, rangeDays = 7 } = payload;

      const query = `
        SELECT
          count(*) as total_requests,
          count(*) FILTER (WHERE status = 'SUCCESS') as success_count,
          count(*) FILTER (WHERE status = 'ERROR') as error_count,
          (count(*) FILTER (WHERE status = 'SUCCESS') * 100.0 / NULLIF(count(*), 0)) as success_rate
        FROM system_events
        WHERE tenant_id = $1 AND created_at >= CURRENT_DATE - interval '${rangeDays} days'
      `;

      const result = await db.query(query, [tenantId]);
      const stats = result.rows[0];

      const topErrorQuery = `
        SELECT error_code, count(*) as count
        FROM system_events
        WHERE tenant_id = $1 AND status = 'ERROR'
        GROUP BY error_code ORDER BY count DESC LIMIT 1
      `;
      const topErrorRes = await db.query(topErrorQuery, [tenantId]);

      return {
        status: 'success',
        stats: {
          ...stats,
          most_frequent_error: topErrorRes.rows[0] || null,
        },
      };
    },

    'events-top-errors': async function (user, payload, txClient = null) {
      const { tenantId, limit = 5 } = payload;

      const query = `
        SELECT error_code, count(*) as count
        FROM system_events
        WHERE tenant_id = $1 AND status = 'ERROR'
        GROUP BY error_code ORDER BY count DESC LIMIT $2
      `;

      const result = await (txClient || db).query(query, [tenantId, limit]);
      return { status: 'success', top_errors: result.rows };
    },

    'events-user-activity': async function (user, payload, txClient = null) {
      const { userId, limit = 10 } = payload;

      const query = `
        SELECT command, count(*) as usage_count
        FROM system_events
        WHERE user_id = $1
        GROUP BY command ORDER BY usage_count DESC LIMIT $2
      `;

      const result = await (txClient || db).query(query, [userId, limit]);
      return { status: 'success', activity: result.rows };
    },

    'events-clear': async function (user, payload, txClient = null) {
      const { tenantId, olderThanDays } = payload;

      const result = await (txClient || db).query(
        `DELETE FROM system_events
         WHERE tenant_id = $1 AND created_at < CURRENT_DATE - interval '${olderThanDays} days'`,
        [tenantId]
      );

      return { status: 'success', deleted_count: result.rowCount };
    },

    'events-archive': async function (user, payload, txClient = null) {
      const { tenantId, olderThanDays } = payload;

      await (txClient || db).query(`
        CREATE TABLE IF NOT EXISTS system_events_archive (LIKE system_events INCLUDING ALL)
      `);

      const moveResult = await (txClient || db).query(
        `
        WITH moved_rows AS (
          DELETE FROM system_events
          WHERE tenant_id = $1 AND created_at < CURRENT_DATE - interval '${olderThanDays} days'
          RETURNING *
        )
        INSERT INTO system_events_archive SELECT * FROM moved_rows
      `,
        [tenantId]
      );

      return { status: 'success', archived_count: moveResult.rowCount };
    },

    'migrate-schema': async function (user, payload, txClient = null) {
      const { targetVersion } = payload;
      const client = txClient || db;

      // 1. Get current version from 'clientes' table (using the first client as reference)
      const versionCheck = await client.query('SELECT schema_version FROM clientes LIMIT 1');
      const currentVersion = versionCheck.rows.length > 0 ? versionCheck.rows[0].schema_version : 1;

      console.log(`Migrating schema from v${currentVersion} to v${targetVersion}...`);

      if (currentVersion < 3 && targetVersion >= 3) {
        console.log('Applying Migration v3: Creating system_events table...');
        await client.query(`
          CREATE TABLE IF NOT EXISTS system_events (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER,
            user_id INTEGER,
            command VARCHAR(100),
            status VARCHAR(20),
            error_code VARCHAR(50),
            source VARCHAR(50),
            payload JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_events_tenant ON system_events(tenant_id);
          CREATE INDEX IF NOT EXISTS idx_events_user ON system_events(user_id);
          CREATE INDEX IF NOT EXISTS idx_events_created ON system_events(created_at);
          CREATE INDEX IF NOT EXISTS idx_events_command ON system_events(command);
        `);

        // Update version in clientes table
        await client.query('UPDATE clientes SET schema_version = 3');
        console.log('✅ Migration v3 completed.');
      }

      return {
        status: 'success',
        from: currentVersion,
        to: targetVersion,
        message: 'Schema migration completed successfully',
      };
    },

    'events-global': async function (user, payload, txClient = null) {
      const { limit = 100, offset = 0, role } = payload;

      let query = `
        SELECT
          e.*,
          u.username as user_name,
          r.nombre as role_name,
          c.nombre as cliente_nombre
        FROM system_events e
        LEFT JOIN usuarios u ON e.user_id = u.id
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN clientes c ON e.tenant_id = c.id
      `;

      const params = [];
      if (role) {
        query += ` WHERE r.nombre = $1`;
        params.push(role);
      }

      query += ` ORDER BY e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await (txClient || db).query(query, params);

      return {
        status: 'success',
        total: result.rowCount,
        events: result.rows,
      };
    },

    'users-global-list': async function (user, payload, txClient = null) {
      const { limit = 100, offset = 0 } = payload;

      const query = `
        SELECT
          u.id,
          u.username,
          u.token,
          u.cliente_id,
          r.nombre as role_name,
          c.nombre as cliente_nombre,
          c.schema_version
        FROM usuarios u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN clientes c ON u.cliente_id = c.id
        ORDER BY r.id ASC, u.username ASC
        LIMIT $1 OFFSET $2
      `;

      const result = await (txClient || db).query(query, [limit, offset]);

      return {
        status: 'success',
        total: result.rowCount,
        users: result.rows,
      };
    },

    'user-audit': async function (user, payload, txClient = null) {
      const { userId, limit = 50, offset = 0 } = payload;

      const query = `
        SELECT
          e.*,
          c.nombre as cliente_nombre,
          r.nombre as role_name
        FROM system_events e
        LEFT JOIN clientes c ON e.tenant_id = c.id
        LEFT JOIN usuarios u ON e.user_id = u.id
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE e.user_id = $1
        ORDER BY e.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await (txClient || db).query(query, [userId, limit, offset]);

      return {
        status: 'success',
        total: result.rowCount,
        timeline: result.rows,
      };
    },

    'tenant-audit': async function (user, payload, txClient = null) {
      const { tenantId, limit = 50, offset = 0 } = payload;

      const query = `
        SELECT
          e.*,
          u.username as user_name,
          r.nombre as role_name
        FROM system_events e
        LEFT JOIN usuarios u ON e.user_id = u.id
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE e.tenant_id = $1
        ORDER BY e.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await (txClient || db).query(query, [tenantId, limit, offset]);

      return {
        status: 'success',
        total: result.rowCount,
        timeline: result.rows,
      };
    },
  };
}

motor.registerDomain(SystemDomain);

module.exports = {};
