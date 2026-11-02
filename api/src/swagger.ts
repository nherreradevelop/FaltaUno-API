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

const perfil = {
  description: 'Perfil del usuario.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Perfil' } } },
};

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
      Deporte: {
        type: 'object',
        properties: { id: { type: 'integer' }, nombre: { type: 'string' } },
      },
      Perfil: {
        type: 'object',
        description:
          'CU04. Con esPropio = false (A1) es la información pública (RN1) y no incluye email. Con esPropio = true (FP) incluye email.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nombre: { type: 'string' },
          email: { type: 'string', format: 'email', description: 'Solo en el perfil propio.' },
          fotoUrl: { type: 'string', nullable: true },
          biografia: { type: 'string', nullable: true },
          deportes: { type: 'array', items: { $ref: '#/components/schemas/Deporte' }, description: 'Solo deportes activos.' },
          valoracionPromedio: {
            type: 'number',
            nullable: true,
            example: 4.75,
            description: 'Promedio con 2 decimales; null si no tiene valoraciones (RN3).',
          },
          cantidadActividades: {
            type: 'integer',
            description:
              'Solo en el perfil de otro usuario (A1): cantidad de actividades archivadas o canceladas en las que participó.',
          },
          esPropio: { type: 'boolean', description: 'RN2: el cliente muestra "Editar perfil" solo si es true.' },
        },
      },
      Historial: {
        type: 'object',
        properties: {
          actividades: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                nombre: { type: 'string' },
                deporte: { type: 'string' },
                fechaHoraInicio: { type: 'string', format: 'date-time' },
                estado: { type: 'string', enum: ['archivada', 'cancelada'] },
              },
            },
          },
          pagina: { type: 'integer', example: 1 },
          hayMas: { type: 'boolean', description: 'true si hay otra página.' },
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
    '/usuarios/yo/perfil': {
      get: {
        tags: ['Usuarios'],
        summary: 'CU04 FP – Ver mi perfil',
        security: [{ sesion: [] }],
        responses: {
          200: perfil,
          401: error('Sin sesión o sesión vencida (SESION_INVALIDA).'),
          500: error('ER1: no se pudo cargar el perfil (ERROR_INTERNO).'),
        },
      },
    },
    '/usuarios/yo/actividades': {
      get: {
        tags: ['Usuarios'],
        summary: 'CU04 FP – Historial de actividades del perfil propio (archivadas o canceladas, de a 10)',
        security: [{ sesion: [] }],
        parameters: [{ name: 'pagina', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } }],
        responses: {
          200: {
            description: 'Página del historial, de la actividad más reciente a la más antigua.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Historial' } } },
          },
          400: error('Página inválida (DATOS_INVALIDOS).'),
          401: error('Sin sesión o sesión vencida (SESION_INVALIDA).'),
          500: error('ER1: no se pudo cargar el historial (ERROR_INTERNO).'),
        },
      },
    },
    '/usuarios/{id}/perfil': {
      get: {
        tags: ['Usuarios'],
        summary: 'CU04 A1 – Ver el perfil de otro usuario (información pública)',
        security: [{ sesion: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: perfil,
          401: error('Sin sesión o sesión vencida (SESION_INVALIDA).'),
          404: error('E1: el usuario no existe o cerró su cuenta (PERFIL_NO_DISPONIBLE).'),
          500: error('ER1: no se pudo cargar el perfil (ERROR_INTERNO).'),
        },
      },
    },
  },
};
