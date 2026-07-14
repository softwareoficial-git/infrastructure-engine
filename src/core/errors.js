/**
 * Error Catalog for the Infrastructure Engine.
 * Each error code maps to a human-readable message and a clear solution for the developer.
 */
const ERROR_CATALOG = {
  AUTH_REQUIRED: {
    message: 'Falta el token de autenticación.',
    solution: 'Añade el campo "token" en la raíz del cuerpo de tu solicitud JSON.',
  },
  INVALID_TOKEN: {
    message: 'El token proporcionado es inválido o ha expirado.',
    solution: 'Verifica tu token o solicita uno nuevo al proveedor de autenticación.',
  },
  SISTEMA_RESTRINGIDO: {
    message: 'Acceso restringido al dominio del Sistema.',
    solution:
      'Este comando requiere privilegios de ADMINISTRADOR GLOBAL. Verifica que tu cuenta tenga el rol correcto.',
  },
  CLIENTE_RESTRINGIDO: {
    message: 'Acceso restringido a la gestión de Clientes.',
    solution:
      'Solo el ADMINISTRADOR o el DUEÑO del negocio pueden modificar la configuración del cliente. Solicita permisos al administrador.',
  },
  ACCESO_DENEGADO_ROL: {
    message: 'El rol asignado a tu usuario no tiene permisos para ejecutar esta acción.',
    solution:
      'Verifica que tu rol tenga acceso al comando solicitado. Si crees que es un error, contacta con soporte técnico.',
  },
  PERMISO_FALTANTE: {
    message: 'Permiso específico no habilitado para este usuario.',
    solution:
      'Tu rol permite el acceso general, pero este comando específico no ha sido habilitado en tu perfil. Solicita la activación al DUEÑO del negocio.',
  },
  CMD_NOT_FOUND: {
    message: 'El comando solicitado no fue encontrado.',
    solution:
      'Verifica el formato del comando (DOMINIO:accion). Consulta la documentación para ver los comandos disponibles.',
  },
  INVALID_PAYLOAD: {
    message: 'The request payload does not match the required schema.',
    solution:
      'Review the required fields and data types for this command. Check the "details" field in the response.',
  },
  BATCH_ERROR: {
    message:
      'One or more commands in the batch failed, and the entire transaction was rolled back.',
    solution: 'Check the "details" field to identify which specific command caused the failure.',
  },
  CLIENT_NOT_FOUND: {
    message: 'The specified client does not exist.',
    solution: 'Verify that the "clienteId" provided is correct and exists in the database.',
  },
  USER_EXISTS: {
    message: 'A user with this username already exists.',
    solution: 'Choose a different username or recover the existing account.',
  },
  USER_NOT_FOUND: {
    message: 'The specified user was not found.',
    solution: 'Verify the username or userId provided.',
  },
  TEMPLATE_NOT_FOUND: {
    message: 'The requested template was not found.',
    solution: 'Verify the templateId provided.',
  },
  NO_OFFICIAL_TEMPLATE: {
    message: 'No official template has been published.',
    solution: 'Use APP:template-publish to set an official template.',
  },
  PATH_NOT_FOUND: {
    message: 'The specified path in the JSONB configuration does not exist.',
    solution: 'Verify the path notation (e.g., "settings.theme").',
  },
  CONFIG_NOT_FOUND: {
    message: 'The requested system configuration key was not found.',
    solution: 'Verify the key provided.',
  },
  INVALID_PATH_FORMAT: {
    message: 'The provided path format is invalid.',
    solution:
      'Use simple dot notation (e.g., "settings.theme"). Selectors like "[code=...]" are not supported. Use "USER:query-json" first to find the correct index.',
  },
  SYSTEM_UNHEALTHY: {
    message: 'The system is currently unhealthy.',
    solution: 'Contact the infrastructure team immediately.',
  },
  INTERNAL_ERROR: {
    message: 'An unexpected internal error occurred.',
    solution:
      'This is a system error. Please report it to the infrastructure team providing the requestId and the x-app-id used in the request.',
  },
};

class EngineError extends Error {
  constructor(code, details = null, customSolution = null) {
    const errorDef = ERROR_CATALOG[code] || ERROR_CATALOG['INTERNAL_ERROR'];

    let finalMessage = errorDef.message;
    let finalSolution = customSolution || errorDef.solution;

    // --- Lógica de Mensajes Dinámicos ---
    if (details) {
      if (typeof details === 'string') {
        // Caso simple: el detalle es un mensaje adicional
        finalMessage = `${errorDef.message} ${details}`.trim();
      } else if (typeof details === 'object') {
        // Caso avanzado: el detalle es un objeto de contexto (usualmente para AUTH o PAYLOAD)
        if (code === 'ACCESO_DENEGADO_ROL' || code === 'PERMISO_FALTANTE') {
          const role = details.userRole || 'tu rol';
          const cmd = details.command || 'el comando';
          finalMessage = `El rol [${role}] no tiene permisos suficientes para ejecutar [${cmd}].`;

          if (details.suggestion) {
            finalSolution = details.suggestion;
          } else if (details.required) {
            finalSolution = `Se requiere el siguiente nivel de acceso: ${details.required}.`;
          }
        } else if (code === 'CLIENT_NOT_FOUND' || code === 'USER_NOT_FOUND') {
          const id = details.id || 'el recurso';
          finalMessage = `${errorDef.message} (ID: ${id})`;
        }
      }
    }

    super(finalMessage);
    this.name = 'EngineError';
    this.code = code;
    this.solution = finalSolution;
    this.details = details;
  }
}

module.exports = {
  EngineError,
  ERROR_CATALOG,
};
