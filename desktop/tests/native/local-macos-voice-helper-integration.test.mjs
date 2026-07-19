#!/usr/bin/env node

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const commandTimeoutMs = 5_000;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const helperPath = join(
  repoRoot,
  "desktop/out/local-macos-voice/bin/setta-local-macos-voice-helper",
);

if (process.platform !== "darwin") {
  console.log("Local macOS voice helper integration skipped: provider is macOS-only");
  process.exit(0);
}

await access(helperPath, constants.X_OK);

async function runIntegration() {
  const tempRoot = await mkdtemp(join(tmpdir(), "setta-native-local-voice-"));
  const fakeWhisperPath = join(tempRoot, "whisper-cli");
  const modelPath = join(tempRoot, "ggml-base.en.bin");
  const missingModelPath = join(tempRoot, "missing-model.bin");
  const client = new HelperClient(helperPath, {
    ...process.env,
    SETTA_LOCAL_MACOS_VOICE_WHISPER_CLI_PATH: fakeWhisperPath,
  });

  try {
    await writeFakeWhisper(fakeWhisperPath);
    await writeFile(modelPath, "native-local-model-bytes");

    client.writeLine("{ malformed json");

    assertValidModelHealth(await client.command("read_health", { modelPath }, "health_valid"));
    assertOkResult(await client.command("read_health", { modelPath: missingModelPath }), {
      message: "Whisper model file is missing.",
      status: "missing_model",
    });
    assertErrorCode(
      await client.command("start_capture", {
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8_000,
        modelPath: missingModelPath,
        sessionId: "native_missing_model",
      }),
      "missing_model",
    );
    assertErrorCode(
      await client.command("finish_capture", { sessionId: "native_missing_model" }),
      "invalid_session",
    );
    assertErrorCode(
      await client.command("cancel_capture", { sessionId: "native_missing_model" }),
      "invalid_session",
    );
    assertErrorCode(await client.command("unsupported_native_command", {}), "unsupported_command");
  } finally {
    await client.close();
    await rm(tempRoot, { force: true, recursive: true });
  }

  console.log("Local macOS voice helper integration passed");
}

async function writeFakeWhisper(path) {
  await writeFile(path, "#!/bin/sh\nprintf 'native helper transcript\\n'\n");
  await chmod(path, 0o755);
}

function assertOkResult(response, expected) {
  assert.equal(response.type, "response");
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, expected);
}

function assertValidModelHealth(response) {
  assert.equal(response.type, "response");
  assert.equal(response.ok, true);
  assert.ok(response.result?.status === "ready" || response.result?.status === "microphone_denied");
  if (response.result.status === "microphone_denied") {
    assert.equal(response.result.message, "Microphone access is denied for Setta.");
  }
}

function assertErrorCode(response, code) {
  assert.equal(response.type, "response");
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, code);
  assert.equal(typeof response.error?.message, "string");
  assert.notEqual(response.error.message, "");
}

class HelperClient {
  #buffer = "";
  #child;
  #closed = false;
  #pending = new Map();
  #sequence = 0;
  #stderr = "";

  constructor(command, env) {
    this.#child = spawn(command, [], { env, stdio: "pipe" });
    this.#child.stdout.setEncoding("utf8");
    this.#child.stdout.on("data", (chunk) => this.#receive(chunk));
    this.#child.stderr.setEncoding("utf8");
    this.#child.stderr.on("data", (chunk) => {
      this.#stderr += chunk;
    });
    this.#child.once("error", (error) => this.#failPending(error));
    this.#child.once("exit", (code, signal) => {
      const detail = signal === null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      this.#failPending(new Error(`helper exited with ${detail}: ${this.#stderr}`));
    });
    this.#child.once("close", () => {
      this.#closed = true;
    });
  }

  command(type, payload, requestedId) {
    const id = requestedId ?? `native-helper-${++this.#sequence}`;
    const envelope = JSON.stringify({ id, payload, type });
    return this.#waitForResponse(id, () => this.writeLine(envelope));
  }

  writeLine(line) {
    this.#child.stdin.write(`${line}\n`, "utf8");
  }

  close() {
    if (this.#closed) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#child.once("close", () => resolve());
      this.#child.kill();
    });
  }

  #waitForResponse(id, write) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`timed out waiting for helper response ${id}: ${this.#stderr}`));
      }, commandTimeoutMs);
      this.#pending.set(id, {
        reject,
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });
      write();
    });
  }

  #receive(chunk) {
    this.#buffer += chunk;
    for (;;) {
      const newlineIndex = this.#buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }
      const line = this.#buffer.slice(0, newlineIndex);
      this.#buffer = this.#buffer.slice(newlineIndex + 1);
      if (line.trim() !== "") {
        this.#receiveLine(line);
      }
    }
  }

  #receiveLine(line) {
    const response = JSON.parse(line);
    const pending = this.#pending.get(response.id);
    if (!pending) {
      this.#failPending(new Error(`helper returned unexpected response ${response.id}`));
      return;
    }
    this.#pending.delete(response.id);
    pending.resolve(response);
  }

  #failPending(error) {
    const pending = [...this.#pending.values()];
    this.#pending.clear();
    for (const command of pending) {
      command.reject(error);
    }
  }
}

await runIntegration();
