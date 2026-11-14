import { rutasSwaggerActividades } from './modulos/actividades/actividades.swagger';

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
          cantidadValoraciones: {
            type: 'integer',
            description: 'Solo en el perfil propio (FP): cantidad de valoraciones recibidas.',
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
      Ubicacion: {
        type: 'object',
        properties: {
          direccion: { type: 'string', example: 'Tres Cruces, Montevideo' },
          lat: { type: 'number', example: -34.894 },
          lng: { type: 'number', example: -56.166 },
        },
      },
      DetalleActividad: {
        type: 'object',
        description: 'CU09 FP. Las opciones dependen del rol del usuario y del estado de la actividad (RN2, RN3, RN5).',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nombre: { type: 'string' },
          deporte: { $ref: '#/components/schemas/Deporte' },
          estado: { type: 'string', enum: ['programada', 'iniciada', 'archivada', 'cancelada'] },
          fechaHoraInicio: { type: 'string', format: 'date-time' },
          fechaLimiteGastos: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'RN4: solo en estado iniciada (inicio + 14 días).',
          },
          nivel: { type: 'string', enum: ['principiante', 'intermedio', 'avanzado'] },
          descripcion: { type: 'string', nullable: true },
          origen: {
            allOf: [{ $ref: '#/components/schemas/Ubicacion' }],
            nullable: true,
            description: 'null si la actividad no tiene punto de partida (CU10: el origen es opcional).',
          },
          destino: { $ref: '#/components/schemas/Ubicacion' },
          cupoMaximo: { type: 'integer', example: 6 },
          cuposOcupados: { type: 'integer', example: 3, description: 'Participantes más invitados externos.' },
          organizador: {
            type: 'object',
            nullable: true,
            description: 'null si el organizador cerró su cuenta.',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nombre: { type: 'string' },
              fotoUrl: { type: 'string', nullable: true },
            },
          },
          costoEstimadoCentesimos: { type: 'integer', nullable: true, example: 120000, description: 'En centésimos.' },
          pronostico: {
            type: 'object',
            nullable: true,
            description: 'null si no hay información ambiental disponible.',
            properties: {
              resumen: { type: 'string' },
              nivelRecomendado: { type: 'string', nullable: true, enum: ['principiante', 'intermedio', 'avanzado'] },
              interpretacionDisponible: { type: 'boolean' },
              fechaGeneracion: { type: 'string', format: 'date-time' },
            },
          },
          miRol: { type: 'string', enum: ['organizador', 'participante', 'ninguno'] },
          opciones: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'verParticipantes',
                'verMapa',
                'unirse',
                'abandonar',
                'verChat',
                'verGastos',
                'invitarAmigos',
                'modificarParticipacion',
                'silenciar',
                'valorar',
                'compartir',
                'editar',
                'removerParticipantes',
                'cancelar',
                'archivar',
              ],
            },
          },
        },
      },
      Participantes: {
        type: 'object',
        properties: {
          participantes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                usuario: {
                  type: 'object',
                  nullable: true,
                  description: 'null si el usuario cerró su cuenta.',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    nombre: { type: 'string' },
                    fotoUrl: { type: 'string', nullable: true },
                  },
                },
                esOrganizador: { type: 'boolean' },
                invitadosExternos: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          pagina: { type: 'integer', example: 1 },
          hayMas: { type: 'boolean', description: 'true si hay otra página.' },
        },
      },
      ActividadEncontrada: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nombre: { type: 'string' },
          deporte: { $ref: '#/components/schemas/Deporte' },
          fechaHoraInicio: { type: 'string', format: 'date-time' },
          departamento: { type: 'string', example: 'Rocha' },
          nivel: { type: 'string', enum: ['principiante', 'intermedio', 'avanzado'] },
          cuposLibres: {
            type: 'integer',
            description: 'Cupo máximo menos participantes (organizador incluido) e invitados externos.',
          },
          organizador: {
            type: 'object',
            nullable: true,
            description: 'Quién organiza la actividad; null si cerró su cuenta.',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nombre: { type: 'string', example: 'Diego Pérez' },
              valoracionPromedio: {
                type: 'number',
                nullable: true,
                example: 4.33,
                description: 'Promedio de valoraciones recibidas, con 2 decimales; null si no tiene.',
              },
            },
          },
          esOrganizador: { type: 'boolean', description: 'true si el usuario de la sesión organiza la actividad.' },
          tieneVehiculo: {
            type: 'boolean',
            description: 'El organizador declaró que tiene vehículo. No garantiza asientos disponibles.',
          },
          requiereVehiculo: { type: 'boolean', description: 'El organizador marcó Buscando traslado.' },
        },
      },
      ResultadoBusqueda: {
        type: 'object',
        properties: {
          actividades: { type: 'array', items: { $ref: '#/components/schemas/ActividadEncontrada' } },
          pagina: { type: 'integer', example: 1 },
          hayMas: { type: 'boolean' },
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
    ...rutasSwaggerActividades,
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
    '/actividades/{id}': {
      get: {
        tags: ['Actividades'],
        summary: 'CU09 – Detalle de actividad',
        security: [{ sesion: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Detalle de la actividad, rol del usuario y opciones disponibles.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DetalleActividad' } } },
          },
          401: error('A3: sin sesión o sesión vencida (SESION_INVALIDA).'),
          404: error('E2: la actividad no existe (ACTIVIDAD_NO_DISPONIBLE).'),
          500: error('ER1: no se pudo recuperar la actividad (ERROR_INTERNO).'),
        },
      },
    },
    '/actividades/{id}/participantes': {
      get: {
        tags: ['Actividades'],
        summary: 'CU09 A1 – Participantes de la actividad, con sus invitados externos (de a 20)',
        security: [{ sesion: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'pagina', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
        ],
        responses: {
          200: {
            description: 'Página de participantes: primero el organizador, después por orden de llegada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Participantes' } } },
          },
          400: error('Página inválida (DATOS_INVALIDOS).'),
          401: error('Sin sesión o sesión vencida (SESION_INVALIDA).'),
          404: error('E2: la actividad no existe (ACTIVIDAD_NO_DISPONIBLE).'),
          500: error('ER1: no se pudo recuperar la lista (ERROR_INTERNO).'),
        },
      },
    },
    '/actividades': {
      // CU10: el alta (POST) está en actividades.swagger.ts; acá se suma la búsqueda (GET) a la misma ruta
      ...rutasSwaggerActividades['/actividades'],
      get: {
        tags: ['Actividades'],
        summary: 'CU08 – Actividades programadas y futuras, de a 10 por sección del dashboard',
        description:
          'Todos los filtros son opcionales y se combinan (RN4). Los que admiten varios valores van separados por coma y alcanza con cumplir uno (RN5). Orden (RN1): por día y, dentro del día, por cercanía del destino a lat/lng; sin lat/lng, por fecha y hora.',
        security: [{ sesion: [] }],
        parameters: [
          {
            name: 'grupo',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['gestionando', 'unido', 'otras'] },
            description:
              'Relación con el usuario autenticado. Las secciones son excluyentes; gestionando y unido incluyen completas. Sin grupo, conserva la búsqueda general con cupo.',
          },
          {
            name: 'deportes',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'A1: ids de deporte, por ejemplo 1,3.',
          },
          {
            name: 'departamentos',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'A5: por ejemplo Rocha,Maldonado.',
          },
          {
            name: 'niveles',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'A6: principiante, intermedio, avanzado.',
          },
          {
            name: 'franjas',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'A4: manana (00:00-11:59), tarde (12:00-19:59), noche (20:00-23:59).',
          },
          {
            name: 'desde',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date' },
            description: 'A2, inclusive (hora de Uruguay).',
          },
          {
            name: 'hasta',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date' },
            description: 'A2, inclusive (hora de Uruguay).',
          },
          {
            name: 'cupoMaximo',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1 },
            description: 'A3: cupo máximo igual o menor.',
          },
          {
            name: 'lat',
            in: 'query',
            required: false,
            schema: { type: 'number' },
            description: 'Ubicación del usuario (con lng).',
          },
          {
            name: 'lng',
            in: 'query',
            required: false,
            schema: { type: 'number' },
            description: 'Ubicación del usuario (con lat).',
          },
          { name: 'pagina', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
        ],
        responses: {
          200: {
            description: 'Página de actividades. Una lista vacía es E1.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ResultadoBusqueda' } } },
          },
          400: error('Filtros inválidos (DATOS_INVALIDOS).'),
          401: error('ER3: sin sesión o sesión vencida (SESION_INVALIDA).'),
          500: error('ER1: no se pudieron recuperar las actividades (ERROR_INTERNO).'),
        },
      },
    },
    '/actividades/departamentos': {
      get: {
        tags: ['Actividades'],
        summary: 'CU08 A5 – Opciones del filtro de departamento',
        security: [{ sesion: [] }],
        responses: {
          200: {
            description: 'Los 19 departamentos de Uruguay.',
            content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } },
          },
          401: error('Sin sesión o sesión vencida (SESION_INVALIDA).'),
        },
      },
    },
    '/deportes': {
      get: {
        tags: ['Deportes'],
        summary: 'CU08 A1 – Deportes activos del catálogo (opciones del filtro de deporte)',
        security: [{ sesion: [] }],
        responses: {
          200: {
            description: 'Deportes activos, ordenados por nombre.',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Deporte' } } } },
          },
          401: error('Sin sesión o sesión vencida (SESION_INVALIDA).'),
          500: error('ER2: no se pudo cargar el catálogo (ERROR_INTERNO).'),
        },
      },
    },
  },
};
