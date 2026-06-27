import { spawn } from "node:child_process";
import process from "node:process";
import readline from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const accountReadTimeoutMs = 20_000;
const runtimeCommandTimeoutMs = 10_000;
const stderrLimitBytes = 16 * 1024;
const apiKeyEnvNames = ["OPENAI_API_KEY"];
const chatGPTAccountTypes = new Set(["chatgpt", "chatgptAuthTokens"]);
const managedRuntimeOverrideEnv = "SETTA_CODEX_BIN";
const requiredSessionSource = "app-server";

export async function prepareLiveCodexAuth() {
  const status = await liveCodexSubscriptionStatus();
  if (!status.available) {
    return status;
  }
  return {
    available: true,
    env: {},
    unsetEnv: apiKeyEnvNames,
  };
}

export async function liveCodexSubscriptionStatus() {
  let accountState;
  try {
    accountState = await readCodexAccount();
  } catch (error) {
    return {
      available: false,
      reason: codexAccountReadFailureReason(error),
    };
  }

  const account = accountState?.account;
  if (account === null || account === undefined) {
    return {
      available: false,
      reason: "Codex ChatGPT auth is not signed in",
    };
  }
  if (typeof account !== "object") {
    throw new Error("account/read returned a non-object account");
  }
  if (chatGPTAccountTypes.has(account.type)) {
    return { available: true };
  }
  if (account.type === "apiKey") {
    return {
      available: false,
      reason: "Codex is signed in with API-key auth; ChatGPT auth is required",
    };
  }
  return {
    available: false,
    reason: `Codex account type ${String(account.type)} is not supported for live tests`,
  };
}

async function readCodexAccount() {
  const invocation = await resolveManagedCodexAppServerInvocation();
  const client = startCodexAppServer(invocation);
  try {
    await client.call("initialize", {
      clientInfo: {
        name: "setta-live-test",
        title: "Setta Live Test",
        version: "dev",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    await client.notify("initialized", {});
    return await client.call("account/read", { refreshToken: false });
  } finally {
    await client.close();
  }
}

async function resolveManagedCodexAppServerInvocation() {
  const command = process.env[managedRuntimeOverrideEnv]?.trim();
  if (!command) {
    throw new Error(
      `managed Codex runtime is not selected; set ${managedRuntimeOverrideEnv} to the reference-compatible codex-app-server runtime`,
    );
  }

  const directHelp = await runRuntimeCommand(command, ["--help"]);
  if (directHelp.ok && directHelp.output.includes("--listen")) {
    return appServerInvocation(command, [], directHelp.output);
  }

  const subcommandHelp = await runRuntimeCommand(command, ["app-server", "--help"]);
  if (subcommandHelp.ok && subcommandHelp.output.includes("--listen")) {
    return appServerInvocation(command, ["app-server"], subcommandHelp.output);
  }

  throw new Error(
    `${managedRuntimeOverrideEnv} runtime does not expose an app-server --listen interface`,
  );
}

function appServerInvocation(command, prefixArgs, helpOutput) {
  if (!helpOutput.includes("--session-source")) {
    throw new Error(
      `${managedRuntimeOverrideEnv} runtime app-server entrypoint does not support --session-source ${requiredSessionSource}`,
    );
  }
  return {
    args: [...prefixArgs, "--listen", "stdio://", "--session-source", requiredSessionSource],
    command,
  };
}

function startCodexAppServer(invocation) {
  const child = spawn(invocation.command, invocation.args, {
    env: codexAuthEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  const stdout = readline.createInterface({ input: child.stdout });
  let nextId = 1;
  let stderr = "";
  let exited = false;

  child.stderr.on("data", (data) => {
    stderr = boundedAppend(stderr, data.toString(), stderrLimitBytes);
  });
  child.on("error", (error) => {
    rejectPending(new Error(`start codex app-server: ${error.message}`));
  });
  child.on("exit", (code, signal) => {
    exited = true;
    rejectPending(new Error(codexExitMessage(code, signal, stderr)));
  });
  stdout.on("line", (line) => {
    if (line.trim() === "") {
      return;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      rejectPending(new Error(`decode codex app-server message: ${error.message}`));
      return;
    }
    if (message.id === undefined || !pending.has(message.id)) {
      return;
    }
    const call = pending.get(message.id);
    pending.delete(message.id);
    globalThis.clearTimeout(call.timer);
    if (message.error) {
      call.reject(new Error(`${call.method} failed: ${message.error.message}`));
      return;
    }
    call.resolve(message.result);
  });

  return {
    call(method, params) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => {
          pending.delete(id);
          child.kill();
          reject(new Error(`timed out waiting for ${method}`));
        }, accountReadTimeoutMs);
        pending.set(id, { method, reject, resolve, timer });
        writeMessage({ id, jsonrpc: "2.0", method, params }).catch((error) => {
          pending.delete(id);
          globalThis.clearTimeout(timer);
          reject(error);
        });
      });
    },
    notify(method, params) {
      return writeMessage({ jsonrpc: "2.0", method, params });
    },
    async close() {
      stdout.close();
      if (exited) {
        return;
      }
      if (!child.stdin.destroyed) {
        child.stdin.end();
      }
      await Promise.race([onceExit(child), delay(1_000)]);
      if (!exited) {
        child.kill();
        await Promise.race([onceExit(child), delay(1_000)]);
      }
    },
  };

  function writeMessage(message) {
    return new Promise((resolve, reject) => {
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  function rejectPending(error) {
    for (const call of pending.values()) {
      globalThis.clearTimeout(call.timer);
      call.reject(error);
    }
    pending.clear();
  }
}

function runRuntimeCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: codexAuthEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      resolve({ ok: false, output });
    }, runtimeCommandTimeoutMs);
    const appendOutput = (data) => {
      output = boundedAppend(output, data.toString(), stderrLimitBytes);
    };
    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);
    child.on("error", () => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      resolve({ ok: false, output });
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      resolve({ ok: code === 0, output });
    });
  });
}

function codexAuthEnv() {
  const env = { ...process.env };
  for (const name of apiKeyEnvNames) {
    delete env[name];
  }
  return env;
}

function codexAccountReadFailureReason(error) {
  return `Codex ChatGPT auth is unavailable: ${error.message}`;
}

function codexExitMessage(code, signal, stderr) {
  const status = signal ? `signal ${signal}` : `exit ${code}`;
  const diagnostic = stderr.trim();
  if (diagnostic === "") {
    return `codex app-server exited before account check (${status})`;
  }
  return `codex app-server exited before account check (${status}): ${diagnostic}`;
}

function boundedAppend(current, addition, limit) {
  const combined = current + addition;
  if (combined.length <= limit) {
    return combined;
  }
  return combined.slice(combined.length - limit);
}

function onceExit(child) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once("exit", resolve);
  });
}

async function main() {
  const status = await liveCodexSubscriptionStatus();
  if (status.available) {
    process.stdout.write("Codex ChatGPT auth is available\n");
    return;
  }
  process.stdout.write(`${status.reason}\n`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
