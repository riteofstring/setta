import { ProviderTranscriptionError } from "utils/transcriptionErrors";
import { describe, expect, it } from "vitest";
import {
  classifyProviderDictationFailureClass,
  getProjectDictationModeOptionLabel,
  shouldFallbackToBrowserAfterProviderFailure,
} from "./dictationPolicy";

describe("dictationPolicy", () => {
  it("builds project-chat mode labels from the source chain policy", () => {
    expect(
      getProjectDictationModeOptionLabel({
        mode: "auto",
        providerModeAvailable: true,
      }),
    ).toBe("Auto (provider, then browser/OS)");
    expect(
      getProjectDictationModeOptionLabel({
        mode: "provider",
        providerModeAvailable: false,
      }),
    ).toBe("Always provider (requires transcription profile)");
    expect(
      getProjectDictationModeOptionLabel({
        mode: "browser",
        providerModeAvailable: true,
      }),
    ).toBe("Always browser / OS");
  });

  it("falls back to browser for auto mode across provider transcription error classes", () => {
    expect(
      shouldFallbackToBrowserAfterProviderFailure({
        mode: "auto",
        phase: "transcription",
        failureClass: "unsupported_model",
      }),
    ).toBe(true);
    expect(
      shouldFallbackToBrowserAfterProviderFailure({
        mode: "auto",
        phase: "transcription",
        failureClass: "missing_api_key",
      }),
    ).toBe(true);
    expect(
      shouldFallbackToBrowserAfterProviderFailure({
        mode: "auto",
        phase: "transcription",
        failureClass: "unknown",
      }),
    ).toBe(true);
  });

  it("keeps provider mode fail-fast without browser fallback", () => {
    expect(
      shouldFallbackToBrowserAfterProviderFailure({
        mode: "provider",
        phase: "transcription",
        failureClass: "unsupported_model",
      }),
    ).toBe(false);
  });

  it("classifies known and unknown provider transcription errors", () => {
    const known = new ProviderTranscriptionError({
      message: "Missing key",
      code: "missing_api_key",
      status: 400,
    });
    const unknown = new ProviderTranscriptionError({
      message: "Unknown",
      code: "unexpected_code",
      status: 400,
    });

    expect(classifyProviderDictationFailureClass(known)).toBe(
      "missing_api_key",
    );
    expect(classifyProviderDictationFailureClass(unknown)).toBe("unknown");
    expect(classifyProviderDictationFailureClass(new Error("boom"))).toBe(
      "unknown",
    );
  });
});
