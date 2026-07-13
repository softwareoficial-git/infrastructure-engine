const db = require('./db');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { EngineError } = require('./errors');
const { ROLE_PERMISSIONS, normalizeRole } = require('./permissions');

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
    const command = action ? `${domain}:${action}` : null;
    console.log(
      `[!!! AUTH-TRACE-RAW !!!] USER_OBJ: ${JSON.stringify(user)} | DOMAIN: ${domain} | ACTION: ${action}`
    );

    console.log(
      `[AUTH-DEBUG] Validating access: User=${user?.username || 'UNKNOWN'} | Role=${user?.role_name || 'NONE'} | Cmd=${command || 'DOMAIN-ONLY'}`
    );

    // 1. LISTA BLANCA de COMANDOS PÚBLICOS (Sin Token)
    const publicCommands = [
      'APP:self-register',
      'USER:login',
      'ANALYTICS:track-visit',
      'SYSTEM:list-commands',
    ];

    if (command && publicCommands.includes(command)) {
      console.log(`[AUTH-DEBUG] ALLOW: Public command ${command}`);
      return;
    }

    // Si no hay usuario o es GUEST y el comando no es público, denegar
    if (!user || user.role_name === 'GUEST') {
      console.log(`[AUTH-DEBUG] DENY: No authenticated user or GUEST role for ${command}`);
      throw new EngineError('ACCESO_DENEGADO_ROL', {
        reason: 'Autenticación requerida o rol GUEST insuficiente.',
        command: command,
        required: 'Cualquier rol autenticado superior a GUEST',
      });
    }

    // 2. ADMINISTRADORES: Acceso total basado en la matriz de permisos
    const userRole = normalizeRole(user.role_name);
    if (['SUPER_ADMIN', 'ADMINISTRADOR'].includes(userRole)) {
      console.log(`[AUTH-DEBUG] ALLOW: Admin access granted for ${userRole}`);
      return;
    }

    // 3. DEFINICIÓN DE PERMISOS POR ROL (Otros roles)
    const allowedPatterns = ROLE_PERMISSIONS[userRole] || [];
    const hasAccessByRole = allowedPatterns.some((pattern) => {
      if (pattern === `${domain}:*`) return true;
      if (pattern === command) return true;
      return false;
    });

    // 4. CONTROL GRANULAR PARA EMPLEADOS (Aditivo)
    let hasAccess = hasAccessByRole;
    if (userRole === 'EMPLEADO' && command) {
      const permissions = user.permisos || [];
      if (permissions.includes(command)) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      console.log(
        `[!!! AUTH-CRITICAL-FAIL !!!] DENY: User=${user.username} | Role=${user.role_name} | Cmd=${command} | Patterns=${JSON.stringify(allowedPatterns)}`
      );
      
      const errorDetails = {
        command: command,
        userRole: user.role_name,
        allowedPatternsForRole: allowedPatterns,
        suggestion: 'Verifica los permisos asignados a tu rol o solicita el permiso específico para este comando.',
      };

      if (userRole === 'EMPLEADO') {
        throw new EngineError('PERMISO_FALTANTE', errorDetails);
      }
      throw new EngineError('ACCESO_DENEGADO_ROL', errorDetails);
    }
  }

  resolveTenantId(user, payload) {
    if (!user) return 0;
    const userRole = normalizeRole(user.role_name);
    
    // BLINDAJE TOTAL DE AISLAMIENTO (Tenant Isolation):
    // Solo los administradores globales pueden saltar entre tenants.
    // Para cualquier usuario de negocio (Dueño, Empleado), el sistema 
    // ignora cualquier clienteId en el payload y fuerza el uso de su propio cliente_id.
    if (['SUPER_ADMIN', 'ADMINISTRADOR'].includes(userRole)) {
      return payload.clienteId || payload.tenantId || user.cliente_id || 0;
    }
    
    return user.cliente_id;
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

    await this.authorize(user, domain, action);

    // Resolve target tenant based on role and payload
    if (user) {
      user.targetTenantId = this.resolveTenantId(user, payload);
    }

    // --- GLOBAL SANITIZATION ---

    const { sanitizeObject } = require('../utils/security');
    const sanitizedPayload = sanitizeObject(payload);

    // FORZADO DE IDENTIDAD: Sobrescribimos cualquier intento de suplantación de clienteId en el payload
    // con el ID validado y autorizado por el motor.
    if (user && user.targetTenantId !== undefined) {
      if (sanitizedPayload.clienteId) {
        sanitizedPayload.clienteId = user.targetTenantId;
      }
      if (sanitizedPayload.tenantId) {
        sanitizedPayload.tenantId = user.targetTenantId;
      }
    }

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

    if (
      token === 'BOOTSTRAP_TOKEN' ||
      (process.env.ADMIN_SECRET_TOKEN && token === process.env.ADMIN_SECRET_TOKEN)
    ) {
      try {
        const result = await db.query(
          'SELECT u.*, r.nombre as role_name, r.parent_id FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.username = $1',
          ['superadmin']
        );
        if (result.rows.length > 0) return result.rows[0];
      } catch (e) {
        console.error('Auth DB Error:', e);
      }
      // Fallback for bootstrap: Provide a virtual superadmin if DB record is missing
      return { id: 0, username: 'superadmin', role_name: 'SUPER_ADMIN', token: 'BOOTSTRAP_TOKEN' };
    }

    const result = await db.query(
      'SELECT u.*, r.nombre as role_name, r.parent_id, s.token FROM usuarios u JOIN roles r ON u.role_id = r.id JOIN sesiones s ON u.id = s.usuario_id WHERE s.token = $1',
      [token]
    );

    if (result.rows.length === 0) throw new EngineError('INVALID_TOKEN');
    return result.rows[0];
  }
}

module.exports = new Motor();
