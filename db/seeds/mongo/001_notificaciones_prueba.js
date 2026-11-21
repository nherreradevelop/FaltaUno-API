/* global db, print -- variables propias de mongosh */
// FaltaUno - notificaciones de prueba (CU40) para el MongoDB local. Solo para desarrollo.
// Mientras no existan los casos de uso que notifican (CU06, CU12, CU13, ...), sirven para probar la campana.
// Los textos son de ejemplo: cada caso de uso definirá los suyos.
//
// Cargar (desde FaltaUno-API, con docker compose levantado). El archivo se lee adentro del contenedor,
// así no lo altera la codificación de la terminal (en Windows PowerShell, pasarlo con "<" o Get-Content rompe los tildes):
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
    'Carla Méndez te invitó a "Surf en La Paloma".',
    { tipo: 'actividad', id: SURF_LA_PALOMA },
    false,
  ),
  notificacion(
    ELIAN,
    45,
    'solicitudAmistadRecibida',
    'Carla Méndez te envió una solicitud de amistad.',
    { tipo: 'usuario', id: CARLA },
    false,
  ),
  notificacion(
    ELIAN,
    180,
    'participanteAbandono',
    'Diego Rodríguez abandonó "Pedaleada a Atlántida".',
    { tipo: 'actividad', id: PEDALEADA },
    false,
  ),
  notificacion(
    ELIAN,
    60 * 26,
    'actividadEditada',
    'Cambió el punto de encuentro de "Trekking en el Pan de Azúcar".',
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
      `Ya podés valorar a los participantes de la salida ${i}.`,
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
    'Se canceló "Surf en La Paloma".',
    { tipo: 'actividad', id: SURF_LA_PALOMA },
    false,
  ),
);

print(`Notificaciones de prueba cargadas: ${deElian.length} para Elian y 1 para Diego.`);
