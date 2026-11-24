# FaltaUno - API

API REST e infraestructura de desarrollo de FaltaUno, la plataforma web y móvil para organizar actividades deportivas al aire libre y encontrar compañeros.
Proyecto final de la carrera Analista en Tecnologías de la Información (Universidad ORT Uruguay).

## Repositorios

| Repositorio                                                           | Contenido                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| [FaltaUno](https://github.com/nherreradevelop/FaltaUno) (este)        | API, esquema de la base, Docker de desarrollo y flujos de n8n |
| [FaltaUno-Web](https://github.com/nherreradevelop/FaltaUno-Web)       | Cliente web (React + Vite)                                    |
| [FaltaUno-Mobile](https://github.com/nherreradevelop/FaltaUno-Mobile) | App móvil (React Native + Expo)                               |

Para trabajar en la web o en la app hay que tener levantados los servicios de este repositorio (`docker compose up -d`) y la API.

## Estructura

```
FaltaUno/
├── api/             API REST (Node.js + TypeScript)
├── db/migrations/   Scripts SQL del esquema de PostgreSQL
├── n8n/             Flujos de n8n exportados (JSON)
├── pgadmin/         Conexión preconfigurada de pgAdmin
└── docker-compose.yml   Bases de datos y servicios de desarrollo
```

## Requisitos

- [Node.js 22](https://nodejs.org) (la versión está fijada en `.nvmrc`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git
- VS Code con las extensiones **ESLint** y **Prettier** (VS Code las sugiere al abrir la carpeta)

## Primera vez

```bash
# 1. Clonar e instalar las herramientas del repositorio (ESLint, Prettier, Husky)
git clone <url-del-repositorio>
cd FaltaUno
npm install

# 2. Levantar las bases de datos y servicios (Docker Desktop tiene que estar abierto)
docker compose up -d

# 3. Variables de entorno de la API (los valores de ejemplo ya apuntan a Docker)
cp api/.env.example api/.env          # en PowerShell: Copy-Item api/.env.example api/.env
```

### Crear las tablas

Con los servicios levantados, desde la raíz del repositorio (funciona igual en PowerShell):

```bash
docker cp db/migrations/001_esquema_inicial.sql faltauno-postgres:/tmp/001.sql
docker cp db/migrations/002_catalogos.sql faltauno-postgres:/tmp/002.sql
docker cp db/migrations/003_indice_participacion_actividad.sql faltauno-postgres:/tmp/003.sql
docker cp db/migrations/004_cu10_origen_opcional_destino_provisional.sql faltauno-postgres:/tmp/004.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/001.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/002.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/003.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/004.sql
```

Si la base ya tenía las tablas creadas, alcanza con correr las que falten (cada una se aplica una sola vez):

- `003`: índice de participaciones por actividad (CU08 y CU09).
- `004`: origen opcional del CU10, más precisión en el destino y la marca de destino provisional (cuando Google Maps no está disponible).

> Los scripts se copian al contenedor en lugar de pasarlos por la tubería de PowerShell para no romper las tildes.

### Usuarios de prueba (opcional, solo local)

`db/seeds/001_usuarios_prueba.sql` crea cuentas para probar cada flujo del CU01 (el detalle está en el propio archivo):

```bash
docker cp db/seeds/001_usuarios_prueba.sql faltauno-postgres:/tmp/seed.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/seed.sql
```

`db/seeds/002_perfil_prueba.sql` agrega biografías, deportes, valoraciones e historial de actividades para probar el CU04 (Visualizar perfil). Se corre después del anterior:

```bash
docker cp db/seeds/002_perfil_prueba.sql faltauno-postgres:/tmp/seed2.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/seed2.sql
```

`db/seeds/003_detalle_actividad_prueba.sql` crea una actividad para cada caso del CU09 (Detalle de actividad): cada rol, cada estado, completa, con y sin pronóstico. El detalle de cada una está en el propio archivo. Requiere la migración 003:

```bash
docker cp db/seeds/003_detalle_actividad_prueba.sql faltauno-postgres:/tmp/seed3.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/seed3.sql
```

`db/seeds/004_busqueda_prueba.sql` agrega actividades programadas para probar el CU08 (Buscar actividades): distintos deportes, departamentos, niveles, franjas y cupos, más una completa, una con fecha pasada y una cancelada que no tienen que aparecer:

```bash
docker cp db/seeds/004_busqueda_prueba.sql faltauno-postgres:/tmp/seed4.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/seed4.sql
```

## Ejecutar la API

Con los servicios de Docker levantados:

```bash
cd api
npm install
npm run dev              # http://localhost:3000, documentación Swagger en http://localhost:3000/api/docs
npm test                 # pruebas (Jest)
npm run test:cobertura   # pruebas con cobertura (mínimo 70 % en servicios)
```

## Ejecutar con Docker

La API también corre en un contenedor, junto con las bases y los servicios de `docker-compose.yml`. No hace falta tener Node instalado.

```bash
# api/.env tiene que existir (copiar api/.env.example y completar POSTGRES_URL con la base de Supabase)
docker compose up -d --build     # levanta la API (http://localhost:3000) y todos los servicios
docker compose watch             # recarga en caliente: copia los cambios de api/src al contenedor
docker compose logs -f api       # ver los logs de la API
```

**Base de datos.** La variable `BASE_DATOS` elige contra qué Postgres se conecta la API:

| Valor                    | Base                             |
| ------------------------ | -------------------------------- |
| `supabase` (por defecto) | `POSTGRES_URL` de `api/.env`     |
| `local`                  | El servicio `postgres` de Docker |

Se cambia con un archivo `.env` en la raíz del repositorio (no se sube a Git) con `BASE_DATOS=local`, o solo para un comando:

```powershell
$env:BASE_DATOS="local"; docker compose up -d   # PowerShell
```

Cuando el volumen de Postgres está vacío (la primera vez, o después de `docker compose down -v`), el contenedor aplica solo todas las migraciones y los datos de prueba (`db/docker-init`). Con un volumen que ya tenía datos no se aplica nada: las migraciones nuevas se siguen corriendo a mano como en [Crear las tablas](#crear-las-tablas).

Dentro de Docker, Mongo, Redis, Mailpit y n8n se encuentran por el nombre del servicio, no por `localhost`; `docker-compose.yml` ya reemplaza esas direcciones de `api/.env`.

**Producción / demo** (JavaScript compilado, sin recarga en caliente y sin usuario root):

```bash
docker compose -f docker-compose.yml -f docker-compose.produccion.yml up -d --build
```

## Servicios de desarrollo

| Servicio                    | Dirección                                                           | Credenciales                                         |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| PostgreSQL                  | `localhost:5432`, base `faltauno`                                   | `faltauno` / `faltauno_dev`                          |
| pgAdmin                     | http://localhost:5050                                               | entra directo; contraseña de la base: `faltauno_dev` |
| MongoDB                     | `mongodb://faltauno:faltauno_dev@localhost:27017/?authSource=admin` | (en la URL)                                          |
| Redis                       | `localhost:6379`                                                    | sin contraseña                                       |
| Mailpit (correos de prueba) | http://localhost:8025                                               | —                                                    |
| n8n                         | http://localhost:5678                                               | la primera vez se crea la cuenta de dueño (local)    |

Comandos útiles:

```bash
docker compose up -d       # levantar
docker compose down        # apagar (los datos se conservan)
docker compose down -v     # apagar y BORRAR todos los datos (empezar de cero)
docker ps                  # ver qué contenedores están corriendo
```

## Variables de entorno

| Archivo                | Uso                                                             | ¿Se sube? |
| ---------------------- | --------------------------------------------------------------- | --------- |
| `api/.env.example`     | Plantilla con todas las variables                               | Sí        |
| `api/.env`             | Desarrollo local contra Docker                                  | No        |
| `api/.env.integracion` | Bases compartidas en la nube (Supabase, MongoDB Atlas, Upstash) | No        |

Las contraseñas de la nube se comparten por un canal privado, nunca en el repositorio.

## Calidad de código

- **Prettier** da el formato (`.prettierrc`) y **ESLint** revisa el código (`eslint.config.mjs`).
- **Husky** ejecuta ambos automáticamente sobre los archivos de cada commit (`lint-staged`). Si ESLint encuentra un error, el commit se cancela.
- VS Code formatea al guardar (`.vscode/settings.json`).

```bash
npm run lint           # revisar todo el repositorio
npm run lint:fix       # corregir lo que se pueda automáticamente
npm run format         # formatear todo
npm run format:check   # verificar el formato sin modificar
```

### TypeScript estricto

`tsconfig.base.json` define el modo estricto, y `api/tsconfig.json` lo extiende con las opciones de Node.js 22 y Jest. `api/tsconfig.build.json` compila solo `src/` a `dist/` (`npm run build`).

## n8n

Los flujos se versionan en la carpeta `n8n/` (ver `n8n/README.md`):

```bash
npm run n8n:exportar   # tu n8n -> carpeta n8n/
npm run n8n:importar   # carpeta n8n/ -> tu n8n
```

## Integración continua

GitHub Actions (`.github/workflows/ci.yml`) se ejecuta en cada pull request y push a `develop` o `main`:
lint y formato siempre; compilación y pruebas de la API en cuanto exista `api/package.json`.

La API ejecuta cobertura y pruebas de CU10 contra PostgreSQL de pruebas y Redis `/15`.

## CU23–CU25 Gastos de actividades

La API, web y mobile incluyen registro, edición y eliminación de gastos, reparto igual exacto,
balances transaccionales, control de versiones y recuperación de confirmaciones sin duplicados.
La parte de pagos de CU24/CU25 se completa con CU26, documentado más abajo.

Los cambios avisan al pagador y al reparto mediante el módulo CU40; al editar se avisa solo al pagador y reparto nuevos.
Requiere las migraciones `005_cu23_cu24_cu25_gastos.sql` y `006_notificaciones_gastos.sql`; un volumen existente no las aplica automáticamente.
Ver [activación y funcionamiento](docs/cu23-cu24-cu25-implementacion.md),
[dudas y decisiones aprobadas](docs/plan-cu23-cu24-cu25-gastos.md) y
[evidencia de pruebas](docs/testing/cu23-cu25-casos-prueba.md).

## CU40 Notificaciones

Las notificaciones se guardan en MongoDB (colección `notificaciones`) y se conservan 30 días: un índice TTL las borra solas (RNF-16). Los índices los crea la API al arrancar.

| Método y ruta                                  | Para qué                                            |
| ---------------------------------------------- | --------------------------------------------------- |
| `GET /api/notificaciones?antesDe=<id>`         | Lista de a 20, de la más nueva a la más vieja (A2)  |
| `GET /api/notificaciones/no-leidas`            | Cantidad sin leer, para el indicador                |
| `PATCH /api/notificaciones/:id/leida`          | Marca una como leída, al abrirla o sin abrirla (A5) |
| `POST /api/notificaciones/marcar-todas-leidas` | Marca las recibidas hasta `hasta` (A1)              |

**Tiempo real (Socket.IO).** Comparte el puerto de la API. El cliente se conecta con `auth: { token }` (el mismo token de sesión) y recibe:

- `notificaciones:nueva` → `{ notificacion, noLeidas }` cuando llega una notificación.
- `notificaciones:no-leidas` → `{ cantidad }` cuando cambia la cantidad sin leer (por ejemplo, se leyó desde otro dispositivo).

**Crear una notificación** desde otro caso de uso: `contexto.notificaciones.notificar(usuarioId, { tipo, texto, destino })`, siempre después del commit. Los tipos están en `notificacion.entidad.ts`; cada caso de uso define su texto.

**Datos de prueba** en el Mongo local (6 notificaciones para Elian y 1 para Diego, cada una lleva a una actividad o un usuario de los datos de prueba de PostgreSQL). El archivo se lee dentro del contenedor, así no se rompen los tildes en Windows:

```bash
docker compose exec mongo mongosh "mongodb://faltauno:faltauno_dev@localhost:27017/faltauno?authSource=admin" /seeds-mongo/001_notificaciones_prueba.js
```

## CU21 Valoración de usuarios

Los participantes de una actividad Iniciada o Archivada se valoran entre sí con 1 a 5 estrellas y un comentario opcional. Una nueva valoración al mismo participante en la misma actividad reemplaza a la anterior (A2, RN2). El promedio no se guarda: se calcula con todas las valoraciones al consultar el perfil, así que siempre está al día.

| Método y ruta                                      | Para qué                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/actividades/:id/valoraciones`            | Los demás participantes, con la valoración que ya les diste o `null` |
| `PUT /api/actividades/:id/valoraciones/:usuarioId` | Valorar (o cambiar la valoración de) un participante                 |

Nada pasa todavía una actividad a Iniciada ni a Archivada (es automático según el glosario; el archivado es CU32), así que para probar hay datos de prueba. Se cargan después de `003`:

```bash
docker cp db/seeds/005_valoraciones_prueba.sql faltauno-postgres:/tmp/seed5.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/seed5.sql
```

## CU10 Crear actividad

La implementación incluye API, web y mobile. Para seleccionar origen y destino, configurar
`GOOGLE_MAPS_API_KEY` en `api/.env` con Places API (New) habilitada y reiniciar la API.
El máximo inicial es 20 (`ACTIVIDAD_MAX_PARTICIPANTES`); el costo manual es total y el clima
queda como placeholder de CU15, según la revisión del plan.

Ver [configuración y funcionamiento](docs/cu10-implementacion.md) y
[casos de prueba y resultados](docs/testing/cu10-casos-prueba.md).
El [inventario de integración con Google Maps](docs/google-maps-integracion.md) detalla SDK, servicios, claves y solicitudes de web, API y mobile.

## Forma de trabajo

- Ramas permanentes: `develop` (integración) y `main` (versión lista para producción).
- Cada funcionalidad o corrección en una rama `feature/...` o `fix/...`, que entra a `develop` por pull request revisado por otro integrante y con el CI en verde.
- Cada entrega se pasa de `develop` a `main` y se etiqueta con su versión (`v0.1.0`, ...).
- **Migraciones:** nunca modificar un script que ya se aplicó; los cambios van siempre en un archivo nuevo con el número siguiente (`003_...sql`).
- Las pruebas automáticas se ejecutan siempre contra la base local, nunca contra la compartida.

## CU26 Pagos entre participantes

Registro total o parcial desde balances, historial privado de las dos partes y edición/eliminación por el autor. Retención: seis meses desde el archivo. Requiere la migración `007_cu26_pagos.sql` después de 005 y 006, aplicadas a Supabase el 22/11/2026. Ver [implementación y depuración](docs/cu26-implementacion.md) y [evidencia de ejecución](docs/testing/cu26-ejecucion.md).
