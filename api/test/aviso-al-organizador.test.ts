import type { DatosDelAviso } from '../src/modulos/actividades/actividades.repositorio';
import {
  crearAvisoAlOrganizador,
  ESPERAS_ENTRE_REINTENTOS_MS,
  textoDelAviso,
  type Notificador,
} from '../src/modulos/actividades/aviso-al-organizador';

const EVENTO = { actividadId: 'actividad-1', usuarioId: 'juan', organizadorId: 'elian', cantidadInvitados: 2 };
const DATOS: DatosDelAviso = {
  nombreActividad: 'Volley con los tussi',
  nombreParticipante: 'Juan Pérez',
  organizadorSilencio: false,
};

function preparar(datos: DatosDelAviso | null = DATOS) {
  const actividades = { buscarDatosDelAviso: jest.fn().mockResolvedValue(datos) };
  const notificador = { notificar: jest.fn<ReturnType<Notificador['notificar']>, Parameters<Notificador['notificar']>>() };
  notificador.notificar.mockResolvedValue(undefined);
  const logger = { warn: jest.fn(), error: jest.fn() };
  const esperas: number[] = [];
  const esperar = jest.fn(async (milisegundos: number) => {
    esperas.push(milisegundos);
  });
  const aviso = crearAvisoAlOrganizador({ actividades, notificador, logger, esperar });
  return { aviso, actividades, notificador, logger, esperas };
}

describe('CU11 – aviso al organizador (observador de participanteUnido)', () => {
  it('FP paso 9 / RN13: notifica al organizador con la cantidad de invitados y enlace a la actividad', async () => {
    const { aviso, notificador, actividades } = preparar();
    await aviso(EVENTO);
    expect(actividades.buscarDatosDelAviso).toHaveBeenCalledWith('actividad-1', 'juan');
    expect(notificador.notificar).toHaveBeenCalledWith('elian', {
      tipo: 'participanteUnido',
      texto: 'Juan Pérez se unió a Volley con los tussi con 2 invitados.',
      destino: { tipo: 'actividad', id: 'actividad-1' },
    });
  });

  it('RN14 / CU40 RN3: si el organizador silenció la actividad, no se le avisa', async () => {
    const { aviso, notificador } = preparar({ ...DATOS, organizadorSilencio: true });
    await aviso(EVENTO);
    expect(notificador.notificar).not.toHaveBeenCalled();
  });

  it('CU33: sin organizador (cuenta cerrada) no se busca ni se notifica nada', async () => {
    const { aviso, notificador, actividades } = preparar();
    await aviso({ ...EVENTO, organizadorId: null });
    expect(actividades.buscarDatosDelAviso).not.toHaveBeenCalled();
    expect(notificador.notificar).not.toHaveBeenCalled();
  });

  it('si la actividad o el usuario ya no existen, lo deja en el log y no notifica', async () => {
    const { aviso, notificador, logger } = preparar(null);
    await aviso(EVENTO);
    expect(notificador.notificar).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ evento: 'cu11_aviso_sin_datos' }), expect.any(String));
  });

  it('ER3: si falla, registra el error y reintenta en segundo plano hasta lograrlo', async () => {
    const { aviso, notificador, logger, esperas } = preparar();
    notificador.notificar.mockRejectedValueOnce(new Error('MongoDB no responde')).mockResolvedValueOnce(undefined);
    await aviso(EVENTO);
    expect(notificador.notificar).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([ESPERAS_ENTRE_REINTENTOS_MS[0]]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'cu11_aviso_organizador_fallido', intento: 1, quedanReintentos: true }),
      expect.any(String),
    );
  });

  it('ER3: si falla siempre, deja de reintentar y lo registra como último intento', async () => {
    const { aviso, notificador, logger, esperas } = preparar();
    notificador.notificar.mockRejectedValue(new Error('MongoDB no responde'));
    await aviso(EVENTO);
    expect(notificador.notificar).toHaveBeenCalledTimes(ESPERAS_ENTRE_REINTENTOS_MS.length + 1);
    expect(esperas).toEqual(ESPERAS_ENTRE_REINTENTOS_MS);
    expect(logger.error).toHaveBeenLastCalledWith(expect.objectContaining({ quedanReintentos: false }), expect.any(String));
  });

  it('el texto indica los invitados solo si los trae, en singular o plural', () => {
    expect(textoDelAviso('Ana', 'Surf', 0)).toBe('Ana se unió a Surf.');
    expect(textoDelAviso('Ana', 'Surf', 1)).toBe('Ana se unió a Surf con 1 invitado.');
    expect(textoDelAviso('Ana', 'Surf', 3)).toBe('Ana se unió a Surf con 3 invitados.');
  });
});
