#!/usr/bin/env node

import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
const whisperCLIPath = join(dirname(helperPath), "whisper-cli");
const whisperFrameworkPath = join(
  dirname(dirname(helperPath)),
  "Frameworks/whisper.framework/Versions/A/whisper",
);

if (process.platform !== "darwin") {
  console.log("Local macOS voice helper integration skipped: provider is macOS-only");
  process.exit(0);
}

await access(helperPath, constants.X_OK);
await access(whisperCLIPath, constants.X_OK);
await access(whisperFrameworkPath, constants.R_OK);

async function runIntegration() {
  const tempRoot = await mkdtemp(join(tmpdir(), "setta-native-local-voice-"));
  const fakeWhisperPath = join(tempRoot, "whisper-cli");
  const modelPath = join(tempRoot, "ggml-base.en.bin");
  const missingModelPath = join(tempRoot, "missing-model.bin");
  const wakeModelPath = join(tempRoot, "hey-setta.onnx");
  const wakeModelBytes = "native-local-wake-model-bytes";
  const client = new HelperClient(helperPath, {
    ...process.env,
    SETTA_LOCAL_MACOS_VOICE_SCRIPTED_PCM_FIXTURES: "1",
    SETTA_LOCAL_MACOS_VOICE_WHISPER_CLI_PATH: fakeWhisperPath,
  });

  try {
    await writeFakeWhisper(fakeWhisperPath);
    await writeFile(modelPath, "native-local-model-bytes");
    await writeFile(wakeModelPath, wakeModelBytes);
    await assertPackagedWhisperHealth(modelPath);

    client.writeLine("{ malformed json");

    const catalog = await client.command("list_voices", {}, "voices");
    assertValidVoiceCatalog(catalog);
    assertValidSynthesis(
      await client.command("synthesize_speech", {
        operationId: "native_synthesis",
        rate: 1,
        text: "Done.",
        voiceId: selectSynthesisVoiceId(catalog.result.voiceIds),
      }),
    );

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
    assertErrorCode(
      await client.command("start_listener", listenerStartPayload(modelPath, missingModelPath)),
      "missing_model",
    );
    assertOkResult(
      await client.command(
        "start_listener",
        listenerStartPayload(modelPath, wakeModelPath, sha256(wakeModelBytes)),
        "native_listener_start",
      ),
      { status: "started" },
    );
    assert.deepEqual(client.listenerEvents(), [{ type: "listener_armed" }]);
    await assertFailedResumeKeepsListenerPaused(client, modelPath);
    await assertScriptedPCMListenerCapture(client);
    assertOkResult(await client.command("stop_listener", { reason: "setting_disabled" }), {
      status: "stopped",
    });
    assertErrorCode(
      await client.command("start_capture", { sessionId: "native_malformed_command" }),
      "malformed_command",
    );
    assertErrorCode(await client.command("unsupported_native_command", {}), "unsupported_command");
  } finally {
    await client.close();
    await rm(tempRoot, { force: true, recursive: true });
  }

  console.log("Local macOS voice helper integration passed");
}

async function assertPackagedWhisperHealth(modelPath) {
  const packagedClient = new HelperClient(helperPath, process.env);
  try {
    assertValidModelHealth(await packagedClient.command("read_health", { modelPath }));
  } finally {
    await packagedClient.close();
  }
}

async function writeFakeWhisper(path) {
  await writeFile(
    path,
    `#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const args = process.argv.slice(2);
const audioIndex = args.indexOf("-f");
if (audioIndex < 0 || audioIndex + 1 >= args.length) {
  process.stderr.write("missing audio path\\n");
  process.exit(2);
}
const audio = readFileSync(args[audioIndex + 1]);
if (audio.subarray(0, 4).toString("ascii") !== "RIFF" || audio.subarray(8, 12).toString("ascii") !== "WAVE") {
  process.stderr.write("invalid wav\\n");
  process.exit(2);
}
const dataBytes = audio.readUInt32LE(40);
const sampleCount = dataBytes / 2;
const first = audio.readInt16LE(44);
const last = audio.readInt16LE(44 + dataBytes - 2);
process.stdout.write(\`scripted pcm sampleCount=\${sampleCount} first=\${first} last=\${last}\\n\`);
`,
  );
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

function assertValidVoiceCatalog(response) {
  assert.equal(response.type, "response");
  assert.equal(response.ok, true);
  assert.equal(typeof response.result?.version, "string");
  assert.ok(response.result.version.startsWith("apple-system-voices-"));
  assert.ok(Array.isArray(response.result.voiceIds));
  assert.ok(response.result.voiceIds.length > 0);
}

function selectSynthesisVoiceId(voiceIds) {
  return (
    voiceIds.find((voiceId) => voiceId.includes(".en-US.")) ??
    voiceIds.find((voiceId) => voiceId.includes(".en-")) ??
    voiceIds[0]
  );
}

function assertValidSynthesis(response) {
  assert.equal(response.type, "response");
  assert.equal(response.ok, true);
  assert.equal(response.result?.format, "wav");
  assert.equal(response.result?.mediaType, "audio/wav");
  assert.equal(response.result?.operationId, "native_synthesis");
  const audio = Buffer.from(response.result.audioBase64, "base64");
  assert.ok(audio.length > 44);
  assert.equal(audio.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(audio.subarray(8, 12).toString("ascii"), "WAVE");
}

function assertErrorCode(response, code) {
  assert.equal(response.type, "response");
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, code);
  assert.equal(typeof response.error?.message, "string");
  assert.notEqual(response.error.message, "");
}

async function assertScriptedPCMListenerCapture(client) {
  const armedEvents = [{ type: "listener_armed" }, { type: "listener_armed" }];
  assertOkResult(
    await client.command("ingest_listener_pcm", pcmPayload(150, 100), "native_pcm_prewake_a"),
    { sampleCount: 2_400, status: "accepted" },
  );
  assertOkResult(
    await client.command("ingest_listener_pcm", pcmPayload(100, 200), "native_pcm_prewake_b"),
    { sampleCount: 1_600, status: "accepted" },
  );
  assert.deepEqual(client.listenerEvents(), armedEvents);

  assertOkResult(
    await client.command(
      "ingest_listener_pcm",
      pcmPayload(80, 300, { wakeScore: 0.7 }),
      "native_pcm_wake",
    ),
    { sampleCount: 1_280, status: "accepted" },
  );
  assertOkResult(
    await client.command(
      "ingest_listener_pcm",
      pcmPayload(40, 400, { vadVoice: true }),
      "native_pcm_speech_start",
    ),
    { sampleCount: 640, status: "accepted" },
  );
  assertOkResult(
    await client.command(
      "ingest_listener_pcm",
      pcmPayload(80, 500, { vadVoice: true }),
      "native_pcm_speech_continue",
    ),
    { sampleCount: 1_280, status: "accepted" },
  );
  assertOkResult(
    await client.command(
      "ingest_listener_pcm",
      pcmPayload(80, 600, { endOfInput: true }),
      "native_pcm_endpoint",
    ),
    { sampleCount: 1_280, status: "accepted" },
  );

  assert.deepEqual(client.listenerEvents(), [
    ...armedEvents,
    { score: 0.7, timeMs: 330, type: "wake_detected" },
    { timeMs: 370, type: "message_speech_started" },
    { timeMs: 530, type: "candidate_endpoint_detected" },
    {
      transcript: "scripted pcm sampleCount=6080 first=200 last=600",
      type: "utterance_finalized",
    },
  ]);
}

async function assertFailedResumeKeepsListenerPaused(client, modelPath) {
  assertOkResult(await client.command("pause_listener", { reason: "manual_capture" }), {
    status: "paused",
  });
  assertOkResult(
    await client.command("start_capture", {
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8_000,
      modelPath,
      sessionId: "native_manual_while_listener_paused",
    }),
    { sessionId: "native_manual_while_listener_paused" },
  );
  assertErrorCode(
    await client.command("resume_listener", { reason: "manual_capture" }),
    "microphone_busy",
  );
  assertErrorCode(
    await client.command(
      "ingest_listener_pcm",
      pcmPayload(20, 150, { wakeScore: 0.7 }),
      "native_pcm_rejected_while_manual_capture_active",
    ),
    "invalid_listener",
  );
  assertOkResult(
    await client.command("cancel_capture", {
      sessionId: "native_manual_while_listener_paused",
    }),
    { sessionId: "native_manual_while_listener_paused" },
  );
  assertOkResult(await client.command("resume_listener", { reason: "manual_capture" }), {
    status: "resumed",
  });
  assert.deepEqual(client.listenerEvents(), [
    { type: "listener_armed" },
    { type: "listener_armed" },
  ]);
}

function listenerStartPayload(
  transcriptionModelPath,
  wakeModelPath,
  wakeModelSHA256 = "0".repeat(64),
) {
  return {
    audioCopiedBeforeWakeMs: 100,
    hardTrailingSilenceLimitMs: 80,
    maximumUtteranceMs: 5_000,
    noMessageTimeoutMs: 1_000,
    preWakeRingBufferMs: 200,
    rearmCooldownMs: 300,
    runtime: "onnx",
    speechStartDebounceMs: 40,
    threshold: 0.6,
    trailingAudioPaddingMs: 40,
    transcriptionModelPath,
    vadFrameMs: 20,
    wakeFrameMs: 80,
    wakeModelPath,
    wakeModelSHA256,
  };
}

function pcmPayload(durationMs, value, options = {}) {
  const sampleCount = durationMs * 16;
  const samples = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    samples.writeInt16LE(value, index * 2);
  }
  const payload = {
    endOfInput: options.endOfInput ?? false,
    sampleRate: 16_000,
    samplesBase64: samples.toString("base64"),
    vadVoice: options.vadVoice ?? false,
  };
  if (options.wakeScore !== undefined) {
    payload.wakeScore = options.wakeScore;
  }
  return payload;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

class HelperClient {
  #buffer = "";
  #child;
  #closed = false;
  #events = [];
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

  listenerEvents() {
    return [...this.#events];
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
    if (response.type === "listener_event") {
      this.#events.push(response.event);
      return;
    }
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
