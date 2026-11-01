import { z } from 'zod';

/** Convierte "a,b, c" en ["a", "b", "c"], descartando vacíos. */
function listaSeparadaPorComas(valor: string): string[] {
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PUERTO: z.coerce.number().int().positive().default(3000),
  CORS_ORIGENES: z.string().default('').transform(listaSeparadaPorComas),

  POSTGRES_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // CU01 RN4: vencimiento de la sesión
  SESION_DIAS: z.coerce.number().int().positive(),

  // CU01 RN3 / E4: intentos fallidos consecutivos y duración del bloqueo
  LOGIN_MAX_INTENTOS: z.coerce.number().int().positive(),
  LOGIN_BLOQUEO_MINUTOS: z.coerce.number().int().positive(),

  // RNF-11: límite de solicitudes de autenticación por IP
  LIMITE_AUTH_SOLICITUDES: z.coerce.number().int().positive(),
  LIMITE_AUTH_VENTANA_MINUTOS: z.coerce.number().int().positive(),

  // Vacío mientras no se configure el login con Google (ver README)
  GOOGLE_CLIENT_IDS: z.string().default('').transform(listaSeparadaPorComas),
});

export type Config = z.infer<typeof esquemaEnv>;

/** Lee y valida las variables de entorno. Si falta alguna, la API no arranca y dice cuál. */
export function leerConfig(entorno: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquemaEnv.safeParse(entorno);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Variables de entorno inválidas en api/.env -> ${problemas.join('; ')}`);
  }
  return resultado.data;
}
