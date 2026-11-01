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
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/001.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/002.sql
```

> Los scripts se copian al contenedor en lugar de pasarlos por la tubería de PowerShell para no romper las tildes.

### Usuarios de prueba (opcional, solo local)

`db/seeds/001_usuarios_prueba.sql` crea cuentas para probar cada flujo del CU01 (el detalle está en el propio archivo):

```bash
docker cp db/seeds/001_usuarios_prueba.sql faltauno-postgres:/tmp/seed.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 -f /tmp/seed.sql
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

## Forma de trabajo

- Ramas permanentes: `develop` (integración) y `main` (versión lista para producción).
- Cada funcionalidad o corrección en una rama `feature/...` o `fix/...`, que entra a `develop` por pull request revisado por otro integrante y con el CI en verde.
- Cada entrega se pasa de `develop` a `main` y se etiqueta con su versión (`v0.1.0`, ...).
- **Migraciones:** nunca modificar un script que ya se aplicó; los cambios van siempre en un archivo nuevo con el número siguiente (`003_...sql`).
- Las pruebas automáticas se ejecutan siempre contra la base local, nunca contra la compartida.
