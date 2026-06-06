import { afterEach, describe, expect, test, vi } from "vitest";

import {
  defaultTerminalDisplaySettings,
  normalizeTerminalDisplaySettings,
  readTerminalDisplaySettings,
  resetTerminalDisplaySettings,
  terminalDisplaySettingsStorageKey,
  writeTerminalDisplaySettings,
} from "./terminal-display-settings";

describe("terminal display settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("normalizes lightweight display settings without profile fields", () => {
    expect(
      normalizeTerminalDisplaySettings({
        cwd: "/tmp/ignored",
        fontFamily: "JetBrains Mono",
        fontSize: 14.4,
        profileId: "ignored",
        scrollback: 20_000,
        shellPath: "/bin/zsh",
        themeId: "high-contrast-dark",
      }),
    ).toEqual({
      fontFamily: "JetBrains Mono",
      fontSize: 14,
      scrollback: 10_000,
      themeId: "high-contrast-dark",
    });
  });

  test("falls back for malformed storage and dispatches updates when written", () => {
    const storage = new MemoryStorage();
    storage.setItem(terminalDisplaySettingsStorageKey, "{not json");

    expect(readTerminalDisplaySettings(storage)).toEqual(defaultTerminalDisplaySettings);

    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      CustomEvent,
      dispatchEvent,
      localStorage: storage,
    });

    const written = writeTerminalDisplaySettings({
      fontFamily: "Fira Code",
      fontSize: 16,
      scrollback: 800,
      themeId: "setta-light",
    });

    expect(readTerminalDisplaySettings(storage)).toEqual(written);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);

    resetTerminalDisplaySettings(storage);
    expect(readTerminalDisplaySettings(storage)).toEqual(defaultTerminalDisplaySettings);
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
