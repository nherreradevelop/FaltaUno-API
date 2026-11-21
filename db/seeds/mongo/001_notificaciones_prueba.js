/* global db, print -- variables propias de mongosh */
// FaltaUno - notificaciones de prueba (CU40) para el MongoDB local. Solo para desarrollo.
// Mientras no existan los casos de uso que notifican (CU06, CU12, CU13, ...), sirven para probar la campana.
// Los textos son de ejemplo: cada caso de uso definirá los suyos.
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
];
// Notificaciones más viejas, para probar "Ver más" (de a 20)
for (let i = 1; i <= 21; i++) {
  deElian.push(
    notificacion(
      ELIAN,
      60 * 24 * (i + 1),
      'valoracionPendiente',
      `Ya pod\u00e9s valorar a los participantes de la salida ${i}.`,
      { tipo: 'actividad', id: TREKKING },
      true,
    ),
  );
}

coleccion.insertMany(deElian);
coleccion.insertOne(
  notificacion(
    DIEGO,
    10,
    'actividadCancelada',
    'Se cancel\u00f3 "Surf en La Paloma".',
    { tipo: 'actividad', id: SURF_LA_PALOMA },
    false,
  ),
);

print(`Notificaciones de prueba cargadas: ${deElian.length} para Elian y 1 para Diego.`);
