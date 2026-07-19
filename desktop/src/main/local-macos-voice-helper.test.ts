import { createHash } from "node:crypto";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import {
  LocalMacOSVoiceHelperProcessClient,
  LocalMacOSVoiceHelperProtocolError,
  LocalMacOSVoiceHelperUnavailableError,
  LocalMacOSVoiceHealthService,
  type LocalMacOSVoiceHelperClient,
  type LocalMacOSVoiceHelperHealthResult,
} from "./local-macos-voice-helper";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "test-fixtures/local-macos-voice-helper-fixture.mjs",
);

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
      audioBase64: "bG9jYWwtYXVkaW8=",
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
        voiceId: "marin",
      }),
    ).resolves.toEqual({
      audioBase64: "bG9jYWwgc3BlZWNoIGZvciBzcGVlY2hfb25l",
      format: "wav",
      mediaType: "audio/wav",
      operationId: "speech_one",
    });
    await expect(client.cancelSynthesis({ operationId: "speech_one" })).resolves.toEqual({
      operationId: "speech_one",
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
      voiceId: "marin",
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

  synthesizeSpeech = vi.fn<LocalMacOSVoiceHelperClient["synthesizeSpeech"]>(async (request) => ({
    audioBase64: "bG9jYWwtYXVkaW8=",
    format: "wav",
    mediaType: "audio/wav",
    operationId: request.operationId,
  }));
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
