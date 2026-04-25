import {
  getErrorCode,
  getErrorDetail,
} from "@setta/app-subsystem-frontend-sdk";
import { describe, expect, it } from "vitest";
describe("endpointUtils", () => {
  it("extracts detail from raw binary JSON payloads", () => {
    const binaryJson = new TextEncoder().encode(
      JSON.stringify({ detail: "Permission denied." }),
    );

    expect(getErrorDetail(binaryJson)).toBe("Permission denied.");
  });

  it("extracts nested detail and error code payloads", () => {
    const payload = {
      detail: {
        message:
          "Realtime transcription is unavailable for this provider/model.",
        errorCode: "unsupported_model",
      },
    };

    expect(getErrorDetail(payload)).toBe(
      "Realtime transcription is unavailable for this provider/model.",
    );
    expect(getErrorCode(payload)).toBe("unsupported_model");
  });

  it("extracts error codes from binary JSON payloads", () => {
    const binaryJson = new TextEncoder().encode(
      JSON.stringify({
        detail: {
          message: "Missing API key.",
          errorCode: "missing_api_key",
        },
      }),
    );

    expect(getErrorCode(binaryJson)).toBe("missing_api_key");
  });

  it("extracts Go-style error envelopes", () => {
    const payload = {
      error: {
        code: "unknown_share_session",
        message: "Share session not found: share-a",
      },
    };

    expect(getErrorDetail(payload)).toBe("Share session not found: share-a");
    expect(getErrorCode(payload)).toBe("unknown_share_session");
  });

  it("extracts Go-style error envelopes from binary JSON payloads", () => {
    const binaryJson = new TextEncoder().encode(
      JSON.stringify({
        error: {
          code: "project_config_not_found",
          message: "Project config not found.",
        },
      }),
    );

    expect(getErrorDetail(binaryJson)).toBe("Project config not found.");
    expect(getErrorCode(binaryJson)).toBe("project_config_not_found");
  });

  it("falls back to decoded binary text when no structured detail exists", () => {
    const binaryText = new TextEncoder().encode("Plain text failure");

    expect(getErrorDetail(binaryText)).toBe("Plain text failure");
    expect(getErrorCode(binaryText)).toBeNull();
  });
});
