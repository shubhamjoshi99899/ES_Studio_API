const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config();

const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 5432;
const CONNECT_TIMEOUT_MS = 1000;
const WAIT_TIMEOUT_MS = 30000;
const RETRY_INTERVAL_MS = 1000;

function isLocalHost(host) {
  return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function canUseDockerCompose() {
  return fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'));
}

function tryConnect(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForPort(host, port, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await tryConnect(host, port)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }

  return false;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  if (result.error) {
    return false;
  }

  return result.status === 0;
}

async function main() {
  const host = process.env.DB_HOST || DEFAULT_HOST;
  const port = parseInt(process.env.DB_PORT || String(DEFAULT_PORT), 10);

  if (!isLocalHost(host)) {
    console.log(`[ensure-db] Skipping auto-start for remote DB host: ${host}:${port}`);
    return;
  }

  if (await tryConnect(host, port)) {
    console.log(`[ensure-db] Database already reachable at ${host}:${port}`);
    return;
  }

  if (!canUseDockerCompose()) {
    console.warn(
      `[ensure-db] Database is not reachable at ${host}:${port}, and no docker-compose.yml was found.`,
    );
    return;
  }

  console.log(`[ensure-db] Database is not reachable at ${host}:${port}. Starting postgres-db...`);

  const started =
    runCommand('docker', ['compose', 'up', '-d', 'postgres-db']) ||
    runCommand('docker-compose', ['up', '-d', 'postgres-db']);

  if (!started) {
    console.warn(
      '[ensure-db] Failed to start postgres-db via Docker Compose. Start PostgreSQL manually and retry.',
    );
    return;
  }

  const ready = await waitForPort(host, port, WAIT_TIMEOUT_MS);

  if (!ready) {
    console.warn(
      `[ensure-db] postgres-db was started, but ${host}:${port} did not become reachable within ${WAIT_TIMEOUT_MS}ms.`,
    );
    return;
  }

  console.log(`[ensure-db] Database is now reachable at ${host}:${port}`);
}

main().catch((error) => {
  console.warn(`[ensure-db] Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
});
