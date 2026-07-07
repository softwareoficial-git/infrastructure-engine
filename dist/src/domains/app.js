const motor = require('../core/motor');
const db = require('../core/db');
const Ajv = require('ajv');
const ajv = new Ajv();

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

    'template-publish': async function (user, payload) {
      const { templateId } = payload;

      await db.query('UPDATE plantillas SET es_oficial = false');
      const result = await db.query(
        'UPDATE plantillas SET es_oficial = true WHERE id = $1 RETURNING *',
        [templateId]
      );

      if (result.rows.length === 0) throw new Error('Plantilla no encontrada');
      return { status: 'success', message: 'Plantilla publicada', template: result.rows[0] };
    },

    'client-create': async function (user, payload) {
      const { nombre } = payload;

      const templateRes = await db.query(
        'SELECT contenido FROM plantillas WHERE es_oficial = true LIMIT 1'
      );
      if (templateRes.rows.length === 0) throw new Error('No hay una plantilla oficial');

      const officialContent = templateRes.rows[0].contenido;

      const clientRes = await db.query(
        'INSERT INTO clientes (nombre, public_config) VALUES ($1, $2) RETURNING *',
        [nombre, officialContent]
      );

      return { status: 'success', cliente: clientRes.rows[0] };
    },

    'migrate-global': async function (user, payload) {
      const { targetVersion, transformation } = payload;

      const clients = await db.query('SELECT id, public_config FROM clientes');

      for (const client of clients.rows) {
        let currentConfig = client.public_config;

        if (transformation.add_field) {
          currentConfig[transformation.add_field] = transformation.default;
        }

        await db.query(
          'UPDATE clientes SET public_config = $1, schema_version = $2 WHERE id = $3',
          [currentConfig, targetVersion, client.id]
        );
      }

      return {
        status: 'success',
        message: `Migración a versión ${targetVersion} completada para todos los clientes`,
      };
    },

    'client-delete': async function (user, payload) {
      const { clienteId } = payload;
      const result = await db.query('DELETE FROM clientes WHERE id = $1 RETURNING id', [clienteId]);
      if (result.rows.length === 0) throw new Error('Cliente no encontrado');
      return { status: 'success', message: 'Cliente eliminado' };
    },
  };
}

motor.registerDomain(AppDomain);

module.exports = {};
