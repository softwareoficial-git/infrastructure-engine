const db = require('./db');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { EngineError } = require('./errors');

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

function translateAjvErrors(errors) {
  return errors
    .map((err) => {
      const path = err.instancePath.replace('/', '') || 'root';
      switch (err.keyword) {
        case 'required':
          return `El campo '${err.params.missingProperty}' es obligatorio.`;
        case 'type':
          return `El campo '${path}' debe ser de tipo ${err.params.type}.`;
        case 'minLength':
          return `El campo '${path}' es demasiado corto (mínimo ${err.params.limit} caracteres).`;
        case 'enum':
          return `El campo '${path}' tiene un valor no permitido. Opciones válidas: ${err.params.allowedValues.join(', ')}.`;
        case 'format':
          return `El campo '${path}' no tiene un formato válido de ${err.params.format}.`;
        default:
          return `Error en el campo '${path}': ${err.message}`;
      }
    })
    .join(' ');
}

class Motor {
  constructor() {
    this.commands = {};
  }
  // ... (rest of the class)

  registerCommand(domain, action, handler) {
    if (!this.commands[domain]) {
      this.commands[domain] = {};
    }
    this.commands[domain][action] = handler;
  }

  registerDomain(DomainClass) {
    const domainName = DomainClass.domain.toUpperCase();
    const instance = new DomainClass();

    if (!this.commands[domainName]) {
      this.commands[domainName] = {};
    }

    const commands = DomainClass.commands;
    const docs = DomainClass.docs || {};

    for (const [action, handler] of Object.entries(commands)) {
      const actionDocs = docs[action] || {};
      // Store handler, schema, and comprehensive documentation
      this.commands[domainName][action] = {
        handler: handler.bind(instance),
        schema: DomainClass.schemas ? DomainClass.schemas[action] : null,
        description: actionDocs.description || 'No description provided.',
        possibleErrors: actionDocs.errors || [],
      };
    }
    console.log(`Dominio ${domainName} registrado con ${Object.keys(commands).length} comandos.`);
  }

  async authorize(user, domain, action = null) {
    // Allow guest access for specific domains or if user is marked as GUEST
    if (!user || user.role_name === 'GUEST') {
      const publicDomains = ['APP', 'ANALYTICS'];
      if (publicDomains.includes(domain)) {
        return;
      }
      throw new EngineError('ACCESO_DENEGADO_ROL');
    }

    // ADMINISTRADOR: Acceso total inmediato
    if (user.role_name === 'ADMINISTRADOR') {
      return;
    }

    // Define which roles have access to which domains
    const domainPermissions = {
      SYSTEM: ['ADMINISTRADOR'],
      APP: ['ADMINISTRADOR', 'DUEÑO', 'EMPLEADO', 'CLIENTE'],
      CLIENT: ['ADMINISTRADOR', 'DUEÑO', 'CLIENTE'],
      USER: ['ADMINISTRADOR', 'DUEÑO', 'EMPLEADO', 'CLIENTE'],
      MONITOR: ['ADMINISTRADOR', 'DUEÑO', 'EMPLEADO', 'CLIENTE'],
    };

    if (domain === 'SYSTEM') {
      throw new EngineError('SISTEMA_RESTRINGIDO');
    }

    if (domain === 'CLIENT') {
      if (!domainPermissions[domain].includes(user.role_name)) {
        throw new EngineError('CLIENTE_RESTRINGIDO');
      }
    }

    const allowedRoles = domainPermissions[domain] || [];
    if (!allowedRoles.includes(user.role_name)) {
      throw new EngineError('ACCESO_DENEGADO_ROL');
    }

    // Control granular para EMPLEADOS
    if (user.role_name === 'EMPLEADO' && action) {
      const command = `${domain}:${action}`;
      const permissions = user.permisos || [];
      if (!permissions.includes(command)) {
        throw new EngineError('PERMISO_FALTANTE', `Comando: ${command}`);
      }
    }
  }

  async execute(user, commandStr, payload, txClient = null) {
    const [rawDomain, action] = commandStr.split(':');
    const domain = rawDomain.toUpperCase();

    if (!this.commands[domain] || !this.commands[domain][action]) {
      const availableDomains = Object.keys(this.commands);
      const domainCommands = this.commands[domain] ? Object.keys(this.commands[domain]) : [];

      throw new EngineError('CMD_NOT_FOUND', {
        message: `Command '${commandStr}' not found.`,
        solution:
          domainCommands.length > 0
            ? `Available commands in ${domain}: ${domainCommands.join(', ')}`
            : `Available domains: ${availableDomains.join(', ')}`,
      });
    }

    const cmdConfig = this.commands[domain][action];

    // Ahora pasamos la acción para permitir el control granular de EMPLEADOS
    await this.authorize(user, domain, action);

    // --- GLOBAL SANITIZATION ---
    const { sanitizeObject } = require('../utils/security');
    const sanitizedPayload = sanitizeObject(payload);

    if (cmdConfig.schema) {
      const validate = ajv.compile(cmdConfig.schema);
      const valid = validate(sanitizedPayload);
      if (!valid) {
        const details = translateAjvErrors(validate.errors);
        throw new EngineError('INVALID_PAYLOAD', details);
      }
    }

    try {
      const result = await cmdConfig.handler(user, sanitizedPayload, txClient);

      // Auditoría Automática (Con privilegios de sistema)
      if (commandStr !== 'SYSTEM:log-event') {
        const adminUser = { id: 0, role_name: 'ADMINISTRADOR' };
        this.execute(
          adminUser,
          'SYSTEM:log-event',
          {
            tenantId: user?.cliente_id,
            userId: user?.id,
            command: commandStr,
            status: 'SUCCESS',
            source: 'BACKEND',
            payload: sanitizedPayload,
          },
          null
        ).catch((err) => console.error('Audit Error:', err));
      }

      return result;
    } catch (error) {
      // Auditoría de Errores (Con privilegios de sistema)
      if (commandStr !== 'SYSTEM:log-event') {
        const adminUser = { id: 0, role_name: 'ADMINISTRADOR' };
        this.execute(
          adminUser,
          'SYSTEM:log-event',
          {
            tenantId: user?.cliente_id,
            userId: user?.id,
            command: commandStr,
            status: 'ERROR',
            errorCode: error.code || 'INTERNAL_ERROR',
            source: 'BACKEND',
            payload: sanitizedPayload,
          },
          null
        ).catch((err) => console.error('Audit Error:', err));
      }
      throw error;
    }
  }

  listCommands() {
    const catalog = {};
    for (const [domain, actions] of Object.entries(this.commands)) {
      catalog[domain] = {};
      for (const [action, config] of Object.entries(actions)) {
        catalog[domain][action] = {
          description: config.description,
          payload: config.schema,
          possibleErrors: config.possibleErrors,
        };
      }
    }
    return catalog;
  }

  async authUser(token) {
    if (!token) throw new EngineError('AUTH_REQUIRED');

    if (token === 'BOOTSTRAP_TOKEN') {
      return {
        id: 0,
        role_name: 'ADMINISTRADOR',
        role_id: 1,
        token: 'BOOTSTRAP_TOKEN',
        cliente_id: null,
      };
    }

    if (process.env.ADMIN_SECRET_TOKEN && token === process.env.ADMIN_SECRET_TOKEN) {
      return {
        id: 0,
        role_name: 'ADMINISTRADOR',
        role_id: 1,
        token: process.env.ADMIN_SECRET_TOKEN,
        cliente_id: null,
      };
    }

    const result = await db.query(
      'SELECT u.*, r.nombre as role_name, r.parent_id FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.token = $1',
      [token]
    );

    if (result.rows.length === 0) throw new EngineError('INVALID_TOKEN');
    return result.rows[0];
  }
}

module.exports = new Motor();
