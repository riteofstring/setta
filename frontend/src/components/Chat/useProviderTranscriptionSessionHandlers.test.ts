import { describe, expect, it } from "vitest";
import { requireTranscriptionSessionDelta } from "./useProviderTranscriptionSessionHandlers";

describe("requireTranscriptionSessionDelta", () => {
  it("returns successful transcription deltas", () => {
    expect(
      requireTranscriptionSessionDelta({
        appendText: "hello",
        fullText: "hello",
        isFinal: false,
      }),
    ).toEqual({
      appendText: "hello",
      fullText: "hello",
      isFinal: false,
    });
  });

  it("throws when transcription delta is missing", () => {
    expect(() => requireTranscriptionSessionDelta(null)).toThrowError(
      "Provider transcription failed.",
    );
  });
});
