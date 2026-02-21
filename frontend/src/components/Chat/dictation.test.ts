import { describe, expect, it } from "vitest";
import { insertTextAtSelection, mapDictationError } from "./dictation";

describe("dictation helpers", () => {
  it("inserts transcript text at selection", () => {
    const result = insertTextAtSelection("hello world", " brave", 5, 5);

    expect(result.value).toBe("hello brave world");
    expect(result.nextCaret).toBe(11);
  });

  it("replaces the selected range with transcript text", () => {
    const result = insertTextAtSelection("hello world", "setta", 6, 11);

    expect(result.value).toBe("hello setta");
    expect(result.nextCaret).toBe(11);
  });

  it("maps dictation errors to user-facing messages", () => {
    expect(mapDictationError("not-allowed")).toBe(
      "Microphone access was denied.",
    );
    expect(mapDictationError("audio-capture")).toBe(
      "No microphone input was detected.",
    );
    expect(mapDictationError("network")).toBe(
      "Dictation failed due to a network error.",
    );
    expect(mapDictationError("no-speech")).toBe("No speech was detected.");
    expect(mapDictationError("unexpected")).toBe("Dictation failed.");
  });
});
