const db = require('./db');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { EngineError } = require('./errors');

const ajv = new Ajv();
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

  async authorize(user, domain) {
    // Allow guest access for specific domains or if user is marked as GUEST
    if (!user || user.role_name === 'GUEST') {
      const publicDomains = ['APP', 'ANALYTICS'];
      if (publicDomains.includes(domain)) {
        return;
      }
      throw new EngineError('FORBIDDEN');
    }

    // TRUSTED BOOTSTRAP: If the user is explicitly a SUPER_ADMIN, allow access immediately
    if (user.role_name === 'SUPER_ADMIN') {
      return;
    }

    // 2. Define which roles have access to which domains (FLAT HIERARCHY)
    const domainPermissions = {
      SYSTEM: ['SUPER_ADMIN'],
      APP: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'USER'],
      CLIENT: ['SUPER_ADMIN', 'CLIENT_ADMIN'],
      USER: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'USER'],
      MONITOR: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'USER'],
    };

    const allowedRoles = domainPermissions[domain] || [];
    if (!allowedRoles.includes(user.role_name)) {
      throw new EngineError('FORBIDDEN');
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

    await this.authorize(user, domain);

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

    return await cmdConfig.handler(user, sanitizedPayload, txClient);
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
      return { id: 0, role_name: 'SUPER_ADMIN', role_id: 1, token: 'BOOTSTRAP_TOKEN' };
    }

    if (process.env.ADMIN_SECRET_TOKEN && token === process.env.ADMIN_SECRET_TOKEN) {
      return { id: 0, role_name: 'SUPER_ADMIN', role_id: 1, token: process.env.ADMIN_SECRET_TOKEN };
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
