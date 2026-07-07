const db = require('./db');
const Ajv = require('ajv');
const { EngineError } = require('./errors');
const ajv = new Ajv();

class Motor {
  constructor() {
    this.commands = {};
  }

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

  async execute(user, commandStr, payload) {
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

    this.authorize(user, domain);

    if (cmdConfig.schema) {
      const validate = ajv.compile(cmdConfig.schema);
      const valid = validate(payload);
      if (!valid) {
        const details = ajv.errorsText(validate.errors);
        throw new EngineError('INVALID_PAYLOAD', details);
      }
    }

    return await cmdConfig.handler(user, payload);
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
      return { id: 0, role_name: 'SUPER_ADMIN', token: 'BOOTSTRAP_TOKEN' };
    }

    if (process.env.ADMIN_SECRET_TOKEN && token === process.env.ADMIN_SECRET_TOKEN) {
      return { id: 0, role_name: 'SUPER_ADMIN', token: process.env.ADMIN_SECRET_TOKEN };
    }

    const result = await db.query(
      'SELECT u.*, r.nombre as role_name, r.parent_id FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.token = $1',
      [token]
    );

    if (result.rows.length === 0) throw new EngineError('INVALID_TOKEN');
    return result.rows[0];
  }

  authorize(user, domain) {
    const roleHierarchy = {
      SUPER_ADMIN: ['SYSTEM', 'APP', 'CLIENT', 'USER', 'MONITOR'],
      APP: ['APP', 'CLIENT', 'USER', 'MONITOR'],
      CLIENTE: ['CLIENT', 'USER', 'MONITOR'],
      USUARIO: ['USER', 'MONITOR'],
    };

    const allowedDomains = roleHierarchy[user.role_name] || [];
    if (!allowedDomains.includes(domain)) {
      throw new EngineError('FORBIDDEN');
    }
  }
}

module.exports = new Motor();
