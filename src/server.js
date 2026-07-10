require('dotenv').config();
const express = require('express');
const motor = require('./core/motor');
const db = require('./core/db');
const { v4: uuidv4 } = require('uuid');
const { sanitizeObject } = require('./utils/security');

// Import domains to register commands
require('./domains/system');
require('./domains/system_config');
require('./domains/app');
require('./domains/client');
require('./domains/user');
require('./domains/monitor');
require('./domains/analytics');

const app = express();

app.use(express.json());

// --- GLOBAL SANITIZATION MIDDLEWARE ---
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
});

// --- LOGGING MIDDLEWARE ---
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', async () => {
    const duration = Date.now() - start;
    const body = req.body || {};
    const { command } = body;
    const user = req.user ? req.user : null;
    const username = user ? user.username : 'Unauthenticated';

    let errorInfo = '';
    if (res.statusCode >= 400) {
      errorInfo = ` | Code: ${res.errorCode || 'UNKNOWN_ERROR'}`;
    }

    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} | User: ${username} | Cmd: ${command || 'N/A'} | Status: ${res.statusCode}${errorInfo} | ${duration}ms`
    );
  });
  next();
};

// --- GLOBAL EVENT LOGGER HELPER ---
const performEventLog = async (req, res, command, status, errorCode = null, customPayload = {}) => {
  // ... (existing performEventLog implementation)
};

/**
 * Recursively removes sensitive data collections from responses.
 * If a sensitive collection is returned alongside other data, it's treated as a leak
 * from the Infra Engine and removed.
 */
const sanitizeSensitiveData = (data) => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeSensitiveData);

  const sanitized = { ...data };
  const sensitiveCollections = ['users', 'clientes', 'clients', 'sales', 'updatedData'];

  sensitiveCollections.forEach((key) => {
    if (key in sanitized) {
      // Remove the collection if other keys exist, suggesting it's "extra" data
      if (Object.keys(sanitized).length > 1) {
        delete sanitized[key];
      }
    }
  });

  for (const key in sanitized) {
    sanitized[key] = sanitizeSensitiveData(sanitized[key]);
  }

  return sanitized;
};

app.use(requestLogger);

const PORT = process.env.PORT || 3001;

// --- STANDARDIZED RESPONSE WRAPPER ---
const sendResponse = (res, statusCode, status, data = null, error = null, requestId = null) => {
  return res.status(statusCode).json({
    status: status,
    data: sanitizeSensitiveData(data),
    error: error
      ? {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'An unexpected error occurred',
          solution: error.solution || 'Please check the documentation or contact support.',
          details: error.details || null,
        }
      : null,
    metadata: {
      requestId: requestId,
      timestamp: new Date().toISOString(),
    },
  });
};

// --- AUTH MIDDLEWARE ---
const authenticate = async (req, res, next) => {
  const { token } = req.body;
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;

  if (!token) {
    // Allow request to proceed without a token;
    // the motor.authorize() method will decide if the domain is public.
    return next();
  }

  try {
    const user = await motor.authUser(token);
    req.user = user;
    next();
  } catch (error) {
    const isInvalidToken = error.message.includes('INVALID_TOKEN');
    return sendResponse(
      res,
      isInvalidToken ? 401 : 400,
      'error',
      null,
      {
        code: isInvalidToken ? 'INVALID_TOKEN' : 'AUTH_ERROR',
        message: error.message,
      },
      requestId
    );
  }
};

/**
 * Public Registration Endpoint
 * Bypasses authentication to allow new users to create a client and account.
 */
app.post('/register', async (req, res) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  const { username, password, nombreCliente } = req.body;

  if (!username || !password || !nombreCliente) {
    return sendResponse(
      res,
      400,
      'error',
      null,
      { code: 'MISSING_FIELDS', message: 'username, password, and nombreCliente are required.' },
      requestId
    );
  }

  try {
    // Use a GUEST user context to bypass role-based authorization in the motor
    const guestUser = { role_name: 'GUEST', role_id: null };
    const result = await motor.execute(guestUser, 'APP:self-register', {
      username,
      password,
      nombreCliente,
    });

    // Capture the new IDs to avoid orphan events
    const newTenantId = result.data?.cliente?.id || result.cliente?.id;
    const newUserId = result.data?.user?.id || result.user?.id;

    await performEventLog(req, res, 'APP:self-register', 'SUCCESS', null, {
      duration: 0,
      tenantId: newTenantId,
      userId: newUserId,
    });
    return sendResponse(res, 201, 'success', result, null, requestId);
  } catch (error) {
    let statusCode = 400;
    let code = 'INTERNAL_ERROR';
    let solution = 'Please check the documentation or contact support.';
    let details = null;

    if (error.name === 'EngineError') {
      code = error.code;
      solution = error.solution;
      details = error.details;
    } else {
      statusCode = 500;
    }

    await performEventLog(req, res, 'APP:self-register', 'ERROR', code);

    return sendResponse(
      res,
      statusCode,
      'error',
      null,
      {
        code: code,
        message: error.message,
        solution: solution,
        details: details,
      },
      requestId
    );
  }
});

/**
 * Generic execution endpoint
 * This is the stable bridge for developers to build business logic on top.
 */
app.post('/execute', authenticate, async (req, res) => {
  const start = Date.now();
  const command = req.body.command || req.body.cmd;
  let payload = req.body.payload || req.body.params || {};
  const requestId = req.requestId;

  if (!command) {
    return sendResponse(
      res,
      400,
      'error',
      null,
      { code: 'CMD_REQUIRED', message: 'Command is required.' },
      requestId
    );
  }

  // Inject request metadata for ANALYTICS commands to make tracking invisible
  if (command.startsWith('ANALYTICS:')) {
    payload = {
      ...payload,
      _request: {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    };
  }

  try {
    const result = await motor.execute(req.user, command, payload);
    await performEventLog(req, res, command, 'SUCCESS', null, { duration: Date.now() - start });
    return sendResponse(res, 200, 'success', result, null, requestId);
  } catch (error) {
    let statusCode = 400;
    let code = 'INTERNAL_ERROR';
    let solution = 'Please check the documentation or contact support.';
    let details = null;

    if (error.name === 'EngineError') {
      code = error.code;
      solution = error.solution;
      details = error.details;

      if (code === 'INVALID_PAYLOAD') {
        // Enhance the message for payload errors to be more instructive
        error.message = `The request payload for command '${command}' is incorrect. ${error.details || ''}`;
      }

      if (code === 'FORBIDDEN') statusCode = 403;
      else if (code === 'CMD_NOT_FOUND') statusCode = 404;
      else if (code === 'INVALID_TOKEN' || code === 'AUTH_REQUIRED') statusCode = 401;
    } else {
      statusCode = 500;
    }

    res.errorCode = code; // Attach error code for the logger
    await performEventLog(req, res, command, 'ERROR', code, { duration: Date.now() - start });

    return sendResponse(
      res,
      statusCode,
      'error',
      null,
      {
        code: code,
        message: error.message,
        solution: solution,
        details: details,
      },
      requestId
    );
  }
});

// Root route - Dynamic Developer Documentation
app.get('/', (req, res) => {
  const commands = motor.listCommands();

  res.json({
    message: 'Welcome to the Infrastructure Engine API',
    documentation: {
      onboarding: {
        step: 1,
        endpoint: '/register',
        method: 'POST',
        description: 'Create a new client account and obtain your access token.',
        request_format: {
          username: 'Desired username',
          password: 'Secure password',
          nombreCliente: 'Name of your business/tenant',
        },
        response: 'Returns token and clienteId needed for subsequent requests.',
      },
      execution: {
        step: 2,
        endpoint: '/execute',
        method: 'POST',
        description: 'Execute domain-based commands using your token.',
        request_format: {
          token: 'Authentication token obtained from /register',
          command: 'Command in format DOMAIN:action',
          payload: 'Optional parameters object',
        },
      },
      available_commands: commands,
      example_registration: {
        endpoint: '/register',
        body: {
          username: 'dev_user',
          password: 'password123',
          nombreCliente: 'Dev Studio',
        },
      },
      example_execution: {
        endpoint: '/execute',
        body: {
          token: 'TOKEN_FROM_REGISTRATION',
          command: 'MONITOR:get-system-health',
          payload: {},
        },
      },
      health_check: '/health',
    },
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function startServer() {
  try {
    // 1. Database Connectivity Check
    await db.query('SELECT 1');
    console.log('✅ Infrastructure Engine: Database connected.');

    // 2. Automatic Initialization Check
    const tablesCheck = await db.query(
      "SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'roles')"
    );

    if (!tablesCheck.rows[0].exists) {
      console.log('🛠️  Database not initialized. Running SYSTEM:init...');
      const bootstrapUser = { id: 0, role_name: 'SUPER_ADMIN', token: 'BOOTSTRAP_TOKEN' };
      // We call the logic directly from the domain's command via motor.execute
      await motor.execute(bootstrapUser, 'SYSTEM:init', {});
      console.log('✅ System initialized successfully.');
    } else {
      console.log('ℹ️  Database already initialized.');
    }

    // 3. Automatic Migration Check
    const versionCheck = await db.query('SELECT schema_version FROM clientes LIMIT 1');
    const currentVersion = versionCheck.rows.length > 0 ? versionCheck.rows[0].schema_version : 1;
    const TARGET_VERSION = 6; // Updated to v6 for Analytics tables and pgcrypto extension

    if (currentVersion < TARGET_VERSION) {
      console.log(`🚀 Migrating database from v${currentVersion} to v${TARGET_VERSION}...`);
      const bootstrapUser = {
        id: 0,
        role_name: 'SUPER_ADMIN',
        role_id: 1,
        token: 'BOOTSTRAP_TOKEN',
      };

      await motor.execute(bootstrapUser, 'SYSTEM:migrate-schema', {
        targetVersion: TARGET_VERSION,
      });
      console.log(`✅ Migration to v${TARGET_VERSION} completed.`);
    } else {
      console.log(`ℹ️  Database is up to date (v${currentVersion}).`);
    }

    app.listen(PORT, () => {
      console.log(`🚀 Stable Bridge running on http://localhost:${PORT}`);
      console.log(`📡 Developer Endpoint: POST /execute`);
    });
  } catch (error) {
    console.error('❌ Critical Engine Failure during startup:', error);
    process.exit(1);
  }
}

startServer();
