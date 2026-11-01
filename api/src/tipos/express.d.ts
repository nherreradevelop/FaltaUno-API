// Datos que los middlewares agregan a la petición de Express
declare global {
  namespace Express {
    interface Request {
      /** Lo completa requiereSesion con el dueño de la sesión. */
      usuarioId?: string;
    }
  }
}

export {};
