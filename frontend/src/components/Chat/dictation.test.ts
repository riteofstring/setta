import { describe, expect, it } from "vitest";
import {
  insertTextAtSelection,
  isDictationAvailable,
  isNoSpeechDictationError,
  mapDictationError,
  pickProviderRecorderMimeType,
} from "./dictation";

describe("dictation helpers", () => {
  it("reports availability from environment support only", () => {
    expect(isDictationAvailable(true)).toBe(true);
    expect(isDictationAvailable(false)).toBe(false);
  });

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

  it("detects no-speech dictation errors", () => {
    expect(isNoSpeechDictationError("no-speech")).toBe(true);
    expect(isNoSpeechDictationError("audio-capture")).toBe(false);
    expect(isNoSpeechDictationError(undefined)).toBe(false);
  });

  it("chooses the first supported provider recorder MIME type", () => {
    const supported = new Set<string>(["audio/ogg", "audio/webm"]);
    const picked = pickProviderRecorderMimeType((mimeType) =>
      supported.has(mimeType),
    );

    expect(picked).toBe("audio/webm");
  });

  it("returns null when no provider recorder MIME type is supported", () => {
    const picked = pickProviderRecorderMimeType(() => false);

    expect(picked).toBeNull();
  });
});
