const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

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
        tenantId: { type: ['integer', 'null'] },
        userId: { type: ['integer', 'null'] },
        command: { type: 'string' },
        status: { type: 'string', enum: ['SUCCESS', 'ERROR'] },
        errorCode: { type: 'string' },
        source: { type: 'string', enum: ['FRONTEND', 'BACKEND', 'CLIENT_APP'] },
        ip_address: { type: 'string' },
        user_agent: { type: 'string' },
        app_id: { type: 'string' },
        request_id: { type: 'string' },
        payload: { type: 'object' },
      },
      required: ['status', 'source'],
    },
    'events-list': {
      type: 'object',
      properties: {
        tenantId: { type: ['integer', 'null'] },
        userId: { type: ['integer', 'null'] },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        limit: { type: 'integer', default: 50 },
        offset: { type: 'integer', default: 0 },
      },
      required: [],
    },
    'events-filter': {
      type: 'object',
      properties: {
        tenantId: { type: ['integer', 'null'] },
        source: { type: 'string' },
        command: { type: 'string' },
        status: { type: 'string' },
        app_id: { type: 'string' },
        ip_address: { type: 'string' },
        searchTerm: { type: 'string' },
      },
      required: [],
    },
    'events-stats': {
      type: 'object',
      properties: {
        tenantId: { type: ['integer', 'null'] },
        rangeDays: { type: 'integer', default: 7 },
      },
      required: [],
    },
    'events-top-errors': {
      type: 'object',
      properties: {
        tenantId: { type: ['integer', 'null'] },
        limit: { type: 'integer', default: 5 },
      },
      required: [],
    },
    'events-user-activity': {
      type: 'object',
      properties: {
        userId: { type: ['integer', 'null'] },
        limit: { type: 'integer', default: 10 },
      },
      required: [],
    },
    'user-delete': {
      type: 'object',
      properties: {
        userId: { type: 'integer' },
      },
      required: ['userId'],
    },
    'create-admin': {
      type: 'object',
      properties: {
        username: { type: 'string', minLength: 1 },
        password: { type: 'string', minLength: 6 },
      },
      required: ['username', 'password'],
    },
    'clients-status-report': {
      type: 'object',
      properties: {},
      required: [],
      description: 'Generates a masive report of all clients and their subscription status.',
    },
    'list-users-detailed': {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 100 },
        offset: { type: 'integer', default: 0 },
      },
      required: [],
      description: 'Lists all users with their associated client and subscription plan details.',
    },
    'events-clear': {
      type: 'object',
      properties: {
        tenantId: { type: ['integer', 'null'] },
        olderThanDays: { type: 'integer' },
      },
      required: [],
    },
    'events-archive': {
      type: 'object',
      properties: {
        tenantId: { type: ['integer', 'null'] },
        olderThanDays: { type: 'integer' },
      },
      required: [],
    },
    'clear-all': {
      type: 'object',
      properties: {},
      required: [],
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
      errors: ['BATCH_ERROR', 'CMD_NOT_FOUND', 'INVALID_PAYLOAD', 'ACCESO_DENEGADO_ROL'],
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
    'user-delete': {
      description: 'Deletes a specific user by ID. Restricted to SUPER_ADMIN.',
      errors: ['DB_ERROR', 'ACCESO_DENEGADO_ROL', 'USER_NOT_FOUND'],
    },
    'clients-status-report': {
      type: 'object',
      properties: {},
      required: [],
      description: 'Generates a masive report of all clients and their subscription status.',
    },
    'list-users-detailed': {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 100 },
        offset: { type: 'integer', default: 0 },
      },
      required: [],
      description: 'Lists all users with their associated client and subscription plan details.',
    },
    'events-clear': {
      description: 'Deletes old events to maintain performance.',
      errors: ['DB_ERROR'],
    },
    'events-archive': {
      description: 'Archives old events before deletion.',
      errors: ['DB_ERROR'],
    },
    'clear-all': {
      description: 'Wipes all system events across all tenants. Restricted to SUPER_ADMIN.',
      errors: ['DB_ERROR'],
    },
    'events-global': {
      description:
        'Retrieves all system events across all tenants, enriched with user roles and client names. Restricted to SUPER_ADMIN.',
      errors: ['DB_ERROR'],
    },
  };

  static async _runMigrations(client, targetVersion) {
    if (targetVersion === 12) {
        console.log('⚠️ Ejecutando reset destructivo y migración base a v12...');
        try {
            await client.query('BEGIN');
            
            // Eliminar todo
            await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;');
            
            // Recrear estructura base + PaymentConfigs
            await client.query(`
                CREATE TABLE clientes (id SERIAL PRIMARY KEY, nombre VARCHAR(255) NOT NULL, public_config JSONB DEFAULT '{}', private_config JSONB DEFAULT '{}', schema_version INTEGER DEFAULT 12, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE plantillas (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, contenido JSONB DEFAULT '{}', version INTEGER DEFAULT 1, es_oficial BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE roles (id SERIAL PRIMARY KEY, nombre VARCHAR(50) UNIQUE NOT NULL, parent_id INTEGER REFERENCES roles(id));
                CREATE TABLE usuarios (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password TEXT NOT NULL, role_id INTEGER REFERENCES roles(id), token VARCHAR(255), cliente_id INTEGER, permisos JSONB DEFAULT '[]', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE sesiones (id SERIAL PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE, token VARCHAR(255) UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE system_settings (key VARCHAR(100) PRIMARY KEY, value JSONB NOT NULL);
                CREATE TABLE system_events (id SERIAL PRIMARY KEY, tenant_id INTEGER, user_id INTEGER, command VARCHAR(100), status VARCHAR(20), error_code VARCHAR(50), source VARCHAR(50), ip_address VARCHAR(45), user_agent TEXT, app_id VARCHAR(100), request_id VARCHAR(100), payload JSONB DEFAULT '{}', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE logs_trafico (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id INTEGER NOT NULL, visit_type VARCHAR(50), url TEXT, referrer TEXT, user_agent TEXT, language VARCHAR(10), request_id VARCHAR(100), ip_address VARCHAR(45), timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, country VARCHAR(100), city VARCHAR(100), isp VARCHAR(255), browser VARCHAR(50), os VARCHAR(50), device_type VARCHAR(50));
                CREATE TABLE geoip_data (id SERIAL PRIMARY KEY, ip_start INET NOT NULL, ip_end INET NOT NULL, country VARCHAR(100), city VARCHAR(100), isp VARCHAR(255));
                CREATE TABLE sales_history (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, total_amount NUMERIC(10, 2) NOT NULL, ticket_id UUID, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
                
                CREATE TABLE PaymentConfigs (
                    id SERIAL PRIMARY KEY,
                    tenant_id INTEGER NOT NULL,
                    gateway_type VARCHAR(50) NOT NULL,
                    config_data JSONB NOT NULL DEFAULT '{}',
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    environment VARCHAR(20) NOT NULL DEFAULT 'production',
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE UNIQUE INDEX idx_payment_configs_tenant_gateway ON PaymentConfigs(tenant_id, gateway_type);

                -- Insertar datos base
                INSERT INTO clientes (nombre, schema_version) VALUES ('Default Tenant', 12);
                INSERT INTO roles (nombre) VALUES ('SUPER_ADMIN'), ('ADMINISTRADOR'), ('DUEÑO'), ('EMPLEADO');
            `);
            
            await client.query('COMMIT');
            console.log('✅ Base de datos reseteada y migrada a v12.');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Reset destructivo fallido:', error);
            throw error;
        }
    }
    return { from: 0, to: 12 };
  }

  static commands = {
    batch: async function (user, payload, txClient = null) {
        // ... (resto de commands)

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
      console.log('🚀 Iniciando Bootstrapping Resiliente del Sistema...');
      const { hashPassword } = require('../utils/security');
      const client = txClient || db;
      
      // Automatización: Ejecutar migraciones automáticamente
      // Nota: Aquí definimos la última versión deseada.
      // Actualmente la última migración implementada es la v12.
      try {
        await SystemDomain._runMigrations(client, 12);
        console.log('✅ Migraciones automáticas completadas.');
      } catch (err) {
        console.error('❌ Error en migraciones automáticas:', err);
        throw err;
      }

      const tasks = {
        infra: [
          {
            name: 'Instalación de Extensiones',
            sql: 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
            critical: false,
          },
        ],
        schema: [
          {
            name: 'Tabla de Roles',
            sql: 'CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, nombre VARCHAR(50) UNIQUE NOT NULL, parent_id INTEGER REFERENCES roles(id));',
          },
          {
            name: 'Tabla de Usuarios',
            sql: "CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password TEXT NOT NULL, role_id INTEGER REFERENCES roles(id), token VARCHAR(255), cliente_id INTEGER, permisos JSONB DEFAULT '[]', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
          },
          {
            name: 'Tabla de Sesiones',
            sql: 'CREATE TABLE IF NOT EXISTS sesiones (id SERIAL PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE, token VARCHAR(255) UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);',
          },
          {
            name: 'Tabla de Clientes',
            sql: "CREATE TABLE IF NOT EXISTS clientes (id SERIAL PRIMARY KEY, nombre VARCHAR(255) NOT NULL, public_config JSONB DEFAULT '{}', private_config JSONB DEFAULT '{}', schema_version INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
          },
          {
            name: 'Tabla de Plantillas',
            sql: "CREATE TABLE IF NOT EXISTS plantillas (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, contenido JSONB DEFAULT '{}', version INTEGER DEFAULT 1, es_oficial BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
          },
          {
            name: 'Tabla de Settings',
            sql: 'CREATE TABLE IF NOT EXISTS system_settings (key VARCHAR(100) PRIMARY KEY, value JSONB NOT NULL);',
          },
          {
            name: 'Tabla de Eventos',
            sql: "CREATE TABLE IF NOT EXISTS system_events (id SERIAL PRIMARY KEY, tenant_id INTEGER, user_id INTEGER, command VARCHAR(100), status VARCHAR(20), error_code VARCHAR(50), source VARCHAR(50), ip_address VARCHAR(45), user_agent TEXT, app_id VARCHAR(100), request_id VARCHAR(100), payload JSONB DEFAULT '{}', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);",
          },
          {
            name: 'Tabla de Tráfico',
            sql: 'CREATE TABLE IF NOT EXISTS logs_trafico (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id INTEGER NOT NULL, visit_type VARCHAR(50), url TEXT, referrer TEXT, user_agent TEXT, language VARCHAR(10), request_id VARCHAR(100), ip_address VARCHAR(45), timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, country VARCHAR(100), city VARCHAR(100), isp VARCHAR(255), browser VARCHAR(50), os VARCHAR(50), device_type VARCHAR(50));',
          },
          {
            name: 'Tabla de GeoIP',
            sql: 'CREATE TABLE IF NOT EXISTS geoip_data (id SERIAL PRIMARY KEY, ip_start INET NOT NULL, ip_end INET NOT NULL, country VARCHAR(100), city VARCHAR(100), isp VARCHAR(255));',
          },
          {
            name: 'Tabla de Historial de Ventas',
            sql: `CREATE TABLE IF NOT EXISTS sales_history (
                    id SERIAL PRIMARY KEY,
                    tenant_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    product_name TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    total_amount NUMERIC(10, 2) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                  );
                  CREATE INDEX IF NOT EXISTS idx_sales_tenant_created ON sales_history(tenant_id, created_at);`,
          },
          {
            name: 'Índices de Optimización',
            sql: `
              CREATE INDEX IF NOT EXISTS idx_events_tenant ON system_events(tenant_id);
              CREATE INDEX IF NOT EXISTS idx_events_user ON system_events(user_id);
              CREATE INDEX IF NOT EXISTS idx_events_created ON system_events(created_at);
              CREATE INDEX IF NOT EXISTS idx_events_command ON system_events(command);
              CREATE INDEX IF NOT EXISTS idx_trafico_timestamp ON logs_trafico(timestamp);
              CREATE INDEX IF NOT EXISTS idx_trafico_country ON logs_trafico(country);
              CREATE INDEX IF NOT EXISTS idx_trafico_type ON logs_trafico(visit_type);
              CREATE INDEX IF NOT EXISTS idx_geoip_start ON geoip_data(ip_start);
              CREATE INDEX IF NOT EXISTS idx_geoip_end ON geoip_data(ip_end);
              CREATE INDEX IF NOT EXISTS idx_clientes_public_config ON clientes USING GIN (public_config jsonb_path_ops);
            `,
          },
        ],
        data: [
          {
            name: 'Roles Base',
            fn: async (cl) => {
              const rolesToCreate = ['SUPER_ADMIN', 'ADMINISTRADOR', 'DUEÑO', 'EMPLEADO'];
              for (const roleName of rolesToCreate) {
                await cl.query(
                  'INSERT INTO roles (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING',
                  [roleName]
                );
              }
            },
          },
          {
            name: 'Usuario Super Admin',
            fn: async (cl) => {
              const adminToken = process.env.ADMIN_SECRET_TOKEN || 'BOOTSTRAP_TOKEN';
              const adminPasswordHash = await hashPassword('admin123');
              await cl.query(
                `INSERT INTO usuarios (username, password, role_id, token, cliente_id)
                 VALUES ('superadmin', $1, (SELECT id FROM roles WHERE nombre = 'SUPER_ADMIN'), $2, NULL)
                 ON CONFLICT (username) DO NOTHING`,
                [adminPasswordHash, adminToken]
              );
            },
          },
          {
            name: 'Official Default Template',
            fn: async (cl) => {
              const existing = await cl.query(
                'SELECT id FROM plantillas WHERE es_oficial = true LIMIT 1'
              );
              if (existing.rows.length === 0) {
                await cl.query(
                  `INSERT INTO plantillas (nombre, contenido, es_oficial)
                   VALUES ($1, $2, true)`,
                  [
                    'Official Default Template',
                    JSON.stringify({ stock: [], precios: {}, categorias: [] }),
                  ]
                );
              }
            },
          },
        ],
      };

      try {
        // 1. Ejecutar Infraestructura
        for (const task of tasks.infra) {
          try {
            await client.query(task.sql);
            console.log(`✅ Infra: ${task.name} completado.`);
          } catch (e) {
            if (task.critical)
              throw new EngineError(
                'BOOTSTRAP_CRITICAL',
                `Fallo en infraestructura: ${task.name} - ${e.message}`
              );
            console.warn(`⚠️ Infra: ${task.name} omitido (${e.message})`);
          }
        }

        // 2. Ejecutar Esquema
        for (const task of tasks.schema) {
          try {
            await client.query(task.sql);
            console.log(`✅ Schema: ${task.name} completado.`);
          } catch (e) {
            throw new EngineError(
              'BOOTSTRAP_SCHEMA_ERROR',
              `Fallo en esquema: ${task.name} - ${e.message}`
            );
          }
        }

        // 3. Ejecutar Datos
        for (const task of tasks.data) {
          try {
            await task.fn(client);
            console.log(`✅ Data: ${task.name} completado.`);
          } catch (e) {
            throw new EngineError(
              'BOOTSTRAP_DATA_ERROR',
              `Fallo en datos: ${task.name} - ${e.message}`
            );
          }
        }

        return {
          status: 'success',
          message: 'Sistema inicializado correctamente con bootstrapping resiliente',
          adminToken: process.env.ADMIN_SECRET_TOKEN || 'BOOTSTRAP_TOKEN',
        };
      } catch (error) {
        if (error instanceof EngineError) throw error;
        console.error('❌ Error no manejado durante el bootstrapping:', error);
        throw new EngineError(
          'BOOTSTRAP_FATAL',
          `Error inesperado en inicialización: ${error.message}`
        );
      }
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
      const {
        tenantId,
        userId,
        command,
        status,
        errorCode,
        source,
        ip_address,
        user_agent,
        app_id,
        request_id,
        payload: eventData,
      } = payload;

      await (txClient || db).query(
        `INSERT INTO system_events (
          tenant_id, user_id, command, status, error_code, source,
          ip_address, user_agent, app_id, request_id, payload
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenantId,
          userId,
          command,
          status,
          errorCode,
          source,
          ip_address,
          user_agent,
          app_id,
          request_id,
          eventData || {},
        ]
      );

      return { status: 'success', message: 'Evento registrado' };
    },

    'events-list': async function (user, payload, txClient = null) {
      const { tenantId, userId, startDate, endDate, limit = 50, offset = 0 } = payload;

      let query = 'SELECT * FROM system_events WHERE 1=1';
      const params = [];
      let paramIdx = 1;

      if (tenantId !== undefined && tenantId !== null) {
        query += ` AND tenant_id = $${paramIdx++}`;
        params.push(tenantId);
      } else if (tenantId === null) {
        query += ` AND tenant_id IS NULL`;
      }

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
      const { tenantId, source, command, status, app_id, ip_address, searchTerm } = payload;

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
      if (app_id) {
        query += ` AND app_id = $${paramIdx++}`;
        params.push(app_id);
      }
      if (ip_address) {
        query += ` AND ip_address = $${paramIdx++}`;
        params.push(ip_address);
      }
      if (searchTerm) {
        query += ` AND (command ILIKE $${paramIdx} OR error_code ILIKE $${paramIdx + 1} OR payload::text ILIKE $${paramIdx + 2})`;
        params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
      }

      query += ` ORDER BY created_at DESC LIMIT 100`;

      const result = await (txClient || db).query(query, params);
      return { status: 'success', events: result.rows };
    },

    'events-stats': async function (user, payload, txClient = null) {
      const { rangeDays = 7 } = payload;
      const tenantId = user.targetTenantId;

      if (tenantId === undefined || tenantId === null)
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Tenant no identificado.');

      const query = `
        SELECT
          count(*) as total_requests,
          count(*) FILTER (WHERE status = 'SUCCESS') as success_count,
          count(*) FILTER (WHERE status = 'ERROR') as error_count,
          (count(*) FILTER (WHERE status = 'SUCCESS') * 100.0 / NULLIF(count(*), 0)) as success_rate
        FROM system_events
        WHERE tenant_id = $1 AND created_at >= CURRENT_DATE - (CAST($2 AS TEXT) || ' days')::interval
      `;

      const result = await (txClient || db).query(query, [tenantId, rangeDays]);
      const stats = result.rows[0];

      const topErrorQuery = `
        SELECT error_code, count(*) as count
        FROM system_events
        WHERE tenant_id = $1 AND status = 'ERROR'
        GROUP BY error_code ORDER BY count DESC LIMIT 1
      `;
      const topErrorRes = await (txClient || db).query(topErrorQuery, [tenantId]);

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

    'user-delete': async function (user, payload, txClient = null) {
      // 1. Validar permisos
      if (user.role_name !== 'SUPER_ADMIN') {
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Solo los SUPER_ADMIN pueden eliminar usuarios.');
      }

      const { userId } = payload;

      // 2. Ejecutar eliminación
      const result = await (txClient || db).query(
        'DELETE FROM usuarios WHERE id = $1',
        [userId]
      );

      if (result.rowCount === 0) {
        throw new EngineError('USER_NOT_FOUND', 'Usuario no encontrado.');
      }

      return { status: 'success', message: 'Usuario eliminado correctamente.' };
    },

    'create-admin': async function (user, payload, txClient = null) {
      if (user.role_name !== 'SUPER_ADMIN') {
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Solo los SUPER_ADMIN pueden crear administradores.');
      }
      const { hashPassword } = require('../utils/security');
      const { username, password } = payload;
      const passwordHash = await hashPassword(password);
      await (txClient || db).query(
        'INSERT INTO usuarios (username, password, role_id) VALUES ($1, $2, (SELECT id FROM roles WHERE nombre = \'SUPER_ADMIN\'))',
        [username, passwordHash]
      );
      return { status: 'success', message: 'Administrador creado correctamente.' };
    },

    'clients-status-report': async function (user, payload, txClient = null) {
      if (user.role_name !== 'SUPER_ADMIN' && user.role_name !== 'ADMINISTRADOR') {
        return { status: 'error', message: 'Solo administradores.' };
      }

      const query = `
        SELECT 
          c.id, c.nombre, c.private_config, c.created_at,
          u.username as owner_username
        FROM clientes c
        LEFT JOIN usuarios u ON c.id = u.cliente_id AND u.role_id = (SELECT id FROM roles WHERE nombre = 'DUEÑO')
      `;
      
      let result;
      try {
        result = await (txClient || db).query(query);
      } catch (dbError) {
        return { status: 'error', message: 'DB_ERROR', detail: dbError.message, stack: dbError.stack };
      }

      try {
        const report = result.rows.map(client => {
          const pc = client.private_config || {};
          let daysRemaining = null;
          
          if (pc && pc.plan === 'pro') {
            const now = new Date();
            let referenceDate;
            if (pc.is_trial && pc.trial_end_date) {
              referenceDate = new Date(pc.trial_end_date);
              daysRemaining = Math.max(0, Math.floor((referenceDate - now) / (1000 * 60 * 60 * 24)));
            } else if (pc.last_payment_date) {
              referenceDate = new Date(pc.last_payment_date);
              const diffDays = Math.floor((now - referenceDate) / (1000 * 60 * 60 * 24));
              daysRemaining = Math.max(0, 30 - diffDays);
            } else if (client.created_at) {
              referenceDate = new Date(client.created_at);
              const diffDays = Math.floor((now - referenceDate) / (1000 * 60 * 60 * 24));
              daysRemaining = Math.max(0, 30 - diffDays);
            }
          }

          return {
            id: client.id,
            nombre: client.nombre,
            owner: client.owner_username,
            subscription: {
              plan: pc.plan || 'free',
              is_trial: !!pc.is_trial,
              days_remaining: daysRemaining,
              created_at: client.created_at
            }
          };
        });
        return { status: 'success', data: report };
      } catch (mapError) {
        return { status: 'error', message: 'MAP_ERROR', detail: mapError.message };
      }
    },

    'list-users-detailed': async function (user, payload, txClient = null) {
      if (user.role_name !== 'SUPER_ADMIN' && user.role_name !== 'ADMINISTRADOR') {
        throw new EngineError('ACCESO_DENEGADO_ROL', 'Solo administradores.');
      }
      
      const { limit = 100, offset = 0 } = payload;
      
      const query = `
        SELECT 
          u.id as user_id, 
          u.username, 
          c.id as client_id, 
          c.nombre as client_name, 
          c.private_config,
          c.created_at as client_created_at
        FROM usuarios u
        JOIN clientes c ON u.cliente_id = c.id
        ORDER BY u.id
        LIMIT $1 OFFSET $2
      `;

      const result = await (txClient || db).query(query, [limit, offset]);
      
      const users = result.rows.map(userRow => {
        const pc = userRow.private_config || {};
        let daysRemaining = 0;
        let status = 'active';

        if (pc && pc.plan === 'pro' && pc.last_payment_date) {
            const now = new Date();
            const startDate = new Date(pc.last_payment_date);
            const months = pc.meses_contratados || 1;
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + months);
            
            daysRemaining = Math.max(0, Math.floor((endDate - now) / (1000 * 60 * 60 * 24)));
            
            if (daysRemaining <= 0) status = 'expired';
            else if (daysRemaining <= 7) status = 'warning';
        } else if (pc && pc.plan === 'free') {
          status = 'active'; // O 'inactive' dependiendo de la lógica de negocio
        }

        return {
          user_id: userRow.user_id,
          username: userRow.username,
          client: {
            id: userRow.client_id,
            name: userRow.client_name,
            subscription: {
              plan: pc.plan || 'free',
              is_trial: !!pc.is_trial,
              days_remaining: daysRemaining,
              status: status,
              created_at: userRow.client_created_at
            }
          }
        };
      });

      return { status: 'success', users: users };
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

      // Ensure payload column is jsonb in case table was created as text in old versions
      await (txClient || db)
        .query(
          `
        ALTER TABLE system_events_archive
        ALTER COLUMN payload TYPE JSONB USING payload::jsonb
      `
        )
        .catch(() => {}); // Ignore if already jsonb or fails for other reasons

      const moveResult = await (txClient || db).query(
        `
        WITH moved_rows AS (
          DELETE FROM system_events
          WHERE tenant_id = $1 AND created_at < CURRENT_DATE - interval '${olderThanDays} days'
          RETURNING *
        )
        INSERT INTO system_events_archive (
          tenant_id, user_id, command, status, error_code, source,
          ip_address, user_agent, app_id, request_id, payload, created_at
        )
        SELECT
          tenant_id, user_id, command, status, error_code, source,
          ip_address, user_agent, app_id, request_id, payload::jsonb, created_at
        FROM moved_rows
      `,
        [tenantId]
      );

      return { status: 'success', archived_count: moveResult.rowCount };
    },

    'clear-all': async function (user, payload, txClient = null) {
      await (txClient || db).query('TRUNCATE TABLE system_events');
      return { status: 'success', message: 'All system events have been cleared.' };
    },

    'migrate-schema': async function (user, payload, txClient = null) {
      const { targetVersion } = payload;
      const client = txClient || db;

      // 1. Get current version from 'clientes' table (using the first client as reference)
      const versionCheck = await client.query('SELECT schema_version FROM clientes LIMIT 1');
      const currentVersion = versionCheck.rows.length > 0 ? versionCheck.rows[0].schema_version : 1;

      console.log(`Migrating schema from v${currentVersion} to v${targetVersion}...`);

      // Migration v2: Ensure official template exists
      if (currentVersion < 2 && targetVersion >= 2) {
        console.log('Applying Migration v2: Ensuring official template exists...');
        const existing = await client.query(
          'SELECT id FROM plantillas WHERE es_oficial = true LIMIT 1'
        );
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO plantillas (nombre, contenido, es_oficial)
             VALUES ($1, $2, true)`,
            [
              'Official Default Template',
              JSON.stringify({ stock: [], precios: {}, categorias: [] }),
            ]
          );
          console.log('✅ Official template created.');
        }
        await client.query('UPDATE clientes SET schema_version = 2');
        console.log('✅ Migration v2 completed.');
      }

      if (currentVersion < 3 && targetVersion >= 3) {
        console.log('Applying Migration v3: Creating system_events table...');
        await client.query(`
          CREATE TABLE IF NOT EXISTS system_events (id SERIAL PRIMARY KEY, tenant_id INTEGER, user_id INTEGER, command VARCHAR(100), status VARCHAR(20), error_code VARCHAR(50), source VARCHAR(50), ip_address VARCHAR(45), payload JSONB DEFAULT '{}', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
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

      if (currentVersion < 5 && targetVersion >= 5) {
        console.log('Applying Migration v5: Enforcing NOT NULL on public_config...');
        await client.query(`
          UPDATE clientes SET public_config = '{}' WHERE public_config IS NULL;
          ALTER TABLE clientes ALTER COLUMN public_config SET DEFAULT '{}'::jsonb;
          ALTER TABLE clientes ALTER COLUMN public_config SET NOT NULL;
        `);
        await client.query('UPDATE clientes SET schema_version = 5');
        console.log('✅ Migration v5 completed.');
      }

      if (currentVersion < 6 && targetVersion >= 6) {
        console.log('Applying Migration v6: Creating analytics tables...');
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
        await client.query(`
          CREATE TABLE IF NOT EXISTS logs_trafico (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id INTEGER NOT NULL,
            visit_type VARCHAR(50),
            url TEXT,
            referrer TEXT,
            user_agent TEXT,
            language VARCHAR(10),
            request_id VARCHAR(100),
            ip_address VARCHAR(45),
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            country VARCHAR(100),
            city VARCHAR(100),
            isp VARCHAR(255),
            browser VARCHAR(50),
            os VARCHAR(50),
            device_type VARCHAR(50)
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS geoip_data (
            id SERIAL PRIMARY KEY,
            ip_start INET NOT NULL,
            ip_end INET NOT NULL,
            country VARCHAR(100),
            city VARCHAR(100),
            isp VARCHAR(255)
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_trafico_timestamp ON logs_trafico(timestamp);
          CREATE INDEX IF NOT EXISTS idx_trafico_country ON logs_trafico(country);
          CREATE INDEX IF NOT EXISTS idx_trafico_type ON logs_trafico(visit_type);
          CREATE INDEX IF NOT EXISTS idx_geoip_start ON geoip_data(ip_start);
          CREATE INDEX IF NOT EXISTS idx_geoip_end ON geoip_data(ip_end);
        `);
        await client.query('UPDATE clientes SET schema_version = 6');
        console.log('✅ Migration v6 completed.');
      }

      if (currentVersion < 7 && targetVersion >= 7) {
        console.log('Applying Migration v7: Spanish Roles and Hierarchical Permissions...');

        // 1. Create new roles
        const roles = ['ADMINISTRADOR', 'DUEÑO', 'EMPLEADO'];
        for (const role of roles) {
          await client.query(
            'INSERT INTO roles (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING',
            [role]
          );
        }

        // 2. Map old roles to new ones
        await client.query(`
          UPDATE usuarios
          SET role_id = (SELECT id FROM roles WHERE nombre = 'ADMINISTRADOR')
          WHERE role_id = (SELECT id FROM roles WHERE nombre = 'SUPER_ADMIN')
        `);
        await client.query(`
          UPDATE usuarios
          SET role_id = (SELECT id FROM roles WHERE nombre = 'DUEÑO')
          WHERE role_id = (SELECT id FROM roles WHERE nombre = 'CLIENT_ADMIN')
        `);
        await client.query(`
          UPDATE usuarios
          SET role_id = (SELECT id FROM roles WHERE nombre = 'EMPLEADO')
          WHERE role_id = (SELECT id FROM roles WHERE nombre = 'USER')
        `);

        // 3. Add permissions column to usuarios
        await client.query(
          "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos JSONB DEFAULT '[]'"
        );

        // 4. Cleanup old roles (Skipped to avoid foreign key constraint violations)
        // await client.query('DELETE FROM roles WHERE nombre IN (\'SUPER_ADMIN\', \'CLIENT_ADMIN\', \'USER\')');

        await client.query('UPDATE clientes SET schema_version = 7');
        console.log('✅ Migration v7 completed.');
      }

      if (currentVersion < 9 && targetVersion >= 9) {
        console.log('Applying Migration v9: Ensuring created_at in clientes...');
        await client.query(`
          ALTER TABLE clientes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);
        await client.query('UPDATE clientes SET schema_version = 9');
        console.log('✅ Migration v9 completed.');
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

    'list-owners': async function (user, payload, txClient = null) {
      const query = `
        SELECT
          u.id,
          u.username,
          u.cliente_id,
          r.nombre as role_name,
          c.nombre as cliente_nombre,
          c.private_config
        FROM usuarios u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN clientes c ON u.cliente_id = c.id
        WHERE r.nombre = 'DUEÑO'
        ORDER BY u.username ASC
      `;

      const result = await (txClient || db).query(query, []);
      return { status: 'success', owners: result.rows };
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
