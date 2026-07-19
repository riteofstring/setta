import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import { resolveLocalMacOSVoiceHelperConfiguration } from "./local-macos-voice-resources";

describe("local macOS voice resources", () => {
  test("resolves packaged wake model resources from the app resource manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-resources-"));
    try {
      const resourceRoot = join(root, "local-macos-voice");
      const wakeModelPath = join(resourceRoot, "models", "hey-setta.onnx");
      const wakeModelBytes = "wake-model-bytes";
      await writeFileRecursive(wakeModelPath, wakeModelBytes);
      await writeFileRecursive(
        join(resourceRoot, "manifest.json"),
        JSON.stringify({
          helperPath: "bin/setta-local-macos-voice-helper",
          wakeModelPath: "models/hey-setta.onnx",
          wakeModelSHA256: sha256(wakeModelBytes),
          wakeRuntime: "onnx",
        }),
      );

      const configuration = resolveLocalMacOSVoiceHelperConfiguration({}, [resourceRoot]);

      expect(configuration).toMatchObject({
        helperPath: join(resourceRoot, "bin", "setta-local-macos-voice-helper"),
        wakeModelPath,
        wakeModelSHA256: sha256(wakeModelBytes),
        wakeRuntime: "onnx",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("keeps explicit wake resource environment values authoritative over manifest values", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-local-voice-resources-env-"));
    try {
      const resourceRoot = join(root, "local-macos-voice");
      const manifestWakeModelPath = join(resourceRoot, "models", "manifest-hey-setta.onnx");
      const configuredWakeModelPath = join(root, "configured-hey-setta.tflite");
      await writeFileRecursive(manifestWakeModelPath, "manifest-wake-model");
      await writeFileRecursive(configuredWakeModelPath, "configured-wake-model");
      await writeFileRecursive(
        join(resourceRoot, "manifest.json"),
        JSON.stringify({
          wakeModelPath: "models/manifest-hey-setta.onnx",
          wakeModelSHA256: sha256("manifest-wake-model"),
          wakeRuntime: "onnx",
        }),
      );

      const configuration = resolveLocalMacOSVoiceHelperConfiguration(
        {
          SETTA_LOCAL_MACOS_VOICE_WAKE_MODEL_PATH: configuredWakeModelPath,
          SETTA_LOCAL_MACOS_VOICE_WAKE_MODEL_SHA256: sha256("configured-wake-model"),
          SETTA_LOCAL_MACOS_VOICE_WAKE_RUNTIME: "tflite",
        },
        [resourceRoot],
      );

      expect(configuration).toMatchObject({
        wakeModelPath: configuredWakeModelPath,
        wakeModelSHA256: sha256("configured-wake-model"),
        wakeRuntime: "tflite",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

async function writeFileRecursive(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
