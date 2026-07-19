import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import {
  createLocalMacOSVoiceHelperFromEnvironment,
  LocalMacOSVoiceHelperCommandError,
  LocalMacOSVoiceHelperProcessClient,
  LocalMacOSVoiceHelperProtocolError,
  LocalMacOSVoiceHelperUnavailableError,
  LocalMacOSVoiceHealthService,
  type LocalMacOSVoiceHelperClient,
  type LocalMacOSVoiceHelperHealthResult,
} from "./local-macos-voice-helper";
import type { LocalMacOSVoiceListenerEngineEvent } from "./local-macos-voice-listener";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "test-fixtures/local-macos-voice-helper-fixture.mjs",
);
const localVoiceID = "com.apple.voice.compact.en-US.Samantha";
const localWAVAudioBase64 = "UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";

describe("LocalMacOSVoiceHealthService", () => {
  test("reports unsupported platforms and missing models without starting the helper", async () => {
    const createClient =
      vi.fn<
        NonNullable<ConstructorParameters<typeof LocalMacOSVoiceHealthService>[0]["createClient"]>
      >();
    const nonMac = new LocalMacOSVoiceHealthService({
      createClient,
      helperPath: "/tmp/setta-local-helper",
      modelPath: "/tmp/setta-model.bin",
      platform: "linux",
    });
    await expect(nonMac.readHealth()).resolves.toEqual({
      helperPath: "/tmp/setta-local-helper",
      message: "Local macOS voice is available only on macOS.",
      provider: "local_macos",
      status: "helper_unavailable",
    });

    const missingModel = new LocalMacOSVoiceHealthService({
      createClient,
      helperPath: "/tmp/setta-local-helper",
      modelPath: "/tmp/setta-missing-model.bin",
      platform: "darwin",
    });
    await expect(missingModel.readHealth()).resolves.toEqual({
      message: "The configured Whisper model file is missing.",
      modelPath: "/tmp/setta-missing-model.bin",
      provider: "local_macos",
      status: "missing_model",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("loads helper and model paths from a local voice resource manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-manifest-"));
    const resourceRoot = join(root, "local-macos-voice");
    const helperPath = join(resourceRoot, "bin", "setta-local-macos-voice-helper");
    const modelPath = join(resourceRoot, "models", "ggml-manifest.bin");
    const modelBytes = "manifest-model-bytes";
    await writeHelperScript(helperPath);
    await mkdir(dirname(modelPath), { recursive: true });
    await writeFile(modelPath, modelBytes);
    await writeFile(
      join(resourceRoot, "manifest.json"),
      JSON.stringify({
        helperPath: "bin/setta-local-macos-voice-helper",
        modelPath: "models/ggml-manifest.bin",
        modelSHA256: sha256(modelBytes),
      }),
    );

    const service = createLocalMacOSVoiceHelperFromEnvironment({}, "darwin", {
      resourceRoots: [resourceRoot],
    });

    await expect(service.readHealth()).resolves.toEqual({
      helperPath,
      modelPath,
      modelSHA256: sha256(modelBytes),
      provider: "local_macos",
      status: "ready",
    });
    service.shutdown();
  });

  test("uses the verified downloaded model when the resource manifest does not define a model", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-default-model-"));
    const resourceRoot = join(root, "local-macos-voice");
    const helperPath = join(resourceRoot, "bin", "setta-local-macos-voice-helper");
    const modelPath = join(root, "downloaded-models", "ggml-base.en.bin");
    const modelBytes = "downloaded-model-bytes";
    await writeHelperScript(helperPath);
    await mkdir(dirname(modelPath), { recursive: true });
    await writeFile(modelPath, modelBytes);
    await writeFile(
      join(resourceRoot, "manifest.json"),
      JSON.stringify({
        helperPath: "bin/setta-local-macos-voice-helper",
      }),
    );

    const service = createLocalMacOSVoiceHelperFromEnvironment({}, "darwin", {
      defaultModel: {
        modelPath,
        modelSHA256: sha256(modelBytes),
      },
      resourceRoots: [resourceRoot],
    });

    await expect(service.readHealth()).resolves.toEqual({
      helperPath,
      modelPath,
      modelSHA256: sha256(modelBytes),
      provider: "local_macos",
      status: "ready",
    });
    service.shutdown();
  });

  test("keeps explicit local voice resource environment paths authoritative over manifest paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-env-"));
    const resourceRoot = join(root, "local-macos-voice");
    const manifestHelperPath = join(resourceRoot, "bin", "manifest-helper");
    const manifestModelPath = join(resourceRoot, "models", "manifest-model.bin");
    const helperPath = join(root, "configured-helper");
    const modelPath = join(root, "configured-model.bin");
    const modelBytes = "configured-model-bytes";
    await writeHelperScript(manifestHelperPath);
    await mkdir(dirname(manifestModelPath), { recursive: true });
    await writeFile(manifestModelPath, "manifest-model-bytes");
    await writeHelperScript(helperPath);
    await writeFile(modelPath, modelBytes);
    await writeFile(
      join(resourceRoot, "manifest.json"),
      JSON.stringify({
        helperPath: "bin/manifest-helper",
        modelPath: "models/manifest-model.bin",
        modelSHA256: sha256("manifest-model-bytes"),
      }),
    );

    const service = createLocalMacOSVoiceHelperFromEnvironment(
      {
        SETTA_LOCAL_MACOS_VOICE_HELPER_PATH: helperPath,
        SETTA_LOCAL_MACOS_VOICE_MODEL_PATH: modelPath,
        SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256: sha256(modelBytes),
      },
      "darwin",
      { resourceRoots: [resourceRoot] },
    );

    await expect(service.readHealth()).resolves.toEqual({
      helperPath,
      modelPath,
      modelSHA256: sha256(modelBytes),
      provider: "local_macos",
      status: "ready",
    });
    service.shutdown();
  });

  test("reports invalid local voice resource manifests as provider health", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-invalid-manifest-"));
    const resourceRoot = join(root, "local-macos-voice");
    await mkdir(resourceRoot, { recursive: true });
    await writeFile(
      join(resourceRoot, "manifest.json"),
      JSON.stringify({ helperPath: "helper", modelSHA256: "not-a-sha" }),
    );

    const service = createLocalMacOSVoiceHelperFromEnvironment({}, "darwin", {
      resourceRoots: [resourceRoot],
    });

    await expect(service.readHealth()).resolves.toMatchObject({
      helperPath: null,
      provider: "local_macos",
      status: "helper_unavailable",
    });
    await expect(service.readHealth()).resolves.toMatchObject({
      message: expect.stringContaining("resource manifest is invalid"),
    });
  });

  test("verifies model hashes before probing the helper", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-health-"));
    const helperPath = join(root, "helper");
    const modelPath = join(root, "ggml-base.en.bin");
    await writeFile(helperPath, "#!/bin/sh\n");
    await chmod(helperPath, 0o755);
    await writeFile(modelPath, "model-bytes");

    const service = new LocalMacOSVoiceHealthService({
      createClient: vi.fn(),
      expectedModelSHA256: "0".repeat(64),
      helperPath,
      modelPath,
      platform: "darwin",
    });

    await expect(service.readHealth()).resolves.toEqual({
      actualSHA256: sha256("model-bytes"),
      expectedSHA256: "0".repeat(64),
      message: "The configured Whisper model hash does not match the expected Setta model.",
      modelPath,
      provider: "local_macos",
      status: "model_hash_mismatch",
    });
  });

  test("returns ready and provider-level helper health states from the persistent helper", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-ready-"));
    const helperPath = join(root, "helper");
    const modelPath = join(root, "ggml-base.en.bin");
    await writeFile(helperPath, "#!/bin/sh\n");
    await chmod(helperPath, 0o755);
    await writeFile(modelPath, "model-bytes");
    const helper = new FakeLocalMacOSVoiceHelperClient({ status: "ready" });
    const service = new LocalMacOSVoiceHealthService({
      createClient: vi.fn(() => helper),
      helperPath,
      modelPath,
      platform: "darwin",
    });

    await expect(service.readHealth()).resolves.toEqual({
      helperPath,
      modelPath,
      modelSHA256: sha256("model-bytes"),
      provider: "local_macos",
      status: "ready",
    });
    helper.healthResult = {
      message: "Microphone access is denied for Setta.",
      status: "microphone_denied",
    };
    await expect(service.readHealth()).resolves.toEqual({
      message: "Microphone access is denied for Setta.",
      provider: "local_macos",
      status: "microphone_denied",
    });
  });

  test("starts capture only after model and helper preflight succeed", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-start-"));
    const helperPath = join(root, "helper");
    const modelPath = join(root, "ggml-base.en.bin");
    await writeFile(helperPath, "#!/bin/sh\n");
    await chmod(helperPath, 0o755);
    await writeFile(modelPath, "model-bytes");
    const helper = new FakeLocalMacOSVoiceHelperClient({ status: "ready" });
    const service = new LocalMacOSVoiceHealthService({
      createClient: vi.fn(() => helper),
      helperPath,
      modelPath,
      platform: "darwin",
    });

    await expect(
      service.startCapture({
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        sessionId: "session_start",
      }),
    ).resolves.toEqual({ sessionId: "session_start" });
    expect(helper.startCapture).toHaveBeenCalledWith({
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
      modelPath,
      sessionId: "session_start",
    });

    const missingModel = new LocalMacOSVoiceHealthService({
      createClient: vi.fn(),
      helperPath,
      modelPath: join(root, "missing.bin"),
      platform: "darwin",
    });
    await expect(
      missingModel.startCapture({
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        sessionId: "session_missing",
      }),
    ).rejects.toBeInstanceOf(LocalMacOSVoiceHelperUnavailableError);
  });

  test("starts listener only after injecting the verified transcription model path", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-listener-start-"));
    const helperPath = join(root, "helper");
    const modelPath = join(root, "ggml-base.en.bin");
    const wakeModelPath = join(root, "hey-setta.onnx");
    await writeFile(helperPath, "#!/bin/sh\n");
    await chmod(helperPath, 0o755);
    await writeFile(modelPath, "model-bytes");
    await writeFile(wakeModelPath, "wake-model-bytes");
    const helper = new FakeLocalMacOSVoiceHelperClient({ status: "ready" });
    const service = new LocalMacOSVoiceHealthService({
      createClient: vi.fn(() => helper),
      helperPath,
      modelPath,
      platform: "darwin",
    });
    const events: LocalMacOSVoiceListenerEngineEvent[] = [];

    await expect(
      service.startListener(
        listenerStartRequest(wakeModelPath, sha256("wake-model-bytes")),
        (event) => events.push(event),
      ),
    ).resolves.toEqual({ status: "started" });
    expect(helper.startListener).toHaveBeenCalledWith(
      {
        ...listenerStartRequest(wakeModelPath, sha256("wake-model-bytes")),
        transcriptionModelPath: modelPath,
      },
      expect.any(Function),
    );
    expect(events).toEqual([{ type: "listener_armed" }]);

    const missingModel = new LocalMacOSVoiceHealthService({
      createClient: vi.fn(),
      helperPath,
      modelPath: join(root, "missing.bin"),
      platform: "darwin",
    });
    await expect(
      missingModel.startListener(
        listenerStartRequest(wakeModelPath, sha256("wake-model-bytes")),
        () => {},
      ),
    ).rejects.toBeInstanceOf(LocalMacOSVoiceHelperUnavailableError);
  });

  test("synthesizes speech through the helper without requiring a Whisper model", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-synthesis-"));
    const helperPath = join(root, "helper");
    await writeFile(helperPath, "#!/bin/sh\n");
    await chmod(helperPath, 0o755);
    const helper = new FakeLocalMacOSVoiceHelperClient({ status: "ready" });
    const service = new LocalMacOSVoiceHealthService({
      createClient: vi.fn(() => helper),
      helperPath,
      platform: "darwin",
    });

    await expect(
      service.synthesizeSpeech({
        operationId: "speech_local",
        rate: 1.2,
        text: "Local helper speech.",
        voiceId: "marin",
      }),
    ).resolves.toEqual({
      audioBase64: localWAVAudioBase64,
      format: "wav",
      mediaType: "audio/wav",
      operationId: "speech_local",
    });
    expect(helper.synthesizeSpeech).toHaveBeenCalledWith({
      operationId: "speech_local",
      rate: 1.2,
      text: "Local helper speech.",
      voiceId: "marin",
    });
  });

  test("lists installed helper voices without requiring a Whisper model", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-catalog-"));
    const helperPath = join(root, "helper");
    await writeFile(helperPath, "#!/bin/sh\n");
    await chmod(helperPath, 0o755);
    const helper = new FakeLocalMacOSVoiceHelperClient({ status: "ready" });
    const service = new LocalMacOSVoiceHealthService({
      createClient: vi.fn(() => helper),
      helperPath,
      platform: "darwin",
    });

    await expect(service.listVoices()).resolves.toEqual({
      provider: "local_macos",
      version: "fixture-local-voices",
      voiceIds: ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"],
    });
    expect(helper.listVoices).toHaveBeenCalledWith();
  });
});

describe("LocalMacOSVoiceHelperProcessClient", () => {
  test("frames capture and synthesis commands through one helper", async () => {
    const client = new LocalMacOSVoiceHelperProcessClient({
      args: [fixturePath],
      command: process.execPath,
    });

    await expect(client.readHealth({ modelPath: "/tmp/ggml-base.en.bin" })).resolves.toEqual({
      status: "ready",
    });
    await expect(client.listVoices()).resolves.toEqual({
      version: "fixture-local-voices",
      voiceIds: ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"],
    });
    await expect(
      client.startCapture({
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        modelPath: "/tmp/ggml-base.en.bin",
        sessionId: "session_one",
      }),
    ).resolves.toEqual({ sessionId: "session_one" });
    await expect(client.finishCapture({ sessionId: "session_one" })).resolves.toEqual({
      sessionId: "session_one",
      transcript: "local transcript for session_one",
    });
    await expect(
      client.startCapture({
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        modelPath: "/tmp/ggml-base.en.bin",
        sessionId: "session_two",
      }),
    ).resolves.toEqual({ sessionId: "session_two" });
    await expect(client.cancelCapture({ sessionId: "session_two" })).resolves.toEqual({
      sessionId: "session_two",
    });
    await expect(
      client.synthesizeSpeech({
        operationId: "speech_one",
        rate: 1.2,
        text: "Local helper speech.",
        voiceId: localVoiceID,
      }),
    ).resolves.toEqual({
      audioBase64: localWAVAudioBase64,
      format: "wav",
      mediaType: "audio/wav",
      operationId: "speech_one",
    });
    await expect(client.cancelSynthesis({ operationId: "speech_one" })).resolves.toEqual({
      operationId: "speech_one",
    });

    client.shutdown();
  });

  test("frames listener lifecycle events and arbitrates the helper microphone owner", async () => {
    const client = new LocalMacOSVoiceHelperProcessClient({
      args: [fixturePath, "scripted_listener"],
      command: process.execPath,
    });
    const events: LocalMacOSVoiceListenerEngineEvent[] = [];

    await expect(
      client.startListener(
        {
          ...listenerStartRequest("/tmp/hey-setta.onnx", "1".repeat(64)),
          transcriptionModelPath: "/tmp/ggml-base.en.bin",
        },
        (event) => events.push(event),
      ),
    ).resolves.toEqual({ status: "started" });
    await waitForEventCount(events, 5);
    expect(events).toEqual([
      { type: "listener_armed" },
      { score: 0.74, timeMs: 960, type: "wake_detected" },
      { timeMs: 1_140, type: "message_speech_started" },
      { timeMs: 2_220, type: "candidate_endpoint_detected" },
      { transcript: "open the release checklist", type: "utterance_finalized" },
    ]);

    await expect(
      client.startCapture({
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        modelPath: "/tmp/ggml-base.en.bin",
        sessionId: "manual_while_listener_armed",
      }),
    ).rejects.toMatchObject({
      code: "microphone_busy",
      name: "LocalMacOSVoiceHelperCommandError",
    });

    await expect(client.pauseListener({ reason: "manual_capture" })).resolves.toEqual({
      status: "paused",
    });
    await expect(
      client.startCapture({
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        modelPath: "/tmp/ggml-base.en.bin",
        sessionId: "manual_after_listener_paused",
      }),
    ).resolves.toEqual({ sessionId: "manual_after_listener_paused" });
    await expect(client.resumeListener({ reason: "manual_capture" })).rejects.toBeInstanceOf(
      LocalMacOSVoiceHelperCommandError,
    );
    await expect(client.pauseListener({ reason: "playback" })).resolves.toEqual({
      status: "paused",
    });
    await expect(
      client.cancelCapture({ sessionId: "manual_after_listener_paused" }),
    ).resolves.toEqual({
      sessionId: "manual_after_listener_paused",
    });
    await expect(client.resumeListener({ reason: "playback" })).resolves.toEqual({
      status: "resumed",
    });
    expect(events).toHaveLength(5);
    await expect(client.resumeListener({ reason: "manual_capture" })).resolves.toEqual({
      status: "resumed",
    });
    await waitForEventCount(events, 6);
    expect(events.at(-1)).toEqual({ type: "listener_armed" });
    await expect(client.stopListener({ reason: "setting_disabled" })).resolves.toEqual({
      status: "stopped",
    });

    client.shutdown();
  });

  test("reports helper exit to the active listener event handler", async () => {
    const client = new LocalMacOSVoiceHelperProcessClient({
      args: [fixturePath, "listener_exit_after_start"],
      command: process.execPath,
    });
    const events: LocalMacOSVoiceListenerEngineEvent[] = [];

    await expect(
      client.startListener(
        {
          ...listenerStartRequest("/tmp/hey-setta.onnx", "1".repeat(64)),
          transcriptionModelPath: "/tmp/ggml-base.en.bin",
        },
        (event) => events.push(event),
      ),
    ).resolves.toEqual({ status: "started" });
    await waitForEventCount(events, 2);

    expect(events).toEqual([
      { type: "listener_armed" },
      {
        message: "Local macOS voice helper exited with exit code 42.",
        type: "engine_failed",
      },
    ]);
    await expect(client.readHealth({ modelPath: "/tmp/ggml-base.en.bin" })).resolves.toEqual({
      status: "ready",
    });

    client.shutdown();
  });

  test("surfaces helper-reported bad model paths without stopping the helper", async () => {
    const client = new LocalMacOSVoiceHelperProcessClient({
      args: [fixturePath],
      command: process.execPath,
    });

    await expect(client.readHealth({ modelPath: "/tmp/missing-model.bin" })).resolves.toEqual({
      message: "model file is missing",
      status: "missing_model",
    });
    await expect(
      client.startCapture({
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        modelPath: "/tmp/missing-model.bin",
        sessionId: "session_missing_model",
      }),
    ).rejects.toMatchObject({
      code: "missing_model",
      message: "model file is missing",
      name: "LocalMacOSVoiceHelperCommandError",
    });
    await expect(client.readHealth({ modelPath: "/tmp/ggml-base.en.bin" })).resolves.toEqual({
      status: "ready",
    });

    client.shutdown();
  });

  test("cancels pending synthesis through helper command framing", async () => {
    const client = new LocalMacOSVoiceHelperProcessClient({
      args: [fixturePath],
      command: process.execPath,
    });

    const synthesis = client.synthesizeSpeech({
      operationId: "speech_cancel",
      rate: 1.2,
      text: "Local helper speech.",
      voiceId: localVoiceID,
    });
    const synthesisFailure = expect(synthesis).rejects.toMatchObject({
      code: "synthesis_failed",
      message: "synthesis was canceled",
      name: "LocalMacOSVoiceHelperCommandError",
    });
    await expect(client.cancelSynthesis({ operationId: "speech_cancel" })).resolves.toEqual({
      operationId: "speech_cancel",
    });
    await synthesisFailure;

    client.shutdown();
  });

  test("rejects malformed synthesis audio before it reaches playback", async () => {
    const client = new LocalMacOSVoiceHelperProcessClient({
      args: [fixturePath],
      command: process.execPath,
    });

    await expect(
      client.synthesizeSpeech({
        operationId: "speech_malformed_audio",
        rate: 1.2,
        text: "Local helper speech.",
        voiceId: localVoiceID,
      }),
    ).rejects.toBeInstanceOf(LocalMacOSVoiceHelperProtocolError);

    client.shutdown();
  });

  test("recovers helper commands after a protocol-invalid response stops the helper", async () => {
    const client = new LocalMacOSVoiceHelperProcessClient({
      args: [fixturePath],
      command: process.execPath,
    });

    await expect(
      client.synthesizeSpeech({
        operationId: "speech_malformed_audio",
        rate: 1.2,
        text: "Local helper speech.",
        voiceId: localVoiceID,
      }),
    ).rejects.toBeInstanceOf(LocalMacOSVoiceHelperProtocolError);
    await expect(client.readHealth({ modelPath: "/tmp/ggml-base.en.bin" })).resolves.toEqual({
      status: "ready",
    });

    client.shutdown();
  });

  test.each([
    "malformed",
    "malformed_result",
    "malformed_voice_catalog",
    "omitted_error",
    "unknown_id",
  ])("rejects %s helper events before accepting local capture results", async (mode) => {
    const client = new LocalMacOSVoiceHelperProcessClient({
      args: [fixturePath, mode],
      command: process.execPath,
    });

    const command =
      mode === "malformed_voice_catalog"
        ? client.listVoices()
        : client.readHealth({ modelPath: "/tmp/ggml-base.en.bin" });
    await expect(command).rejects.toBeInstanceOf(LocalMacOSVoiceHelperProtocolError);
    client.shutdown();
  });
});

class FakeLocalMacOSVoiceHelperClient implements LocalMacOSVoiceHelperClient {
  constructor(public healthResult: LocalMacOSVoiceHelperHealthResult) {}

  readHealth = vi.fn(async () => this.healthResult);
  shutdown = vi.fn();

  cancelCapture(): Promise<never> {
    return Promise.reject(new Error("unexpected cancel"));
  }

  cancelSynthesis = vi.fn<LocalMacOSVoiceHelperClient["cancelSynthesis"]>(async (request) => ({
    operationId: request.operationId,
  }));

  pauseListener = vi.fn<LocalMacOSVoiceHelperClient["pauseListener"]>(async () => ({
    status: "paused",
  }));

  resumeListener = vi.fn<LocalMacOSVoiceHelperClient["resumeListener"]>(async () => ({
    status: "resumed",
  }));

  finishCapture(): Promise<never> {
    return Promise.reject(new Error("unexpected finish"));
  }

  listVoices = vi.fn<LocalMacOSVoiceHelperClient["listVoices"]>(async () => ({
    version: "fixture-local-voices",
    voiceIds: ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"],
  }));

  startCapture = vi.fn<LocalMacOSVoiceHelperClient["startCapture"]>(async (request) => ({
    sessionId: request.sessionId,
  }));

  startListener = vi.fn<LocalMacOSVoiceHelperClient["startListener"]>(async (_request, onEvent) => {
    onEvent({ type: "listener_armed" });
    return { status: "started" };
  });

  stopListener = vi.fn<LocalMacOSVoiceHelperClient["stopListener"]>(async () => ({
    status: "stopped",
  }));

  synthesizeSpeech = vi.fn<LocalMacOSVoiceHelperClient["synthesizeSpeech"]>(async (request) => ({
    audioBase64: localWAVAudioBase64,
    format: "wav",
    mediaType: "audio/wav",
    operationId: request.operationId,
  }));
}

function listenerStartRequest(wakeModelPath: string, wakeModelSHA256: string) {
  return {
    audioCopiedBeforeWakeMs: 400,
    hardTrailingSilenceLimitMs: 2_200,
    maximumUtteranceMs: 45_000,
    noMessageTimeoutMs: 4_000,
    preWakeRingBufferMs: 1_000,
    rearmCooldownMs: 300,
    runtime: "onnx" as const,
    speechStartDebounceMs: 160,
    threshold: 0.6,
    trailingAudioPaddingMs: 400,
    vadFrameMs: 20,
    wakeFrameMs: 80,
    wakeModelPath,
    wakeModelSHA256,
  };
}

async function waitForEventCount(
  events: LocalMacOSVoiceListenerEngineEvent[],
  count: number,
): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (events.length < count) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${count} listener events, received ${events.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function writeHelperScript(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(fixturePath)}\n`,
  );
  await chmod(path, 0o755);
}
