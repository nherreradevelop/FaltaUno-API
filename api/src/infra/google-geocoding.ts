import { z } from 'zod';
import { errores } from '../comun/errores';
import type { UbicacionActividad } from '../modulos/actividades/actividades.dto';
import type { Coordenadas, ResolvedorPuntos } from '../modulos/actividades/ubicaciones';
import type { Logger } from './logger';

const esquemaRespuesta = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        formatted_address: z.string().min(1).max(255),
        address_components: z.array(z.object({ long_name: z.string(), short_name: z.string(), types: z.array(z.string()) })),
      }),
    )
    .default([]),
});

/** Google Geocoding valida el punto sin desplazarlo a las coordenadas de una calle o lugar cercano. */
export class GoogleGeocoding implements ResolvedorPuntos {
  constructor(
    private readonly clave: string,
    private readonly timeoutMs: number,
    private readonly solicitar: typeof fetch = fetch,
    private readonly logger?: Pick<Logger, 'warn'>,
  ) {}

  async resolver(punto: Coordenadas): Promise<UbicacionActividad> {
    if (!this.clave) throw this.noDisponible();
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.search = new URLSearchParams({ latlng: `${punto.lat},${punto.lng}`, language: 'es', key: this.clave }).toString();
    let cuerpo: unknown;
    try {
      const respuesta = await this.solicitar(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!respuesta.ok) throw new Error('Proveedor no disponible');
      cuerpo = await respuesta.json();
    } catch {
      throw this.noDisponible();
    }
    const resultado = esquemaRespuesta.safeParse(cuerpo);
    if (!resultado.success) throw this.noDisponible();
    if (resultado.data.status === 'ZERO_RESULTS') {
      throw errores.validacion({ ubicacion: 'No pudimos identificar ese punto. Marcá otro punto de Uruguay.' });
    }
    if (resultado.data.status !== 'OK') {
      this.logger?.warn({ evento: 'google_geocoding_rechazado', estado: resultado.data.status }, 'No se pudo validar el punto');
      throw this.noDisponible();
    }
    const lugar = resultado.data.results[0];
    if (!lugar) throw this.noDisponible();
    const pais = lugar.address_components.find((componente) => componente.types.includes('country'));
    const departamento = lugar.address_components.find((componente) => componente.types.includes('administrative_area_level_1'));
    if (pais?.short_name !== 'UY' || !departamento) {
      throw errores.validacion({ ubicacion: 'Marcá un punto de Uruguay que identifique su departamento.' });
    }
    const nombreDepartamento = departamento.long_name
      .replace(/^Departamento de\s+/i, '')
      .replace(/\s+Department$/i, '')
      .trim();
    if (!nombreDepartamento || nombreDepartamento.length > 30) {
      throw errores.validacion({ ubicacion: 'No pudimos identificar el departamento de ese punto.' });
    }
    return { ...punto, direccion: lugar.formatted_address, departamento: nombreDepartamento };
  }

  private noDisponible() {
    return errores.servicioNoDisponible(
      'PUNTOS_NO_DISPONIBLES',
      'No pudimos validar el punto del mapa. Probá de nuevo o buscá un lugar.',
    );
  }
}
