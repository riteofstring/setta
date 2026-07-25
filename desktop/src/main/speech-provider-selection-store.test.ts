import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  SpeechProviderSelectionStore,
  speechProviderSelectionStoragePath,
} from "./speech-provider-selection-store";

describe("SpeechProviderSelectionStore", () => {
  test("defaults to local macOS on macOS and persists an explicit OpenAI selection", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-speech-provider-selection-"));
    const store = new SpeechProviderSelectionStore(userDataDir, "darwin");

    await expect(store.read()).resolves.toEqual({
      defaultProvider: "local_macos",
      provider: "local_macos",
      supportedProviders: ["local_macos", "openai"],
    });

    await expect(store.update("openai")).resolves.toEqual({
      defaultProvider: "local_macos",
      provider: "openai",
      supportedProviders: ["local_macos", "openai"],
    });
    await expect(store.read()).resolves.toMatchObject({ provider: "openai" });
    const raw = JSON.parse(await readFile(speechProviderSelectionStoragePath(userDataDir), "utf8"));
    expect(raw).toEqual({ provider: "openai", schema_version: 1 });
    const mode = (await stat(speechProviderSelectionStoragePath(userDataDir))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("keeps OpenAI as the default and only supported provider off macOS", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-speech-provider-selection-"));
    const store = new SpeechProviderSelectionStore(userDataDir, "linux");

    await expect(store.read()).resolves.toEqual({
      defaultProvider: "openai",
      provider: "openai",
      supportedProviders: ["openai"],
    });
    await expect(store.update("local_macos")).rejects.toThrow(
      'Speech provider "local_macos" is not supported on linux.',
    );
  });

  test("fails specifically when a persisted provider is not current for this platform", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-speech-provider-selection-"));
    await writeFile(
      speechProviderSelectionStoragePath(userDataDir),
      JSON.stringify({ provider: "local_macos", schema_version: 1 }) + "\n",
    );

    const store = new SpeechProviderSelectionStore(userDataDir, "linux");

    await expect(store.read()).rejects.toThrow(
      'Speech provider "local_macos" is not supported on linux.',
    );
  });
});
