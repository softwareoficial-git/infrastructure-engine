const bcrypt = require('bcrypt');
const validator = require('validator');
const crypto = require('crypto');

/**
 * Security Utility for input sanitization and credential management.
 */

const sanitize = (value) => {
  if (typeof value !== 'string') return value;
  // Use validator.escape to prevent XSS by converting characters like <, >, &, ', " to HTML entities
  return validator.escape(value);
};

const sanitizeObject = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
};

const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const generateSecureToken = () => {
  return crypto.randomUUID();
};

module.exports = {
  sanitize,
  sanitizeObject,
  hashPassword,
  verifyPassword,
  generateSecureToken,
};
