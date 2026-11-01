import pino from 'pino';

/**
 * Logs estructurados en JSON (RNF-09).
 * Nunca registrar contraseñas, tokens ni contenido de mensajes privados.
 */
export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: ['req.headers.authorization', '*.password', '*.token', '*.idToken'],
});

export type Logger = typeof logger;
