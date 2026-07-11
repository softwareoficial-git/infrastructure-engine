/**
 * RBAC Access Matrix
 * Defines the expected behavior of commands based on the user's role.
 * 
 * Outcomes:
 * - 'ALLOW': The command should return status: 'success'.
 * - 'DENY': The command should return an error (typically ACCESO_DENEGADO_ROL).
 * - 'SKIP': No test needed for this role.
 */
module.exports = {
  'APP:client-create': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'DENY',
    CLIENTE_EMPLEADO: 'DENY'
  },
  'CLIENT:user-create': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'ALLOW',
    CLIENTE_EMPLEADO: 'DENY'
  },
  'CLIENT:user-permissions-update': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'ALLOW',
    CLIENTE_EMPLEADO: 'DENY'
  },
  'USER:read': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'ALLOW',
    CLIENTE_EMPLEADO: 'ALLOW'
  },
  'USER:write': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'ALLOW',
    CLIENTE_EMPLEADO: 'DENY'
  },
  'USER:update-path': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'ALLOW',
    CLIENTE_EMPLEADO: 'DENY'
  },
  'SYSTEM:events-global': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'DENY',
    CLIENTE_EMPLEADO: 'DENY'
  },
  'SYSTEM:clear-all': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'DENY',
    CLIENTE_EMPLEADO: 'DENY'
  },
  'MONITOR:get-system-health': {
    SISTEMA_ADMIN: 'ALLOW',
    CLIENTE_DUEÑO: 'ALLOW',
    CLIENTE_EMPLEADO: 'ALLOW'
  }
};
