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
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { command, token } = req.body || {};
    const user = req.user ? req.user.username : 'Unauthenticated';
    
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} | User: ${user} | Cmd: ${command || 'N/A'} | Status: ${res.statusCode} | ${duration}ms`);
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
 * Generic execution endpoint
 * This is the stable bridge for developers to build business logic on top.
 */
app.post('/execute', authenticate, async (req, res) => {
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

  try {
    const result = await motor.execute(req.user, command, payload || {});
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
      else statusCode = 400;
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function startServer() {
  try {
    await db.query('SELECT 1');
    console.log('✅ Infrastructure Engine: Database connected.');

    app.listen(PORT, () => {
      console.log(`🚀 Stable Bridge running on http://localhost:${PORT}`);
      console.log(`📡 Developer Endpoint: POST /execute`);
    });
  } catch (error) {
    console.error('❌ Critical Engine Failure:', error);
    process.exit(1);
  }
}

startServer();
