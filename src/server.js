require('dotenv').config();
const express = require('express');
const motor = require('./core/motor');
const db = require('./core/db');
const { v4: uuidv4 } = require('uuid');

// Import domains to register commands
require('./domains/system');
require('./domains/system_config');
require('./domains/app');
require('./domains/client');
require('./domains/user');
require('./domains/monitor');

const app = express();
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

app.use(express.json());
app.use(requestLogger);

const PORT = process.env.PORT || 3001;

// --- STANDARDIZED RESPONSE WRAPPER ---
const sendResponse = (res, statusCode, status, data = null, error = null, requestId = null) => {
  return res.status(statusCode).json({
    status: status,
    data: data,
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
    return sendResponse(
      res,
      401,
      'error',
      null,
      { code: 'AUTH_REQUIRED', message: 'Authentication token is required.' },
      requestId
    );
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
  const { command, payload } = req.body;
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

  // Helper for background logging to avoid repetition
  const logAutomaticEvent = async (status, errorCode = null) => {
    if (command === 'SYSTEM:log-event') return;
    try {
      const bootstrapUser = {
        id: 0,
        role_name: 'SUPER_ADMIN',
        role_id: 1,
        token: 'BOOTSTRAP_TOKEN',
      };
      const user = req.user;
      const body = req.body || {};
      const tenantId =
        user && user.role_name === 'SUPER_ADMIN'
          ? 1
          : user && typeof user.cliente_id === 'number'
            ? user.cliente_id
            : parseInt(body.tenantId) || 1;
      const userId = user && typeof user.id === 'number' ? user.id : parseInt(body.userId) || null;

      await motor.execute(bootstrapUser, 'SYSTEM:log-event', {
        tenantId,
        userId,
        command: command || 'N/A',
        status,
        errorCode,
        source: 'BACKEND',
        payload: {
          duration: Date.now() - start,
          requestId,
          url: req.url,
          method: req.method,
          ip: req.ip,
        },
      });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.error(`❌ Event Log Error: ${e.message}`);
    }
  };

  try {
    const result = await motor.execute(req.user, command, payload || {});
    await logAutomaticEvent('SUCCESS');
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

      if (code === 'FORBIDDEN') statusCode = 403;
      else if (code === 'CMD_NOT_FOUND') statusCode = 404;
      else if (code === 'INVALID_TOKEN' || code === 'AUTH_REQUIRED') statusCode = 401;
    } else {
      statusCode = 500;
    }

    res.errorCode = code; // Attach error code for the logger
    await logAutomaticEvent('ERROR', code);

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
      endpoint: '/execute',
      method: 'POST',
      request_format: {
        token: 'Authentication token (required)',
        command: 'Command in format DOMAIN:action (required)',
        payload: 'Optional parameters object',
      },
      available_commands: commands,
      example_request: {
        token: 'YOUR_TOKEN',
        command: 'MONITOR:get-system-health',
        payload: {},
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
    const TARGET_VERSION = 3; // Updated to v3 for System Events

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
