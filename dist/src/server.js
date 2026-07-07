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

const app = express();
app.use(express.json());

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
    const msg = error.message;
    let statusCode = 400;
    let code = 'EXECUTION_ERROR';

    if (msg.includes('FORBIDDEN')) {
      statusCode = 403;
      code = 'FORBIDDEN';
    } else if (msg.includes('INVALID_PAYLOAD')) {
      statusCode = 400;
      code = 'INVALID_PAYLOAD';
    } else if (msg.includes('CMD_NOT_FOUND')) {
      statusCode = 404;
      code = 'CMD_NOT_FOUND';
    }

    return sendResponse(
      res,
      statusCode,
      'error',
      null,
      {
        code: code,
        message: msg,
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
    console.error('❌ Critical Engine Failure:', error.message);
    process.exit(1);
  }
}

startServer();
