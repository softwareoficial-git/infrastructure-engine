/**
 * Security Utility for input sanitization.
 * Prevents XSS by removing HTML tags from strings.
 */
const sanitize = (value) => {
  if (typeof value !== 'string') return value;
  // Remove HTML tags using a simple regex
  return value.replace(/<[^>]*>?/gm, '');
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

module.exports = {
  sanitize,
  sanitizeObject,
};
