const id = { type: 'string', format: 'uuid' };
const monto = { type: 'integer', minimum: 1, maximum: 999999999999, description: 'Centésimos enteros.' };
const version = { type: 'integer', minimum: 1, maximum: 2147483646 };
export const esquemasSwaggerPagos = {
  DatosPago: {
    type: 'object',
    additionalProperties: false,
    required: ['pagadorId', 'receptorId', 'montoCentesimos'],
    properties: { pagadorId: id, receptorId: id, montoCentesimos: monto },
  },
  Pago: {
    type: 'object',
    properties: {
      id,
      actividadId: id,
      pagadorId: id,
      receptorId: id,
      registradoPorId: id,
      montoCentesimos: monto,
      version,
      fechaRegistro: { type: 'string', format: 'date-time' },
      eliminado: { type: 'boolean' },
      maximoCentesimos: { type: 'integer', minimum: 0, description: 'Solo en detalle: deuda calculada sin este pago.' },
    },
  },
  ResultadoPago: { type: 'object', properties: { pago: { $ref: '#/components/schemas/Pago' }, sinCambios: { type: 'boolean' } } },
  OpcionesPago: {
    allOf: [
      { $ref: '#/components/schemas/OpcionesGasto' },
      {
        type: 'object',
        properties: {
          deudas: { type: 'array', items: { $ref: '#/components/schemas/BalanceGasto' } },
          historialVencido: { type: 'boolean' },
          historialHasta: { type: 'string', format: 'date-time', nullable: true },
        },
      },
    ],
  },
};
const actividad = { in: 'path', name: 'actividadId', required: true, schema: id };
const pago = { in: 'path', name: 'pagoId', required: true, schema: id };
const clave = {
  in: 'header',
  name: 'Idempotency-Key',
  required: true,
  schema: { type: 'string', pattern: '^[a-zA-Z0-9_-]{16,128}$' },
};
const errores = {
  400: { description: 'Datos inválidos; monto indica el máximo vigente.' },
  401: { description: 'Sin sesión.' },
  403: { description: 'Sin participación o autoría.' },
  404: { description: 'No disponible para este usuario.' },
  409: { description: 'Sin deuda, versión desactualizada, estado inválido o intento modificado.' },
  410: { description: 'Venció el historial: seis meses calendario desde fecha_archivado.' },
  500: { description: 'Falla técnica: verificar el resultado antes de reenviar la misma clave y datos.' },
};
const respuesta = (schema: Record<string, unknown>) => ({
  description: 'Resultado.',
  content: { 'application/json': { schema } },
});
const cuerpo = (schema: Record<string, unknown>) => ({ required: true, content: { 'application/json': { schema } } });
const resultado = { $ref: '#/components/schemas/ResultadoPago' };
const comun = { tags: ['Pagos'], security: [{ sesion: [] }] };
export const rutasSwaggerPagos = {
  '/actividades/{actividadId}/pagos': {
    get: {
      ...comun,
      summary: 'CU26 RN4 – Historial privado de las dos partes',
      parameters: [actividad, { in: 'query', name: 'cursor', schema: { type: 'string' } }],
      responses: {
        200: respuesta({
          type: 'object',
          properties: {
            pagos: { type: 'array', items: { $ref: '#/components/schemas/Pago' } },
            siguienteCursor: { type: 'string', nullable: true },
            opciones: { $ref: '#/components/schemas/OpcionesPago' },
          },
        }),
        ...errores,
      },
    },
    post: {
      ...comun,
      summary: 'CU26 – Registrar pago total o parcial',
      description: 'Puede registrarlo quien pagó o quien cobró. Transacción con revalidación de deuda e idempotencia durable.',
      parameters: [actividad, clave],
      requestBody: cuerpo({ $ref: '#/components/schemas/DatosPago' }),
      responses: { 201: respuesta(resultado), ...errores },
    },
  },
  '/actividades/{actividadId}/pagos/opciones': {
    get: {
      ...comun,
      summary: 'Deudas propias, personas, estado y retención',
      parameters: [actividad],
      responses: { 200: respuesta({ $ref: '#/components/schemas/OpcionesPago' }), ...errores },
    },
  },
  '/actividades/{actividadId}/pagos/{pagoId}': {
    get: {
      ...comun,
      summary: 'Detalle privado y máximo para editar',
      parameters: [actividad, pago],
      responses: { 200: respuesta({ $ref: '#/components/schemas/Pago' }), ...errores },
    },
    put: {
      ...comun,
      summary: 'CU24 – Editar únicamente el monto de un pago propio',
      parameters: [actividad, pago, clave],
      requestBody: cuerpo({
        type: 'object',
        additionalProperties: false,
        required: ['version', 'montoCentesimos'],
        properties: { version, montoCentesimos: monto },
      }),
      responses: { 200: respuesta(resultado), ...errores },
    },
    delete: {
      ...comun,
      summary: 'CU25 – Eliminar pago propio con confirmación de versión',
      parameters: [actividad, pago, clave],
      requestBody: cuerpo({ type: 'object', additionalProperties: false, required: ['version'], properties: { version } }),
      responses: { 200: respuesta(resultado), ...errores },
    },
  },
  '/actividades/{actividadId}/operaciones-pagos/{clave}': {
    get: {
      ...comun,
      summary: 'RNF-23 – Consultar intento propio antes de reenviar',
      parameters: [actividad, { ...clave, in: 'path' }],
      responses: {
        200: respuesta({
          oneOf: [
            { type: 'object', properties: { estado: { enum: ['confirmada'] }, resultado } },
            { type: 'object', properties: { estado: { enum: ['noRegistrada'] } } },
          ],
        }),
        ...errores,
      },
    },
  },
};
