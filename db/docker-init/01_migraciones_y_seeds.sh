#!/bin/bash
# FaltaUno - inicialización del Postgres local de Docker.
# Postgres corre este script UNA sola vez: cuando el volumen de datos está vacío.
# Aplica todas las migraciones y después los datos de prueba, en orden.
# Con un volumen que ya tenía datos no se ejecuta (para empezar de cero: docker compose down -v).

for archivo in /faltauno-db/migrations/*.sql /faltauno-db/seeds/*.sql; do
  echo "FaltaUno: aplicando ${archivo#/faltauno-db/}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$archivo" || exit 1
done
