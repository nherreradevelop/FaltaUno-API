const error = {
  description: 'Error tipado.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
};
const seguridad = [{ sesion: [] }];
const coordenadas = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lng'],
  properties: { lat: { type: 'number', minimum: -90, maximum: 90 }, lng: { type: 'number', minimum: -180, maximum: 180 } },
};
const ubicacionResuelta = {
  type: 'object',
  required: ['lat', 'lng', 'direccion', 'departamento'],
  properties: { ...coordenadas.properties, direccion: { type: 'string' }, departamento: { type: 'string' } },
};
const respuestaCreada = {
  type: 'object',
  required: [
    'id',
    'nombre',
    'estado',
    'cantidadParticipantes',
    'cuposDisponibles',
    'costoEstimadoCentavos',
    'costoPorPersonaCentavos',
    'destinoProvisional',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    nombre: { type: 'string' },
    estado: { type: 'string', enum: ['programada'] },
    destinoProvisional: { type: 'boolean', description: 'El organizador debe editar posteriormente el destino provisional.' },
    cantidadParticipantes: { type: 'integer' },
    cuposDisponibles: { type: 'integer' },
    costoEstimadoCentavos: { type: 'integer', nullable: true, description: 'Costo TOTAL del traslado, en centésimos.' },
    costoPorPersonaCentavos: {
      type: 'integer',
      nullable: true,
      description: 'Aproximación entre los participantes actuales; no registra gastos ni balances.',
    },
  },
};
const propiedades = {
  nombre: { type: 'string', minLength: 1, maxLength: 100 },
  descripcion: { type: 'string', minLength: 1, maxLength: 1000 },
  deporteId: { type: 'integer', minimum: 1 },
  fechaHoraInicio: { type: 'string', format: 'date-time', description: 'Instante futuro ISO 8601 con zona horaria explícita.' },
  cupoMaximo: {
    type: 'integer',
    minimum: 2,
    description: 'Máximo vigente disponible en GET /actividades/opciones (20 inicialmente).',
  },
  nivel: { type: 'string', enum: ['principiante', 'intermedio', 'avanzado'] },
  origenPlaceId: {
    type: 'string',
    nullable: true,
    description: 'Con vehículo propio, indicar un lugar o usar origenCoordenadas. No combinar ambos. Sin vehículo, es opcional.',
  },
  destinoPlaceId: {
    type: 'string',
    nullable: true,
    description:
      'ID de Google, o null/omitido si se usa destinoCoordenadas. El ID provisional solo se acepta si Maps no está disponible.',
  },
  origenCoordenadas: {
    ...coordenadas,
    description: 'Pin de origen, en lugar de origenPlaceId. La API valida país y departamento.',
  },
  destinoCoordenadas: {
    ...coordenadas,
    description: 'Pin de destino, en lugar de destinoPlaceId. Se conserva el punto seleccionado.',
  },
  tieneVehiculo: { type: 'boolean' },
  lugaresVehiculo: {
    type: 'integer',
    minimum: 0,
    nullable: true,
    description: 'Personas que puede llevar, incluyéndose a sí mismo; null si no tiene vehículo.',
  },
  requiereVehiculo: { type: 'boolean' },
  invitados: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 100 } },
  costoEstimadoCentavos: { type: 'integer', minimum: 0, maximum: 999999999999, nullable: true },
};

/** Contrato de CU10; no expone la clave privada de Google ni implementa CU15/CU22. */
export const rutasSwaggerActividades = {
  '/actividades/opciones': {
    get: {
      tags: ['Actividades'],
      summary: 'CU10 opciones del formulario',
      security: seguridad,
      responses: {
        200: {
          description: 'Deportes activos, niveles, máximo configurable, disponibilidad de mapas y placeholder de pronóstico.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  deportes: {
                    type: 'array',
                    items: { type: 'object', properties: { id: { type: 'integer' }, nombre: { type: 'string' } } },
                  },
                  niveles: { type: 'array', items: propiedades.nivel },
                  maximoParticipantes: { type: 'integer' },
                  mapasDisponibles: { type: 'boolean' },
                  destinoPorDefecto: {
                    type: 'object',
                    description:
                      'Usar únicamente si Maps no está disponible. Las coordenadas canónicas se resuelven en servidor.',
                    properties: {
                      placeId: { type: 'string' },
                      descripcion: { type: 'string' },
                      lat: { type: 'number' },
                      lng: { type: 'number' },
                      provisional: { type: 'boolean', enum: [true] },
                    },
                  },
                  pronostico: {
                    type: 'object',
                    properties: { disponible: { type: 'boolean', enum: [false] }, mensaje: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
        401: error,
        500: error,
      },
    },
  },
  '/actividades/ubicaciones': {
    get: {
      tags: ['Actividades'],
      summary: 'CU10 sugerencias de Google Maps limitadas a Uruguay',
      security: seguridad,
      parameters: [
        { in: 'query', name: 'texto', required: true, schema: { type: 'string', minLength: 3, maxLength: 200 } },
        {
          in: 'query',
          name: 'sesion',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Identificador de la sesión de búsqueda (no de autenticación).',
        },
      ],
      responses: {
        200: {
          description: 'Predicciones del proveedor.',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { placeId: { type: 'string' }, descripcion: { type: 'string' } },
                },
              },
            },
          },
        },
        400: error,
        401: error,
        429: error,
        503: error,
      },
    },
  },
  '/actividades/ubicaciones/punto': {
    get: {
      tags: ['Actividades'],
      summary: 'CU10 validar un pin de Uruguay y obtener una referencia por geocodificación inversa',
      description: 'Conserva las coordenadas del pin. No crea actividades. El alta vuelve a comprobar el punto.',
      security: seguridad,
      parameters: [
        { in: 'query', name: 'lat', required: true, schema: { type: 'number', minimum: -90, maximum: 90 } },
        { in: 'query', name: 'lng', required: true, schema: { type: 'number', minimum: -180, maximum: 180 } },
      ],
      responses: {
        200: {
          description: 'Punto validado con referencia y departamento.',
          content: { 'application/json': { schema: ubicacionResuelta } },
        },
        400: error,
        401: error,
        429: error,
        503: error,
      },
    },
  },
  '/actividades/ubicaciones/detalle': {
    get: {
      tags: ['Actividades'],
      summary: 'CU10 obtener coordenadas de un lugar para centrar el mapa',
      security: seguridad,
      parameters: [{ in: 'query', name: 'placeId', required: true, schema: { type: 'string', minLength: 1, maxLength: 255 } }],
      responses: {
        200: { description: 'Ubicación del lugar validado.', content: { 'application/json': { schema: ubicacionResuelta } } },
        400: error,
        401: error,
        429: error,
        503: error,
      },
    },
  },
  '/actividades': {
    post: {
      tags: ['Actividades'],
      summary: 'CU10 crear actividad con organizador e invitados en una transacción',
      security: seguridad,
      description:
        'La identidad proviene de la sesión. El origen es obligatorio si el organizador tiene vehículo propio y opcional en los demás casos. Los place IDs se resuelven en servidor; el destino provisional solo se acepta si Google Maps no está disponible y queda marcado para edición posterior. Mantener la misma clave y el mismo cuerpo al reintentar un resultado desconocido. La protección dura mientras Redis conserve la reserva (24 horas por defecto). El pronóstico es un placeholder acordado y CU22 queda fuera del alcance.',
      parameters: [
        { in: 'header', name: 'Idempotency-Key', required: true, schema: { type: 'string', pattern: '^[a-zA-Z0-9_-]{16,128}$' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: Object.keys(propiedades).filter(
                (campo) => !['origenPlaceId', 'destinoPlaceId', 'origenCoordenadas', 'destinoCoordenadas'].includes(campo),
              ),
              properties: propiedades,
              oneOf: [
                {
                  required: ['destinoPlaceId'],
                  properties: { destinoPlaceId: { type: 'string', minLength: 1 } },
                  not: { required: ['destinoCoordenadas'] },
                },
                {
                  required: ['destinoCoordenadas'],
                  properties: { destinoPlaceId: { type: 'string', nullable: true, enum: [null] } },
                },
              ],
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Actividad confirmada; el reintento recupera la misma actividad.',
          content: { 'application/json': { schema: respuestaCreada } },
        },
        400: error,
        401: error,
        409: error,
        429: error,
        500: error,
        503: error,
      },
    },
  },
};
