/**
 * Error Catalog for the Infrastructure Engine.
 * Each error code maps to a human-readable message and a clear solution for the developer.
 */
const ERROR_CATALOG = {
  AUTH_REQUIRED: {
    message: 'Authentication token is missing.',
    solution: 'Add the "token" field to the root of your JSON request body.',
  },
  INVALID_TOKEN: {
    message: 'The provided token is invalid or has expired.',
    solution: 'Verify your token or request a new one from the authentication provider.',
  },
  FORBIDDEN: {
    message: 'Access denied: Insufficient permissions for this domain.',
    solution:
      'Check if your user role has the necessary permissions. If you are a client, you cannot access SYSTEM or APP domains.',
  },
  CMD_NOT_FOUND: {
    message: 'The requested command was not found.',
    solution:
      'Verify the command format (DOMAIN:action). Check the available commands in the documentation.',
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
  SYSTEM_UNHEALTHY: {
    message: 'The system is currently unhealthy.',
    solution: 'Contact the infrastructure team immediately.',
  },
  INTERNAL_ERROR: {
    message: 'An unexpected internal error occurred.',
    solution:
      'This is a system error. Please report it to the infrastructure team with the requestId.',
  },
};

class EngineError extends Error {
  constructor(code, details = null) {
    const errorDef = ERROR_CATALOG[code] || ERROR_CATALOG['INTERNAL_ERROR'];
    super(errorDef.message);
    this.name = 'EngineError';
    this.code = code;
    this.solution = errorDef.solution;
    this.details = details; // Used for AJV validation errors or specific context
  }
}

module.exports = {
  EngineError,
  ERROR_CATALOG,
};
