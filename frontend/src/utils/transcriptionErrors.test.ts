import { describe, expect, it } from "vitest";
import {
  isProviderTranscriptionUnsupportedModelError,
  ProviderTranscriptionError,
} from "./transcriptionErrors";

describe("transcriptionErrors", () => {
  it("matches unsupported_model code for browser fallback", () => {
    const error = new ProviderTranscriptionError({
      message: "Realtime transcription is unavailable for this provider/model.",
      code: "unsupported_model",
      status: 400,
    });

    expect(isProviderTranscriptionUnsupportedModelError(error)).toBe(true);
  });

  it("does not match unsupported_model for other structured codes", () => {
    const timeoutError = new ProviderTranscriptionError({
      message: "Provider transcription failed due to timeout.",
      code: "provider_failure",
      status: 502,
    });
    const networkError = new ProviderTranscriptionError({
      message: "Network request failed.",
      code: "invalid_request",
      status: 400,
    });

    expect(isProviderTranscriptionUnsupportedModelError(timeoutError)).toBe(
      false,
    );
    expect(isProviderTranscriptionUnsupportedModelError(networkError)).toBe(
      false,
    );
  });

  it("does not inspect free-form message text", () => {
    expect(
      isProviderTranscriptionUnsupportedModelError(
        new Error("Model does not support audio transcription."),
      ),
    ).toBe(false);
  });
});
