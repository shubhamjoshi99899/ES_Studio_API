#!/bin/sh
set -eu

wait_for_port() {
  NAME="$1"
  HOST="$2"
  PORT="$3"
  ATTEMPTS="$4"

  echo "Waiting for ${NAME} at ${HOST}:${PORT}..."

  i=1
  while [ "$i" -le "$ATTEMPTS" ]; do
    if HOST="$HOST" PORT="$PORT" node -e "const net = require('net'); const socket = net.createConnection({ host: process.env.HOST, port: Number(process.env.PORT) }, () => { socket.end(); process.exit(0); }); socket.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 1000);" >/dev/null 2>&1; then
      echo "${NAME} is reachable."
      return 0
    fi

    echo "${NAME} not ready yet (${i}/${ATTEMPTS})."
    i=$((i + 1))
    sleep 2
  done

  echo "Timed out waiting for ${NAME} at ${HOST}:${PORT}."
  exit 1
}

wait_for_port "Postgres" "${DB_HOST:-postgres-db}" "${DB_PORT:-5432}" "${DB_WAIT_ATTEMPTS:-30}"
wait_for_port "Redis" "${REDIS_HOST:-redis-cache}" "${REDIS_PORT:-6379}" "${REDIS_WAIT_ATTEMPTS:-30}"

echo "Running database migrations..."
npm run migration:run:dist

echo "Starting API..."
exec node dist/main
