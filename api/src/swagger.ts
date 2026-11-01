/**
 * Documentación OpenAPI de la API (Plan de calidad - SQA). Se ve en http://localhost:3000/api/docs.
 * Cada endpoint nuevo se agrega acá.
 */
const respuestaError = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        codigo: { type: 'string', example: 'CREDENCIALES_INCORRECTAS' },
        mensaje: { type: 'string', example: 'El correo o la contraseña son incorrectos.' },
        campos: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
  },
};

function error(descripcion: string) {
  return { description: descripcion, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
}

const respuestaLogin = {
  description: 'Sesión creada.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/RespuestaLogin' } } },
};

export const documentoSwagger = {
  openapi: '3.0.3',
  info: { title: 'FaltaUno API', version: '0.1.0' },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: { sesion: { type: 'http', scheme: 'bearer' } },
    schemas: {
      Error: respuestaError,
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nombre: { type: 'string' },
          email: { type: 'string', format: 'email' },
          fotoUrl: { type: 'string', nullable: true },
        },
      },
      RespuestaLogin: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Token opaco de sesión. Se envía como "Authorization: Bearer <token>".' },
          venceEn: { type: 'string', format: 'date-time' },
          usuario: { $ref: '#/components/schemas/Usuario' },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Autenticación'],
        summary: 'CU01 – Inicio de sesión con correo y contraseña',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: respuestaLogin,
          400: error('Formato inválido (DATOS_INVALIDOS).'),
          401: error('E3: correo o contraseña incorrectos (CREDENCIALES_INCORRECTAS).'),
          403: error('E1: la cuenta no verificó su correo (CUENTA_NO_VERIFICADA).'),
          429: error('E4: cuenta bloqueada (DEMASIADOS_INTENTOS) o límite por IP (DEMASIADAS_SOLICITUDES).'),
          500: error('ER1: error inesperado (ERROR_INTERNO).'),
        },
      },
    },
    '/auth/google': {
      post: {
        tags: ['Autenticación'],
        summary: 'CU01 A1 – Inicio de sesión con Google',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idToken'],
                properties: { idToken: { type: 'string', description: 'ID token que el cliente obtuvo de Google.' } },
              },
            },
          },
        },
        responses: {
          200: respuestaLogin,
          400: error('Falta el token (DATOS_INVALIDOS).'),
          401: error('ER2: token inválido o correo no verificado (TOKEN_GOOGLE_INVALIDO, CORREO_GOOGLE_NO_VERIFICADO).'),
          404: error('E2: no hay una cuenta con ese correo (CUENTA_NO_ENCONTRADA).'),
          429: error('Límite por IP (DEMASIADAS_SOLICITUDES).'),
          503: error(
            'ER2: Google no responde o no está configurado (GOOGLE_NO_DISPONIBLE, GOOGLE_SIN_RESPUESTA, GOOGLE_SIN_CONFIGURAR).',
          ),
        },
      },
    },
    '/usuarios/yo': {
      get: {
        tags: ['Usuarios'],
        summary: 'Usuario de la sesión actual (restaurar sesión al abrir la app)',
        security: [{ sesion: [] }],
        responses: {
          200: {
            description: 'Usuario actual.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } },
          },
          401: error('Sin sesión o sesión vencida (SESION_INVALIDA).'),
        },
      },
    },
  },
};
