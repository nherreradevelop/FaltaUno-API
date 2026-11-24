import { Observable } from '../src/comun/observable';
import { crearEventosDeActividades } from '../src/modulos/actividades/actividades.eventos';
import { conectarSuscripciones } from '../src/suscripciones';

const terminarObservadores = () => new Promise((resolve) => setImmediate(resolve));

describe('Observable (guía, sección 9)', () => {
  it('avisa a cada observador y deja de avisar al que se desuscribió', async () => {
    const observable = new Observable<number>(jest.fn());
    const recibidos: number[] = [];
    const desuscribir = observable.suscribir((valor) => {
      recibidos.push(valor);
    });
    observable.notificar(1);
    await terminarObservadores();
    desuscribir();
    observable.notificar(2);
    await terminarObservadores();
    expect(recibidos).toEqual([1]);
  });

  it('si un observador falla, avisa al manejador y los demás reciben el evento igual', async () => {
    const alFallar = jest.fn();
    const observable = new Observable<string>(alFallar);
    const otro = jest.fn();
    observable.suscribir(() => {
      throw new Error('falla');
    });
    observable.suscribir(otro);
    observable.notificar('evento');
    await terminarObservadores();
    expect(alFallar).toHaveBeenCalledWith(expect.any(Error), 'evento');
    expect(otro).toHaveBeenCalledWith('evento');
  });
});

describe('CU11 – suscripciones', () => {
  const evento = { actividadId: 'a', usuarioId: 'u', organizadorId: 'o', cantidadInvitados: 1 };

  function preparar(notificador: { notificar: jest.Mock } | null) {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const eventosActividades = crearEventosDeActividades(logger);
    const actividades = {
      buscarDatosDelAviso: jest.fn().mockResolvedValue({
        nombreActividad: 'Surf',
        nombreParticipante: 'Ana',
        organizadorSilencio: false,
      }),
    };
    const desuscribir = conectarSuscripciones({ eventosActividades, logger, actividades, notificador });
    return { logger, eventosActividades, desuscribir };
  }

  it('participanteUnido queda registrado en el log y se puede desuscribir', async () => {
    const { logger, eventosActividades, desuscribir } = preparar(null);

    eventosActividades.participanteUnido.notificar(evento);
    await terminarObservadores();
    expect(logger.info).toHaveBeenCalledWith({ evento: 'participante_unido', ...evento }, expect.any(String));

    desuscribir();
    eventosActividades.participanteUnido.notificar(evento);
    await terminarObservadores();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('con el notificador del CU40, participanteUnido avisa al organizador', async () => {
    const notificador = { notificar: jest.fn().mockResolvedValue(undefined) };
    const { eventosActividades } = preparar(notificador);

    eventosActividades.participanteUnido.notificar(evento);
    await terminarObservadores();
    expect(notificador.notificar).toHaveBeenCalledWith('o', expect.objectContaining({ tipo: 'participanteUnido' }));
  });
});
