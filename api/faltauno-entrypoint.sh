#!/bin/sh
# FaltaUno - arranque de la API en Docker.
# BASE_DATOS elige la base PostgreSQL:
#   supabase (por defecto): usa POSTGRES_URL de api/.env (la base compartida).
#   local:                  usa el Postgres del docker-compose (POSTGRES_URL_LOCAL).
set -e

case "${BASE_DATOS:-supabase}" in
  supabase)
    echo "FaltaUno: base de datos = POSTGRES_URL de api/.env (Supabase)"
    ;;
  local)
    : "${POSTGRES_URL_LOCAL:?Falta POSTGRES_URL_LOCAL para BASE_DATOS=local}"
    export POSTGRES_URL="$POSTGRES_URL_LOCAL"
    echo "FaltaUno: base de datos = Postgres local de Docker"
    ;;
  *)
    echo "FaltaUno: BASE_DATOS='${BASE_DATOS}' no es válido; usar 'supabase' o 'local'" >&2
    exit 1
    ;;
esac

exec "$@"
