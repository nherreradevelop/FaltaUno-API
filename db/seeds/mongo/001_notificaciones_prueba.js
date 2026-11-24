/* global db, print -- variables propias de mongosh */
// FaltaUno - notificaciones de prueba (CU40) para el MongoDB local. Solo para desarrollo.
// Mientras no existan los casos de uso que notifican (CU06, CU12, CU13, ...), sirven para probar la campana.
// Los textos son de ejemplo: cada caso de uso definirá los suyos. Cada una lleva a una actividad o un usuario
// que existen en los datos de prueba de PostgreSQL (db/seeds/001 y 003).
//
// Los tildes y eñes de los textos van escritos como \uXXXX (por ejemplo \u00e9 = é) para que lleguen bien a MongoDB
// aunque la terminal cambie la codificación del archivo (Windows PowerShell lo hace con "<" o Get-Content).
// Cargar (desde FaltaUno-API, con docker compose levantado); el archivo se lee adentro del contenedor:
//   docker compose exec mongo mongosh "mongodb://faltauno:faltauno_dev@localhost:27017/faltauno?authSource=admin" /seeds-mongo/001_notificaciones_prueba.js
// Se puede correr más de una vez: borra antes las notificaciones de prueba de estos usuarios.

const ELIAN = '00000000-0000-4000-8000-000000000001';
const CARLA = '00000000-0000-4000-8000-000000000003';
const DIEGO = '00000000-0000-4000-8000-000000000004';
const SURF_LA_PALOMA = '00000000-0000-4000-9100-000000000001';
const PEDALEADA = '00000000-0000-4000-9100-000000000002';
const TREKKING = '00000000-0000-4000-9100-000000000003';
// Iniciada y Archivada: en estas sí se puede valorar a los participantes (CU21)
// Cancelada
const RUNNING_RAMBLA = '00000000-0000-4000-9100-000000000005';
const SURF_PUNTA_DEL_DIABLO = '00000000-0000-4000-9100-000000000004';
const VOLEY_PLAYA_RAMIREZ = '00000000-0000-4000-9100-000000000006';

const MINUTO = 60 * 1000;
const ahora = Date.now();

function notificacion(usuarioId, minutosAtras, tipo, texto, destino, leida) {
  return { usuarioId, tipo, texto, destino, leida, creadaEn: new Date(ahora - minutosAtras * MINUTO) };
}

const coleccion = db.getCollection('notificaciones');
coleccion.deleteMany({ usuarioId: { $in: [ELIAN, DIEGO] } });

const deElian = [
  notificacion(
    ELIAN,
    3,
    'invitacionRecibida',
    'Carla M\u00e9ndez te invit\u00f3 a "Surf en La Paloma".',
    { tipo: 'actividad', id: SURF_LA_PALOMA },
    false,
  ),
  notificacion(
    ELIAN,
    45,
    'solicitudAmistadRecibida',
    'Carla M\u00e9ndez te envi\u00f3 una solicitud de amistad.',
    { tipo: 'usuario', id: CARLA },
    false,
  ),
  notificacion(
    ELIAN,
    180,
    'participanteAbandono',
    'Diego Rodr\u00edguez abandon\u00f3 "Pedaleada a Atl\u00e1ntida".',
    { tipo: 'actividad', id: PEDALEADA },
    false,
  ),
  notificacion(
    ELIAN,
    60 * 26,
    'actividadEditada',
    'Cambi\u00f3 el punto de encuentro de "Trekking en el Pan de Az\u00facar".',
    { tipo: 'actividad', id: TREKKING },
    true,
  ),
  notificacion(
    ELIAN,
    60 * 24 * 2,
    'valoracionPendiente',
    'Ya pod\u00e9s valorar a quienes fueron a "Surf en Punta del Diablo".',
    { tipo: 'actividad', id: SURF_PUNTA_DEL_DIABLO },
    true,
  ),
  notificacion(
    ELIAN,
    60 * 24 * 6,
    'valoracionPendiente',
    'Ya pod\u00e9s valorar a quienes fueron a "V\u00f3ley en Playa Ram\u00edrez".',
    { tipo: 'actividad', id: VOLEY_PLAYA_RAMIREZ },
    true,
  ),
];
coleccion.insertMany(deElian);
coleccion.insertOne(
  notificacion(
    DIEGO,
    10,
    'actividadCancelada',
    'Se cancel\u00f3 "Running en la rambla".',
    { tipo: 'actividad', id: RUNNING_RAMBLA },
    false,
  ),
);

print(`Notificaciones de prueba cargadas: ${deElian.length} para Elian y 1 para Diego.`);
