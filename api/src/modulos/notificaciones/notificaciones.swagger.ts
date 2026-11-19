/** Documentación OpenAPI de CU40 – Notificaciones. El canal en tiempo real (Socket.IO) se describe en el README. */
const error = (descripcion: string) => ({
  description: descripcion,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});
const seguridad = [{ sesion: [] }];
const sinSesion = error('E3: sin sesión o sesión vencida (SESION_INVALIDA).');
const errorInterno = error('ER1/ER2: no se pudo consultar o guardar (ERROR_INTERNO).');

const cantidadNoLeidas = {
  description: 'Cantidad de notificaciones sin leer.',
  content: {
    'application/json': {
      schema: { type: 'object', required: ['cantidad'], properties: { cantidad: { type: 'integer', minimum: 0 } } },
    },
  },
};

export const esquemaSwaggerNotificacion = {
  type: 'object',
  required: ['id', 'tipo', 'texto', 'destino', 'leida', 'creadaEn'],
  properties: {
    id: { type: 'string', example: '6740d4f2a1b2c3d4e5f60718' },
    tipo: { type: 'string', example: 'invitacionRecibida' },
    texto: { type: 'string', example: 'Carla te invitó a "Surf en La Paloma".' },
    destino: {
      type: 'object',
      nullable: true,
      description: 'Pantalla a la que lleva (FP paso 7).',
      properties: { tipo: { type: 'string', enum: ['actividad', 'usuario'] }, id: { type: 'string' } },
    },
    leida: { type: 'boolean' },
    creadaEn: { type: 'string', format: 'date-time' },
  },
};

export const rutasSwaggerNotificaciones = {
  '/notificaciones': {
    get: {
      tags: ['Notificaciones'],
      summary: 'CU40 FP/A2 – Notificaciones del usuario, de a 20, de la más reciente a la más antigua',
      security: seguridad,
      parameters: [
        {
          name: 'antesDe',
          in: 'query',
          required: false,
          description: 'A2: id de la última notificación ya mostrada; devuelve las anteriores.',
          schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
        },
      ],
      responses: {
        200: {
          description: 'Página de notificaciones (E1: lista vacía si no tiene).',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['notificaciones', 'hayMas'],
                properties: {
                  notificaciones: { type: 'array', items: { $ref: '#/components/schemas/Notificacion' } },
                  hayMas: { type: 'boolean' },
                },
              },
            },
          },
        },
        400: error('"antesDe" no es un id válido (DATOS_INVALIDOS).'),
        401: sinSesion,
        500: errorInterno,
      },
    },
  },
  '/notificaciones/no-leidas': {
    get: {
      tags: ['Notificaciones'],
      summary: 'CU40 FP paso 1 – Cantidad de notificaciones sin leer (indicador)',
      security: seguridad,
      responses: { 200: cantidadNoLeidas, 401: sinSesion, 500: errorInterno },
    },
  },
  '/notificaciones/{id}/leida': {
    patch: {
      tags: ['Notificaciones'],
      summary: 'CU40 FP paso 6 – Marcar una notificación como leída',
      security: seguridad,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
      responses: {
        200: cantidadNoLeidas,
        400: error('El id no es válido (DATOS_INVALIDOS).'),
        401: sinSesion,
        404: error('RN6: no existe o es de otro usuario (NOTIFICACION_NO_ENCONTRADA).'),
        500: errorInterno,
      },
    },
  },
  '/notificaciones/marcar-todas-leidas': {
    post: {
      tags: ['Notificaciones'],
      summary: 'CU40 A1 – Marcar como leídas todas las recibidas hasta un momento',
      security: seguridad,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['hasta'],
              properties: { hasta: { type: 'string', format: 'date-time', description: 'Las posteriores siguen sin leer.' } },
            },
          },
        },
      },
      responses: { 200: cantidadNoLeidas, 400: error('"hasta" no es una fecha válida.'), 401: sinSesion, 500: errorInterno },
    },
  },
};
