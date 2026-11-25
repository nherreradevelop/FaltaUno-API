const id = { type: 'string', format: 'uuid' };
const personaId = {
  type: 'string',
  pattern: '^[pi]:[0-9a-f-]{36}$',
  description: 'p:UUID de participación o i:UUID de invitado externo.',
};
const monto = { type: 'integer', minimum: 1, maximum: 999999999999, description: 'Centésimos enteros, sin coma flotante.' };
const parte = {
  type: 'object',
  required: ['personaId', 'participacionId', 'montoCentesimos'],
  properties: { personaId, participacionId: id, montoCentesimos: { ...monto, minimum: 0 } },
};
export const esquemasSwaggerGastos = {
  DatosGasto: {
    type: 'object',
    additionalProperties: false,
    required: ['concepto', 'montoCentesimos', 'pagadorId', 'participantes'],
    properties: {
      concepto: { type: 'string', minLength: 1, maxLength: 150 },
      montoCentesimos: monto,
      pagadorId: personaId,
      participantes: { type: 'array', minItems: 1, uniqueItems: true, items: personaId },
    },
  },
  Gasto: {
    type: 'object',
    required: [
      'id',
      'actividadId',
      'registradoPorId',
      'concepto',
      'montoCentesimos',
      'pagadorId',
      'version',
      'fechaRegistro',
      'eliminado',
      'partes',
    ],
    properties: {
      id,
      actividadId: id,
      registradoPorId: id,
      concepto: { type: 'string' },
      montoCentesimos: monto,
      pagadorId: personaId,
      version: { type: 'integer', minimum: 1 },
      fechaRegistro: { type: 'string', format: 'date-time' },
      eliminado: { type: 'boolean' },
      partes: { type: 'array', items: parte },
    },
  },
  ResultadoGasto: {
    type: 'object',
    properties: { gasto: { $ref: '#/components/schemas/Gasto' }, sinCambios: { type: 'boolean' } },
  },
  BalanceGasto: { type: 'object', properties: { deudorId: id, acreedorId: id, montoCentesimos: monto } },
  PersonaGasto: {
    type: 'object',
    properties: {
      id: personaId,
      participacionId: id,
      invitadoId: { ...id, nullable: true },
      usuarioId: { ...id, nullable: true },
      nombre: { type: 'string' },
      responsable: { type: 'string' },
    },
  },
  OpcionesGasto: {
    type: 'object',
    properties: {
      personas: { type: 'array', items: { $ref: '#/components/schemas/PersonaGasto' } },
      puedeEscribir: { type: 'boolean' },
      motivo: { type: 'string', nullable: true },
      participacionActualId: id,
    },
  },
};
const respuesta = (schema: Record<string, unknown>) => ({
  description: 'Resultado de la consulta.',
  content: { 'application/json': { schema } },
});
const errores = {
  400: { description: 'Datos o cursor inválidos.' },
  401: { description: 'Sesión inválida.' },
  403: { description: 'Sin participación o sin permiso sobre el gasto.' },
  404: { description: 'Actividad o gasto no disponible.' },
  409: { description: 'Versión desactualizada, estado inválido o clave reutilizada con otros datos.' },
  500: { description: 'Operación revertida o resultado pendiente de verificación.' },
};
const actividad = { in: 'path', name: 'actividadId', required: true, schema: id };
const gasto = { in: 'path', name: 'gastoId', required: true, schema: id };
const clave = {
  in: 'header',
  name: 'Idempotency-Key',
  required: true,
  schema: { type: 'string', pattern: '^[a-zA-Z0-9_-]{16,128}$' },
};
const comun = { tags: ['Gastos'], security: [{ sesion: [] }] };
const version = { type: 'object', required: ['version'], properties: { version: { type: 'integer', minimum: 1 } } };
const body = (schema: Record<string, unknown>) => ({ required: true, content: { 'application/json': { schema } } });
const resultado = { $ref: '#/components/schemas/ResultadoGasto' };
export const rutasSwaggerGastos = {
  '/actividades/{actividadId}/gastos': {
    get: {
      ...comun,
      summary: 'Lista mínima para CU23–CU25',
      parameters: [actividad, { in: 'query', name: 'cursor', schema: { type: 'string' } }],
      responses: {
        200: respuesta({
          type: 'object',
          properties: {
            gastos: { type: 'array', items: { $ref: '#/components/schemas/Gasto' } },
            siguienteCursor: { type: 'string', nullable: true },
            opciones: { $ref: '#/components/schemas/OpcionesGasto' },
          },
        }),
        ...errores,
      },
    },
    post: {
      ...comun,
      summary: 'CU23 – Registrar gasto',
      description:
        'Reparto igual con ajuste por identificador estable. El reenvío conserva la misma clave y datos. La respuesta confirmada queda almacenada en PostgreSQL.',
      parameters: [actividad, clave],
      requestBody: body({ $ref: '#/components/schemas/DatosGasto' }),
      responses: { 201: respuesta(resultado), ...errores },
    },
  },
  '/actividades/{actividadId}/gastos/opciones': {
    get: {
      ...comun,
      summary: 'Personas y permisos del formulario',
      parameters: [actividad],
      responses: { 200: respuesta({ $ref: '#/components/schemas/OpcionesGasto' }), ...errores },
    },
  },
  '/actividades/{actividadId}/gastos/{gastoId}': {
    get: {
      ...comun,
      summary: 'Detalle vigente del gasto',
      parameters: [actividad, gasto],
      responses: { 200: respuesta({ $ref: '#/components/schemas/Gasto' }), ...errores },
    },
    put: {
      ...comun,
      summary: 'CU24 – Editar gasto',
      description: 'Requiere la versión leída. Un conflicto exige revisar los datos actuales.',
      parameters: [actividad, gasto, clave],
      requestBody: body({
        ...esquemasSwaggerGastos.DatosGasto,
        required: [...esquemasSwaggerGastos.DatosGasto.required, 'version'],
        properties: { ...esquemasSwaggerGastos.DatosGasto.properties, ...version.properties },
      }),
      responses: { 200: respuesta(resultado), ...errores },
    },
    delete: {
      ...comun,
      summary: 'CU25 – Eliminar gasto',
      description: 'Eliminación lógica y recálculo atómicos. Confirmar nuevamente si cambia la versión.',
      parameters: [actividad, gasto, clave],
      requestBody: body(version),
      responses: { 200: respuesta(resultado), ...errores },
    },
  },
  '/actividades/{actividadId}/operaciones-gastos/{clave}': {
    get: {
      ...comun,
      summary: 'Verificar resultado antes de reenviar',
      description:
        'Solo el usuario autor puede consultar su intención. Si no está registrada, reenviar exclusivamente la misma clave, versión y datos; una solicitud anterior todavía podría llegar al servidor. Tras confirmar, refrescar el detalle y los balances actuales.',
      parameters: [actividad, { in: 'path', name: 'clave', required: true, schema: clave.schema }],
      responses: {
        200: respuesta({
          oneOf: [
            { type: 'object', properties: { estado: { type: 'string', enum: ['noRegistrada'] } } },
            { type: 'object', properties: { estado: { type: 'string', enum: ['confirmada'] }, resultado } },
          ],
        }),
        ...errores,
      },
    },
  },
  '/actividades/{actividadId}/balances': {
    get: {
      ...comun,
      summary: 'Balances vigentes necesarios para CU23–CU25',
      parameters: [actividad],
      responses: { 200: respuesta({ type: 'array', items: { $ref: '#/components/schemas/BalanceGasto' } }), ...errores },
    },
  },
};
