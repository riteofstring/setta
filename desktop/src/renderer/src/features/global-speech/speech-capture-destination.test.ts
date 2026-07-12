import { describe, expect, test } from "vitest";

import {
  conversationSpeechCaptureRequest,
  freezeSpeechCaptureRequest,
  masterSpeechCaptureRequest,
  type SpeechCaptureRequest,
} from "./speech-capture-destination";

describe("speech capture destinations", () => {
  test("owns immutable master and conversation request values", () => {
    const master = masterSpeechCaptureRequest();
    const conversation = conversationSpeechCaptureRequest("conversation_capture", "pane_capture");

    expect(Object.isFrozen(master)).toBe(true);
    expect(Object.isFrozen(master.destination)).toBe(true);
    expect(Object.isFrozen(conversation)).toBe(true);
    expect(Object.isFrozen(conversation.destination)).toBe(true);
  });

  test("rejects malformed pane destinations instead of silently retargeting them", () => {
    expect(() => conversationSpeechCaptureRequest(" ", "pane_capture")).toThrow(
      "conversation id must be non-empty and normalized",
    );
    expect(() => conversationSpeechCaptureRequest("conversation_capture", "")).toThrow(
      "source pane id must be non-empty and normalized",
    );
    expect(() =>
      freezeSpeechCaptureRequest({
        destination: { type: "master" },
        sourcePaneId: "pane_capture",
      } as unknown as SpeechCaptureRequest),
    ).toThrow("master speech capture cannot have a source pane");
  });
});
