import { describe, expect, test, vi } from "vitest";

import {
  readGlobalMicrophonePreference,
  writeGlobalMicrophonePreference,
} from "./global-microphone-preference";

describe("global microphone preference", () => {
  test("defaults a missing preference to disabled and round-trips exact values", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(readGlobalMicrophonePreference(storage)).toEqual({ enabled: false, type: "ready" });
    expect(writeGlobalMicrophonePreference(storage, true)).toEqual({
      enabled: true,
      type: "ready",
    });
    expect(readGlobalMicrophonePreference(storage)).toEqual({ enabled: true, type: "ready" });
    expect(writeGlobalMicrophonePreference(storage, false)).toEqual({
      enabled: false,
      type: "ready",
    });
    expect(readGlobalMicrophonePreference(storage)).toEqual({ enabled: false, type: "ready" });
  });

  test("reports corrupt or unavailable storage instead of silently changing the preference", () => {
    expect(readGlobalMicrophonePreference({ getItem: () => "true" })).toEqual({
      message: "The stored global microphone preference is invalid.",
      type: "failed",
    });
    expect(
      readGlobalMicrophonePreference({
        getItem: () => {
          throw new Error("private storage failure");
        },
      }),
    ).toEqual({
      message: "The global microphone preference could not be read.",
      type: "failed",
    });
    const setItem = vi.fn(() => {
      throw new Error("private storage failure");
    });
    expect(writeGlobalMicrophonePreference({ setItem }, true)).toEqual({
      message: "The global microphone preference could not be saved.",
      type: "failed",
    });
  });
});
