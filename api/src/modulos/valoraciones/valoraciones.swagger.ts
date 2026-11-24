/** Documentación OpenAPI de CU21 – Sistema de valoración de usuarios. */
const error = (descripcion: string) => ({
  description: descripcion,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});
const seguridad = [{ sesion: [] }];
const idDeActividad = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const sinSesion = error('Sin sesión o sesión vencida (SESION_INVALIDA).');
const noExiste = error('La actividad no existe (ACTIVIDAD_NO_DISPONIBLE).');
const noHabilitada = error(
  'E2: la actividad está Programada o Cancelada; solo se valora con la actividad Iniciada o Archivada (VALORACION_NO_HABILITADA).',
);
const errorInterno = error('ER1: no se pudo guardar la valoración (ERROR_INTERNO).');

const valoracion = {
  type: 'object',
  required: ['puntaje', 'comentario'],
  properties: {
    puntaje: { type: 'integer', minimum: 1, maximum: 5 },
    comentario: { type: 'string', nullable: true, maxLength: 500 },
  },
};

export const rutasSwaggerValoraciones = {
  '/actividades/{id}/valoraciones': {
    get: {
      tags: ['Valoraciones'],
      summary: 'CU21 FP pasos 1 y 2 – Participantes para valorar, con la valoración que ya les diste',
      description: 'Devuelve los demás participantes de la actividad. miValoracion es null en los pendientes (A1).',
      security: seguridad,
      parameters: [idDeActividad],
      responses: {
        200: {
          description: 'Participantes de la actividad, sin incluir al usuario.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['participantes'],
                properties: {
                  participantes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['usuario', 'esOrganizador', 'miValoracion'],
                      properties: {
                        usuario: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            nombre: { type: 'string' },
                            fotoUrl: { type: 'string', nullable: true },
                          },
                        },
                        esOrganizador: { type: 'boolean' },
                        miValoracion: { ...valoracion, nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        401: sinSesion,
        403: error('RN1: el usuario no participó de la actividad (NO_PARTICIPO).'),
        404: noExiste,
        409: noHabilitada,
        500: errorInterno,
      },
    },
  },
  '/actividades/{id}/valoraciones/{usuarioId}': {
    put: {
      tags: ['Valoraciones'],
      summary: 'CU21 FP pasos 6 a 10 – Valorar a un participante (si ya lo valoraste, se reemplaza: A2, RN2)',
      security: seguridad,
      parameters: [idDeActividad, { name: 'usuarioId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['puntaje'],
              properties: {
                puntaje: { type: 'integer', minimum: 1, maximum: 5, description: 'Obligatorio (RN6).' },
                comentario: { type: 'string', nullable: true, maxLength: 500, description: 'Opcional (RN6).' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'FP paso 10: la valoración quedó registrada.',
          content: {
            'application/json': {
              schema: { type: 'object', required: ['valoracion'], properties: { valoracion } },
            },
          },
        },
        400: error('E1: puntaje faltante o fuera de 1 a 5, o comentario demasiado largo (DATOS_INVALIDOS).'),
        401: sinSesion,
        403: error('RN1: alguno de los dos no participó (NO_PARTICIPO). RN5: no podés valorarte (VALORACION_PROPIA).'),
        404: noExiste,
        409: noHabilitada,
        500: errorInterno,
      },
    },
  },
};
