import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import {
  createLocalMacOSVoiceModelDownloadService,
  localMacOSVoiceModelPath,
  localMacOSVoiceModelDownloadSpecFromEnvironment,
  type LocalMacOSVoiceModelDownloadSpec,
} from "./local-macos-voice-model-download";

describe("LocalMacOSVoiceModelDownloadService", () => {
  test("downloads the default model to app storage only after SHA-256 verification", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-model-download-"));
    const modelBytes = Buffer.from("verified local model bytes", "utf8");
    const model = modelSpec(modelBytes);
    const statuses: unknown[] = [];
    const fetchImpl = vi.fn(async () => modelResponse(modelBytes));
    const service = createLocalMacOSVoiceModelDownloadService({
      fetchImpl,
      model,
      onStatusChanged: (status) => statuses.push(status),
      platform: "darwin",
      userDataDir: root,
    });

    await expect(service.readStatus()).resolves.toMatchObject({
      modelPath: localMacOSVoiceModelPath(root, model),
      status: "idle",
    });
    await expect(service.startDownload()).resolves.toMatchObject({
      bytesDownloaded: 0,
      status: "downloading",
    });
    await expect(waitForStatus(service, "ready")).resolves.toMatchObject({
      modelSHA256: model.sha256,
      status: "ready",
    });

    await expect(readFile(localMacOSVoiceModelPath(root, model))).resolves.toEqual(modelBytes);
    expect(fetchImpl).toHaveBeenCalledWith(model.url, { signal: expect.any(AbortSignal) });
    expect(statuses.map((status) => (status as { status: string }).status)).toContain(
      "downloading",
    );
    expect(statuses.at(-1)).toMatchObject({ status: "ready" });
    service.shutdown();
  });

  test("uses an existing verified model without downloading", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-model-existing-"));
    const modelBytes = Buffer.from("existing verified local model bytes", "utf8");
    const model = modelSpec(modelBytes);
    const path = localMacOSVoiceModelPath(root, model);
    await mkdir(join(root, "local-macos-voice", "models"), { recursive: true });
    await writeFile(path, modelBytes);
    const fetchImpl = vi.fn();
    const service = createLocalMacOSVoiceModelDownloadService({
      fetchImpl,
      model,
      platform: "darwin",
      userDataDir: root,
    });

    await expect(service.readStatus()).resolves.toMatchObject({
      modelPath: path,
      status: "ready",
    });
    await expect(service.startDownload()).resolves.toMatchObject({ status: "ready" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects a downloaded model with the wrong hash and keeps the target path empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-model-bad-hash-"));
    const expectedBytes = Buffer.from("expected local model bytes", "utf8");
    const actualBytes = Buffer.from("tampered local model bytes", "utf8");
    const model = modelSpec(expectedBytes, actualBytes.length);
    const service = createLocalMacOSVoiceModelDownloadService({
      fetchImpl: vi.fn(async () => modelResponse(actualBytes)),
      model,
      platform: "darwin",
      userDataDir: root,
    });

    await service.startDownload();
    await expect(waitForStatus(service, "failed")).resolves.toMatchObject({
      message: "The local voice model download did not match Setta's expected hash.",
      status: "failed",
    });
    await expect(stat(localMacOSVoiceModelPath(root, model))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("reports model downloads unavailable off macOS", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-model-linux-"));
    const service = createLocalMacOSVoiceModelDownloadService({
      fetchImpl: vi.fn(),
      platform: "linux",
      userDataDir: root,
    });

    await expect(service.readStatus()).resolves.toMatchObject({
      provider: "local_macos",
      status: "unavailable",
    });
    await expect(service.startDownload()).resolves.toMatchObject({
      provider: "local_macos",
      status: "unavailable",
    });
  });

  test("accepts an E2E model download spec only during E2E runs", () => {
    const modelBytes = Buffer.from("e2e local model bytes", "utf8");
    const model = modelSpec(modelBytes);
    const raw = JSON.stringify(model);

    expect(
      localMacOSVoiceModelDownloadSpecFromEnvironment({
        SETTA_E2E: "1",
        SETTA_E2E_LOCAL_MACOS_VOICE_MODEL_DOWNLOAD_SPEC: raw,
      }),
    ).toEqual(model);
    expect(
      localMacOSVoiceModelDownloadSpecFromEnvironment({
        SETTA_E2E_LOCAL_MACOS_VOICE_MODEL_DOWNLOAD_SPEC: raw,
      }),
    ).toBeUndefined();
  });

  test("rejects invalid E2E model download specs", () => {
    const modelBytes = Buffer.from("e2e invalid local model bytes", "utf8");
    const model = modelSpec(modelBytes);

    expect(() =>
      localMacOSVoiceModelDownloadSpecFromEnvironment({
        SETTA_E2E: "1",
        SETTA_E2E_LOCAL_MACOS_VOICE_MODEL_DOWNLOAD_SPEC: JSON.stringify({
          ...model,
          filename: "../ggml-test-model.bin",
        }),
      }),
    ).toThrow("filename must be a filename");
  });
});

async function waitForStatus(
  service: ReturnType<typeof createLocalMacOSVoiceModelDownloadService>,
  status: "failed" | "ready",
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await service.readStatus();
    if (current.status === status) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for local model download status ${status}`);
}

function modelSpec(
  bytes: Buffer,
  expectedSize: number = bytes.length,
): LocalMacOSVoiceModelDownloadSpec {
  return {
    bytes: expectedSize,
    filename: "ggml-test-model.bin",
    name: "test-model",
    sha256: sha256(bytes),
    url: "https://example.test/ggml-test-model.bin",
  };
}

function modelResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-length": String(bytes.length),
    },
    status: 200,
  });
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
