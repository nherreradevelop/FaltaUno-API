import { z } from 'zod';

export const NIVELES_ACTIVIDAD = ['principiante', 'intermedio', 'avanzado'] as const;

/** CU10 E1/E4: IDs resueltos por el servidor; el destino provisional tiene un identificador reservado. */
const lugarId = z.string().trim().min(1, 'Seleccioná una ubicación de Google Maps.').max(255);
export const esquemaCoordenadas = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict();

/** Contrato de CU10. Los límites de texto/dinero corresponden al esquema SQL existente. */
export const esquemaCrearActividad = z
  .object({
    nombre: z.string().trim().min(1, 'Ingresá el nombre.').max(100),
    descripcion: z.string().trim().min(1, 'Ingresá una descripción.').max(1000),
    deporteId: z.number().int().positive(),
    fechaHoraInicio: z.string().datetime({ offset: true, message: 'Ingresá fecha y hora con zona horaria.' }),
    cupoMaximo: z.number().int().min(2).max(32767),
    nivel: z.enum(NIVELES_ACTIVIDAD),
    origenPlaceId: lugarId.nullable().default(null),
    destinoPlaceId: lugarId.nullable().default(null),
    origenCoordenadas: esquemaCoordenadas.optional(),
    destinoCoordenadas: esquemaCoordenadas.optional(),
    tieneVehiculo: z.boolean(),
    lugaresVehiculo: z.number().int().min(0).max(32767).nullable(),
    requiereVehiculo: z.boolean(),
    invitados: z.array(z.string().trim().min(1, 'Ingresá el nombre del invitado.').max(100)).max(32766),
    costoEstimadoCentavos: z.number().int().min(0).max(999999999999).nullable(),
  })
  .strict()
  .superRefine((datos, contexto) => {
    if (datos.origenPlaceId && datos.origenCoordenadas) {
      contexto.addIssue({
        code: 'custom',
        path: ['origenPlaceId'],
        message: 'Elegí un lugar o un pin para el origen, no ambos.',
      });
    }
    if (Boolean(datos.destinoPlaceId) === Boolean(datos.destinoCoordenadas)) {
      contexto.addIssue({ code: 'custom', path: ['destinoPlaceId'], message: 'Seleccioná un lugar o un pin como destino.' });
    }
    if (datos.tieneVehiculo && datos.lugaresVehiculo === null) {
      contexto.addIssue({ code: 'custom', path: ['lugaresVehiculo'], message: 'Indicá cuántas personas podés llevar.' });
    }
    if (!datos.tieneVehiculo && datos.lugaresVehiculo !== null) {
      contexto.addIssue({ code: 'custom', path: ['lugaresVehiculo'], message: 'Solo indicá lugares si tenés vehículo.' });
    }
  });

export const esquemaClaveIdempotencia = z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/, 'Falta una clave válida para este intento.');
export const esquemaBusquedaUbicacion = z.object({
  texto: z.string().trim().min(3, 'Ingresá al menos tres caracteres.').max(200),
  sesion: z.string().uuid(),
});
export const esquemaConsultaPunto = z.object({
  lat: z.string().trim().min(1).pipe(z.coerce.number().min(-90).max(90)),
  lng: z.string().trim().min(1).pipe(z.coerce.number().min(-180).max(180)),
});
export const esquemaConsultaLugar = z.object({ placeId: lugarId });

export type DatosCrearActividad = z.infer<typeof esquemaCrearActividad>;

export interface UbicacionActividad {
  direccion: string;
  lat: number;
  lng: number;
  departamento: string;
}

export interface SugerenciaUbicacion {
  placeId: string;
  descripcion: string;
}

export interface ActividadCreadaDto {
  id: string;
  nombre: string;
  estado: 'programada';
  cantidadParticipantes: number;
  cuposDisponibles: number;
  costoEstimadoCentavos: number | null;
  costoPorPersonaCentavos: number | null;
  destinoProvisional: boolean;
}

/** Preview orientativo: el costo real y los balances corresponden a otros CU. */
export function aActividadCreada(
  id: string,
  datos: Pick<DatosCrearActividad, 'nombre' | 'invitados' | 'cupoMaximo' | 'costoEstimadoCentavos'>,
  destinoProvisional = false,
): ActividadCreadaDto {
  const cantidadParticipantes = 1 + datos.invitados.length;
  return {
    id,
    nombre: datos.nombre,
    estado: 'programada',
    destinoProvisional,
    cantidadParticipantes,
    cuposDisponibles: datos.cupoMaximo - cantidadParticipantes,
    costoEstimadoCentavos: datos.costoEstimadoCentavos,
    costoPorPersonaCentavos:
      datos.costoEstimadoCentavos === null ? null : Math.round(datos.costoEstimadoCentavos / cantidadParticipantes),
  };
}
