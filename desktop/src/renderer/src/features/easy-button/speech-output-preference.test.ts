import { describe, expect, test, vi } from "vitest";

import {
  readSpeechOutputMode,
  type SpeechOutputMode,
  writeSpeechOutputMode,
} from "./speech-output-preference";

describe("Easy Button speech output preference", () => {
  test.each<SpeechOutputMode>(["off", "final", "highlights_and_final"])(
    "reads the device-local %s mode",
    (mode) => {
      expect(readSpeechOutputMode({ getItem: () => mode })).toBe(mode);
    },
  );

  test.each([null, "", "summary", "latest", "FINAL"])(
    "defaults an absent or invalid value %s to off",
    (value) => {
      expect(readSpeechOutputMode({ getItem: () => value })).toBe("off");
    },
  );

  test("stores only the selected enum under the versioned owner key", () => {
    const setItem = vi.fn();

    writeSpeechOutputMode({ setItem }, "highlights_and_final");

    expect(setItem).toHaveBeenCalledWith(
      "setta.easy-button.speech-output-mode.v1",
      "highlights_and_final",
    );
  });
});
