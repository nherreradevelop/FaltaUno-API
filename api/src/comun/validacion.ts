import type { z } from 'zod';
import { errores } from './errores';

/**
 * Valida la entrada de una petición con un esquema de zod.
 * Si no cumple, lanza un error 400 con el mensaje de cada campo.
 */
export function validar<Esquema extends z.ZodTypeAny>(esquema: Esquema, datos: unknown): z.infer<Esquema> {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) {
    return resultado.data;
  }

  const campos: Record<string, string> = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path.join('.') || 'cuerpo';
    // Si un campo tiene varios problemas, se informa el primero
    if (!(campo in campos)) {
      campos[campo] = issue.message;
    }
  }
  throw errores.validacion(campos);
}
