import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de protección CSRF simple.
 * Verifica la presencia de un encabezado personalizado ('X-Requested-With')
 * en peticiones que no son GET, mitigando el riesgo de ataques CSRF
 * al utilizar cookies SameSite=none.
 */
export const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Omitir verificación para métodos GET (seguros)
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const csrfHeader = req.headers['x-requested-with'];

  if (csrfHeader === 'XMLHttpRequest') {
    return next();
  }

  console.warn(`[CSRF_ATTACK_PREVENTED] Missing X-Requested-With header from ${req.ip} for ${req.method} ${req.path}`);
  return res.status(403).json({ success: false, message: 'Forbidden: CSRF protection' });
};
