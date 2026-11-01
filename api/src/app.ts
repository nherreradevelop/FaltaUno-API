import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { crearManejadorErrores } from './comun/middlewares/manejadorErrores';
import type { Contexto } from './contexto';
import { crearRutasAuth } from './modulos/auth/auth.rutas';
import { crearRutasUsuarios } from './modulos/usuarios/usuarios.rutas';
import { documentoSwagger } from './swagger';

/** Arma la aplicación de Express: middlewares globales y routers de cada módulo. */
export function crearApp(contexto: Contexto): Express {
  const app = express();

  // req.ip toma la IP real cuando la API está detrás de un proxy (necesario para limitarIntentos)
  app.set('trust proxy', 1);
  app.use(permitirOrigenes(contexto.config.CORS_ORIGENES));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(documentoSwagger));
  app.use('/api/auth', crearRutasAuth(contexto));
  app.use('/api/usuarios', crearRutasUsuarios(contexto));

  app.use(crearManejadorErrores(contexto.logger));
  return app;
}

/** CORS mínimo para los orígenes de CORS_ORIGENES (la web de Vite y Expo web). La app nativa no lo necesita. */
function permitirOrigenes(origenesPermitidos: string[]): express.RequestHandler {
  return (req, res, next) => {
    const origen = req.headers.origin;
    if (origen && origenesPermitidos.includes(origen)) {
      res.setHeader('Access-Control-Allow-Origin', origen);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
