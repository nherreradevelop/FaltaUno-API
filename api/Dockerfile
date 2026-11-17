# FaltaUno - imagen de la API.
# El contexto de build es la raíz del repositorio (api/tsconfig.json extiende ../tsconfig.base.json).
#   Desarrollo:  docker compose up -d            (etapa "desarrollo", recarga en caliente con docker compose watch)
#   Producción:  docker compose -f docker-compose.yml -f docker-compose.produccion.yml up -d --build

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
WORKDIR /app

# Herramientas para compilar módulos nativos (bcrypt) si no hay binario precompilado. No llegan a la imagen final.
FROM base AS herramientas
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Todas las dependencias (desarrollo y compilación)
FROM herramientas AS dependencias
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci

# Solo las dependencias de producción
FROM herramientas AS dependencias-produccion
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --omit=dev && npm cache clean --force

# --- Desarrollo: tsx en modo watch; docker compose watch sincroniza api/src ---
FROM base AS desarrollo
ENV NODE_ENV=development
COPY tsconfig.base.json ./
COPY --from=dependencias /app/api/node_modules ./api/node_modules
COPY api/package.json api/tsconfig.json api/tsconfig.build.json api/jest.config.js ./api/
COPY api/src ./api/src
COPY api/test ./api/test
COPY --chmod=755 api/faltauno-entrypoint.sh /usr/local/bin/faltauno-entrypoint.sh
WORKDIR /app/api
EXPOSE 3000
ENTRYPOINT ["faltauno-entrypoint.sh"]
CMD ["npx", "tsx", "watch", "src/index.ts"]

# --- Compilación de TypeScript a JavaScript ---
FROM base AS compilacion
COPY tsconfig.base.json ./
COPY --from=dependencias /app/api/node_modules ./api/node_modules
COPY api/package.json api/tsconfig.json api/tsconfig.build.json ./api/
COPY api/src ./api/src
RUN cd api && npm run build

# --- Producción: solo JavaScript compilado y dependencias de producción, sin usuario root ---
FROM base AS produccion
ENV NODE_ENV=production
WORKDIR /app/api
COPY --from=dependencias-produccion /app/api/node_modules ./node_modules
COPY --from=compilacion /app/api/dist ./dist
COPY api/package.json ./
COPY --chmod=755 api/faltauno-entrypoint.sh /usr/local/bin/faltauno-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["faltauno-entrypoint.sh"]
CMD ["node", "dist/index.js"]
