/**
 * Development/production playground server orchestration shared by the
 * browser profilers. Reuses an already-listening server on the mode's port;
 * otherwise builds (production only, unless skipped) and spawns the
 * repository's own dev or preview server.
 */

import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { repositoryRoot, runPnpm } from "./process.mjs";

const MODE_PORTS = { development: 4_173, production: 4_174 };
const SERVER_READY_TIMEOUT_MS = 180_000;

async function serverReachable(baseUrl) {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverReachable(baseUrl)) {
      return;
    }
    await delay(1_000);
  }
  throw new Error(`The playground did not become reachable at ${baseUrl}.`);
}

export async function startServer(mode, skipBuild) {
  const baseUrl = `http://127.0.0.1:${String(MODE_PORTS[mode])}`;
  if (await serverReachable(baseUrl)) {
    return { baseUrl, server: null };
  }
  if (mode === "production" && !skipBuild) {
    runPnpm(["build"]);
  }
  const args =
    mode === "production" ? ["--filter", "@setta/workspace-playground", "preview"] : ["dev"];
  const server = spawn("corepack", ["pnpm", ...args], {
    cwd: repositoryRoot,
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer(baseUrl);
  return { baseUrl, server };
}

export function stopServer(server) {
  if (server?.pid) {
    process.kill(-server.pid, "SIGTERM");
  }
}
