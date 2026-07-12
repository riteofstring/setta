import { describe, expect, test } from "vitest";

import { ipcChannels } from "@shared/ipc";

import {
  ipcRecordingFailure,
  ipcRecordingValue,
  recordingEventValue,
  sanitizeRecordingValue,
  summarizeRecordingValue,
} from "./session-recorder";

const redacted = { redacted: true, type: "sensitive_value" };

describe("session recording privacy", () => {
  test("redacts explicit secret and raw-audio fields while retaining safe context", () => {
    expect(
      sanitizeRecordingValue({
        audioBase64: "private-audio",
        nested: {
          apiKey: "private-api-key",
          bootstrap_token: "private-runtime-token",
          clientSecret: "private-client-secret",
          iconDataUrl: "data:image/png;base64,private-editor-icon",
          imageDataUrl: "data:image/png;base64,private-renderer-capture",
          title: "safe title",
        },
        response: {
          answers: [{ answers: ["private-approval-answer"], questionId: "secret" }],
          decision: "answered",
        },
      }),
    ).toEqual({
      audioBase64: redacted,
      nested: {
        apiKey: redacted,
        bootstrap_token: redacted,
        clientSecret: redacted,
        iconDataUrl: redacted,
        imageDataUrl: redacted,
        title: "safe title",
      },
      response: {
        answers: redacted,
        decision: "answered",
      },
    });
  });

  test("summarizes binary values and backend request bodies without copying content", () => {
    expect(sanitizeRecordingValue(Uint8Array.from([1, 2, 3, 4]))).toEqual({
      byteLength: 4,
      type: "binary",
    });
    expect(summarizeRecordingValue('{"apiKey":"private-api-key"}')).toEqual({
      length: 28,
      type: "string",
    });
  });

  test.each([
    [ipcChannels.appOpenExternalUrl, "external_url", "https://example.invalid/?code=private"],
    [
      ipcChannels.codexAccountStartLogin,
      "codex_account_login_request",
      { apiKey: "private-api-key", type: "apiKey" },
    ],
    [
      ipcChannels.conversationSubmitApproval,
      "conversation_approval_submission",
      { response: { answers: ["private-approval-answer"] } },
    ],
    [
      ipcChannels.runtimeAddByPairingUrl,
      "runtime_pairing_url",
      "setta://pair?tok=private-pairing-token",
    ],
  ])("redacts sensitive IPC start payloads for %s", (channel, type, value) => {
    expect(ipcRecordingValue(channel, "start", [value], true)).toEqual({
      redacted: true,
      type,
    });
  });

  test("redacts login credentials from non-sensitive IPC result structures", () => {
    expect(
      ipcRecordingValue(
        ipcChannels.codexAccountRead,
        "finish",
        {
          login: {
            authUrl: "https://example.invalid/private",
            userCode: "PRIVATE-CODE",
          },
          status: "login_pending",
        },
        true,
      ),
    ).toEqual({
      login: { authUrl: redacted, userCode: redacted },
      status: "login_pending",
    });
  });

  test("redacts sensitive IPC failure details", () => {
    const privateAnswer = "private-approval-answer";
    const recorded = ipcRecordingFailure(
      ipcChannels.conversationSubmitApproval,
      new Error(`approval rejected ${privateAnswer}`),
    );

    expect(recorded).toEqual({
      redacted: true,
      type: "conversation_approval_submission_failure",
    });
    expect(JSON.stringify(recorded)).not.toContain(privateAnswer);
  });

  test("redacts credential-bearing external URL events", () => {
    const privateURL = "https://example.invalid/callback?code=private-authorization-code";
    const recorded = recordingEventValue("external_url_open_blocked", { url: privateURL });

    expect(recorded).toEqual({ redacted: true, type: "external_url" });
    expect(JSON.stringify(recorded)).not.toContain(privateURL);
  });
});
