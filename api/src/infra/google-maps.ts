import { z } from 'zod';
import { errores } from '../comun/errores';
import type { Logger } from './logger';
import type { SugerenciaUbicacion, UbicacionActividad } from '../modulos/actividades/actividades.dto';

const esquemaSugerencias = z.object({
  suggestions: z
    .array(z.object({ placePrediction: z.object({ placeId: z.string(), text: z.object({ text: z.string() }) }).optional() }))
    .default([]),
});
const esquemaLugar = z.object({
  formattedAddress: z.string().min(1).max(255),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  addressComponents: z.array(z.object({ longText: z.string(), shortText: z.string().optional(), types: z.array(z.string()) })),
});

/** Google Places (New). La clave queda en el servidor y ambos clientes usan el mismo contrato. */
export class GoogleMaps {
  private proveedorNoDisponible = false;

  constructor(
    private readonly clave: string,
    private readonly timeoutMs: number,
    private readonly solicitar: typeof fetch = fetch,
    private readonly logger?: Pick<Logger, 'warn'>,
  ) {}

  /** Disponibilidad conocida: configuración y último resultado; no realiza una consulta adicional. */
  disponible(): boolean {
    return Boolean(this.clave) && !this.proveedorNoDisponible;
  }

  /** Predicciones de direcciones/lugares limitadas a Uruguay. */
  async buscar(texto: string, sesion: string): Promise<SugerenciaUbicacion[]> {
    const cuerpo = await this.pedir('places:autocomplete', {
      method: 'POST',
      body: JSON.stringify({ input: texto, sessionToken: sesion, includedRegionCodes: ['uy'], languageCode: 'es' }),
    });
    const resultado = esquemaSugerencias.safeParse(cuerpo);
    if (!resultado.success) throw this.respuestaInvalida();
    const datos = resultado.data;
    return datos.suggestions.flatMap(({ placePrediction }) =>
      placePrediction ? [{ placeId: placePrediction.placeId, descripcion: placePrediction.text.text }] : [],
    );
  }

  /** CU10 E4: resolver del lado del servidor y comprobar el país y el departamento reales. */
  async resolver(placeId: string): Promise<UbicacionActividad> {
    const cuerpo = await this.pedir(`places/${encodeURIComponent(placeId)}?languageCode=es`, {
      headers: { 'X-Goog-FieldMask': 'formattedAddress,location,addressComponents' },
    });
    const resultado = esquemaLugar.safeParse(cuerpo);
    if (!resultado.success) throw this.respuestaInvalida();
    const lugar = resultado.data;
    const pais = lugar.addressComponents.find((componente) => componente.types.includes('country'));
    const departamento = lugar.addressComponents.find((componente) => componente.types.includes('administrative_area_level_1'));
    if (pais?.shortText !== 'UY' || !departamento) {
      throw errores.validacion({ ubicacion: 'Seleccioná una ubicación de Uruguay que identifique su departamento.' });
    }
    const nombreDepartamento = departamento.longText.replace(/^Departamento de\s+/i, '').replace(/\s+Department$/i, '');
    if (nombreDepartamento.length > 30) {
      throw errores.validacion({ ubicacion: 'No pudimos identificar el departamento de esa ubicación.' });
    }
    return {
      direccion: lugar.formattedAddress,
      lat: lugar.location.latitude,
      lng: lugar.location.longitude,
      departamento: nombreDepartamento,
    };
  }

  private async pedir(ruta: string, opciones: RequestInit): Promise<unknown> {
    if (!this.clave) {
      this.logger?.warn({ evento: 'google_maps_sin_configurar' }, 'No se configuró la clave de Google Maps');
      throw errores.servicioNoDisponible(
        'MAPAS_NO_CONFIGURADOS',
        'La búsqueda de ubicaciones no está disponible por el momento.',
      );
    }
    let respuesta: Response;
    try {
      respuesta = await this.solicitar(`https://places.googleapis.com/v1/${ruta}`, {
        ...opciones,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.clave, ...opciones.headers },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      this.proveedorNoDisponible = true;
      this.logger?.warn({ evento: 'google_maps_error_conexion' }, 'Google Maps no respondió dentro del tiempo esperado');
      throw errores.servicioNoDisponible('MAPAS_NO_DISPONIBLES', 'No pudimos consultar las ubicaciones. Probá de nuevo.');
    }
    if (respuesta.status === 400 || respuesta.status === 404) {
      this.proveedorNoDisponible = false;
      throw errores.validacion({ ubicacion: 'La ubicación seleccionada ya no está disponible. Volvé a buscarla.' });
    }
    if (!respuesta.ok) {
      this.proveedorNoDisponible = true;
      this.logger?.warn({ evento: 'google_maps_error_proveedor', estado: respuesta.status }, 'Google Maps rechazó la consulta');
      throw errores.servicioNoDisponible('MAPAS_NO_DISPONIBLES', 'No pudimos consultar las ubicaciones. Probá de nuevo.');
    }
    try {
      const cuerpo: unknown = await respuesta.json();
      this.proveedorNoDisponible = false;
      return cuerpo;
    } catch {
      throw this.respuestaInvalida();
    }
  }

  private respuestaInvalida() {
    this.proveedorNoDisponible = true;
    this.logger?.warn({ evento: 'google_maps_respuesta_invalida' }, 'Google Maps devolvió una respuesta incompleta o inválida');
    return errores.servicioNoDisponible('MAPAS_NO_DISPONIBLES', 'No pudimos interpretar las ubicaciones. Probá de nuevo.');
  }
}
