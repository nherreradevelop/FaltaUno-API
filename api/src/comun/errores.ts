/**
 * Error esperado del dominio: el manejador centralizado lo convierte en
 * { "error": { "codigo", "mensaje", "campos"? } } con el estado HTTP indicado.
 */
export class AppError extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly campos?: Record<string, string>,
  ) {
    super(mensaje);
    this.name = 'AppError';
  }
}

/** Fábricas de errores tipados. El código va en MAYÚSCULAS y el mensaje es el que ve el usuario. */
export const errores = {
  validacion(campos: Record<string, string>): AppError {
    return new AppError(400, 'DATOS_INVALIDOS', 'Revisá los datos ingresados.', campos);
  },

  noAutenticado(codigo: string, mensaje: string): AppError {
    return new AppError(401, codigo, mensaje);
  },

  prohibido(codigo: string, mensaje: string): AppError {
    return new AppError(403, codigo, mensaje);
  },

  noEncontrado(codigo: string, mensaje: string): AppError {
    return new AppError(404, codigo, mensaje);
  },

  demasiadosIntentos(codigo: string, mensaje: string): AppError {
    return new AppError(429, codigo, mensaje);
  },

  servicioNoDisponible(codigo: string, mensaje: string): AppError {
    return new AppError(503, codigo, mensaje);
  },
};
