import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createSecureServer } from "node:http2";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const workflowTimeoutMs = 45_000;

export async function startSpeechPWARuntimeFixture({ appDataDir, provider }) {
  const child = spawn(
    join(repoRoot, "scripts/go.sh"),
    ["run", "./cmd/setta", "serve", "--app-data-dir", appDataDir, "--port", "0"],
    {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        OPENAI_API_KEY: provider.apiKey,
        SETTA_E2E: "1",
        SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
        SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.logs = [];
  child.stdout.on("data", (data) => appendLog(child, data));
  child.stderr.on("data", (data) => appendLog(child, data));
  const initialPairingURL = await waitForPairingURL(child);
  const parsed = parsePairingURL(initialPairingURL);
  const secureProxy = await startSecureProxy(parsed.baseURL);
  const runtimePort = new URL(parsed.baseURL).port;
  return {
    appDataDir,
    child,
    httpOrigin: `http://setta-insecure.test:${runtimePort}/`,
    httpsOrigin: `https://setta-secure.test:${secureProxy.port}/`,
    initialPairingURL,
    mintPairingURL: () => mintPairingURL(appDataDir),
    parsed,
    secureProxy,
  };
}

export async function stopSpeechPWARuntimeFixture(fixture) {
  if (!fixture) {
    return;
  }
  await closeServer(fixture.secureProxy.server);
  await stopProcess(fixture.child);
}

function parsePairingURL(pairingURL) {
  const parsed = new URL(pairingURL);
  const baseURL = parsed.searchParams.get("url");
  const pairingToken = parsed.searchParams.get("tok");
  const runtimeId = parsed.searchParams.get("rt");
  if (!baseURL || !pairingToken || !runtimeId) {
    throw new Error(`runtime returned an invalid pairing URL: ${pairingURL}`);
  }
  return { baseURL: new URL(baseURL).toString(), pairingToken, runtimeId };
}

async function mintPairingURL(appDataDir) {
  const result = await runSettaCommand(["pair", "--app-data-dir", appDataDir]);
  const match = result.stdout.match(/setta:\/\/pair\?[^\s]+/);
  if (!match) {
    throw new Error(`pairing URL was not printed:\n${result.stdout}\n${result.stderr}`);
  }
  return match[0];
}

async function runSettaCommand(args) {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.SETTA_E2E_OPENAI_SPEECH_BASE_URL;
  const child = spawn(join(repoRoot, "scripts/go.sh"), ["run", "./cmd/setta", ...args], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  const code = await new Promise((resolvePromise) => child.once("exit", resolvePromise));
  if (code !== 0) {
    throw new Error(`setta ${args.join(" ")} failed with ${code}\n${stdout}\n${stderr}`);
  }
  return { stderr, stdout };
}

async function waitForPairingURL(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const output = child.logs.join("");
    const match = output.match(/setta:\/\/pair\?[^\s]+/);
    if (match) {
      return match[0];
    }
    if (child.exitCode !== null) {
      throw new Error(`remote setta serve exited before pairing URL:\n${output}`);
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for remote pairing URL:\n${child.logs.join("")}`);
}

async function startSecureProxy(runtimeBaseURL) {
  const [cert, key] = await Promise.all([
    readFile(join(scriptDir, "fixtures/setta-secure-test-cert.pem")),
    readFile(join(scriptDir, "fixtures/setta-secure-test-key.pem")),
  ]);
  const failures = [];
  const server = createSecureServer({ allowHTTP1: true, cert, key }, (request, response) => {
    const upstreamURL = new URL(request.url ?? "/", runtimeBaseURL);
    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(([name]) => !name.startsWith(":")),
    );
    headers.host = upstreamURL.host;
    const upstream = httpRequest(
      upstreamURL,
      { headers, method: request.method },
      (upstreamResponse) => {
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          browserResponseHeaders(upstreamResponse.headers),
        );
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", (error) => {
      failures.push(error);
      if (!response.headersSent) {
        response.writeHead(502, { "Content-Type": "text/plain" });
      }
      response.end("secure runtime proxy failed");
    });
    request.pipe(upstream);
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("secure runtime proxy did not bind a TCP port");
  }
  return {
    assertHealthy() {
      if (failures.length > 0) {
        throw new Error(`secure runtime proxy failed: ${failures[0]?.message ?? "unknown error"}`);
      }
    },
    port: address.port,
    server,
  };
}

function browserResponseHeaders(headers) {
  const connectionHeaders = new Set([
    "connection",
    "keep-alive",
    "proxy-connection",
    "transfer-encoding",
    "upgrade",
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) => value !== undefined && !connectionHeaders.has(name),
    ),
  );
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  await new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
    server.closeAllConnections?.();
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolvePromise) => child.once("close", resolvePromise));
  signalProcessGroup(child, "SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), delay(8_000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    signalProcessGroup(child, "SIGKILL");
    await Promise.race([exited, delay(3_000)]);
  }
}

function signalProcessGroup(child, signal) {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

function appendLog(child, data) {
  child.logs.push(data.toString());
  if (child.logs.length > 500) {
    child.logs.shift();
  }
}
