/**
 * Matriz de Permisos del Sistema
 * Define los accesos permitidos por rol.
 *
 * Nota: Los roles se definen en mayúsculas.
 * El sistema de autorización normaliza los roles antes de la comparación.
 */

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['SYSTEM:*', 'APP:*', 'CLIENT:*', 'USER:*', 'MONITOR:*', 'ANALYTICS:*', 'SYSTEM:clients-status-report', 'SYSTEM:list-users-detailed'],
  ADMINISTRADOR: ['SYSTEM:*', 'APP:*', 'CLIENT:*', 'USER:*', 'MONITOR:*', 'ANALYTICS:*', 'SYSTEM:clients-status-report', 'SYSTEM:list-users-detailed'],
  DUEÑO: [
    'CLIENT:*',
    'USER:*',
    'USER:audit-team',
    'APP:init-business',
    'MONITOR:get-client-report',
    'MONITOR:get-my-version',
    'MONITOR:get-system-health',
    'ANALYTICS:list-visits',
    'SALES:*',
  ],
  EMPLEADO: [
    'USER:get-profile',
    'USER:read-path',
    'USER:read',
    'USER:update-path',
    'USER:push-item',
    'USER:query-json',
    'CLIENT:user-read',
    'CLIENT:user-update',
    'MONITOR:get-client-report',
    'MONITOR:get-my-version',
    'MONITOR:get-system-health',
  ],
};

/**
 * Normaliza un string para comparaciones de roles, eliminando tildes y convirtiendo a mayúsculas.
 * @param {string} text
 * @returns {string}
 */
function normalizeRole(text) {
  if (!text) return '';
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza las claves de la matriz de permisos para coincidir con el formato normalizado.
 */
const normalizedPermissions = {};
for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
  normalizedPermissions[normalizeRole(role)] = perms;
}

module.exports = {
  ROLE_PERMISSIONS: normalizedPermissions,
  normalizeRole,
};
