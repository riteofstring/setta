import { describe, expect, test } from "vitest";

import { decodeRealtimeTranscriptionServerEvent } from "./realtime-transcription-events";

describe("Realtime transcription event decoder", () => {
  test("decodes the transcription session and item lifecycle", () => {
    expect(
      decodeEvent({
        event_id: "event_session",
        session: { id: "sess_current", type: "transcription" },
        type: "session.created",
      }),
    ).toEqual({
      eventId: "event_session",
      providerSessionId: "sess_current",
      type: "session.created",
    });
    expect(
      decodeEvent({
        event_id: "event_item",
        item: { id: "item_current", role: "user", type: "message" },
        type: "conversation.item.created",
      }),
    ).toEqual({
      eventId: "event_item",
      itemId: "item_current",
      type: "conversation.item.created",
    });
    expect(
      decodeEvent({
        event_id: "event_commit",
        item_id: "item_current",
        previous_item_id: null,
        type: "input_audio_buffer.committed",
      }),
    ).toEqual({
      eventId: "event_commit",
      itemId: "item_current",
      type: "input_audio_buffer.committed",
    });
  });

  test("decodes authoritative transcript delta, completion, and failure events", () => {
    expect(
      decodeEvent({
        content_index: 0,
        delta: "Hello",
        event_id: "event_delta",
        item_id: "item_current",
        type: "conversation.item.input_audio_transcription.delta",
      }),
    ).toEqual({
      contentIndex: 0,
      delta: "Hello",
      eventId: "event_delta",
      itemId: "item_current",
      type: "conversation.item.input_audio_transcription.delta",
    });
    expect(
      decodeEvent({
        content_index: 0,
        event_id: "event_completed",
        item_id: "item_current",
        transcript: "Hello, world.",
        type: "conversation.item.input_audio_transcription.completed",
        usage: { total_tokens: 4, type: "tokens" },
      }),
    ).toEqual({
      contentIndex: 0,
      eventId: "event_completed",
      itemId: "item_current",
      transcript: "Hello, world.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    expect(
      decodeEvent({
        content_index: 0,
        error: {
          code: "audio_unintelligible",
          message: "The audio could not be transcribed.",
          param: null,
          type: "transcription_error",
        },
        event_id: "event_failed",
        item_id: "item_current",
        type: "conversation.item.input_audio_transcription.failed",
      }),
    ).toEqual({
      contentIndex: 0,
      error: {
        code: "audio_unintelligible",
        message: "The audio could not be transcribed.",
        type: "transcription_error",
      },
      eventId: "event_failed",
      itemId: "item_current",
      type: "conversation.item.input_audio_transcription.failed",
    });
  });

  test("accepts empty delta and final transcript text for later no-speech handling", () => {
    expect(
      decodeEvent({
        content_index: 0,
        delta: "",
        event_id: "event_delta",
        item_id: "item_current",
        type: "conversation.item.input_audio_transcription.delta",
      }),
    ).toMatchObject({ delta: "" });
    expect(
      decodeEvent({
        content_index: 0,
        event_id: "event_completed",
        item_id: "item_current",
        transcript: "",
        type: "conversation.item.input_audio_transcription.completed",
      }),
    ).toMatchObject({ transcript: "" });
  });

  test("decodes provider and administrative events without exposing unchecked shapes", () => {
    expect(
      decodeEvent({
        error: {
          code: null,
          event_id: null,
          message: "The request was invalid.",
          param: null,
          type: "invalid_request_error",
        },
        event_id: "event_error",
        type: "error",
      }),
    ).toEqual({
      error: {
        code: null,
        message: "The request was invalid.",
        type: "invalid_request_error",
      },
      eventId: "event_error",
      type: "error",
    });
    expect(
      decodeEvent({
        event_id: "event_limits",
        rate_limits: [{ limit: 100, name: "tokens", remaining: 99 }],
        type: "rate_limits.updated",
      }),
    ).toEqual({ eventId: "event_limits", type: "rate_limits.updated" });
  });

  test.each([
    { name: "binary payload", value: new Uint8Array([1, 2, 3]) },
    { name: "malformed JSON", value: "{" },
    { name: "JSON array", value: "[]" },
    { name: "missing type", value: JSON.stringify({ event_id: "event_missing" }) },
    {
      name: "unknown event",
      value: JSON.stringify({ event_id: "event_unknown", type: "response.created" }),
    },
    {
      name: "realtime rather than transcription session",
      value: JSON.stringify({
        event_id: "event_session",
        session: { id: "sess_wrong", type: "realtime" },
        type: "session.created",
      }),
    },
    {
      name: "assistant item",
      value: JSON.stringify({
        event_id: "event_item",
        item: { id: "item_wrong", role: "assistant", type: "message" },
        type: "conversation.item.created",
      }),
    },
    {
      name: "negative content index",
      value: JSON.stringify({
        content_index: -1,
        delta: "text",
        event_id: "event_delta",
        item_id: "item_current",
        type: "conversation.item.input_audio_transcription.delta",
      }),
    },
    {
      name: "missing completed transcript",
      value: JSON.stringify({
        content_index: 0,
        event_id: "event_completed",
        item_id: "item_current",
        type: "conversation.item.input_audio_transcription.completed",
      }),
    },
    {
      name: "generic error without details",
      value: JSON.stringify({
        error: {},
        event_id: "event_error",
        type: "error",
      }),
    },
  ])("rejects $name", ({ value }) => {
    expect(() => decodeRealtimeTranscriptionServerEvent(value)).toThrow();
  });
});

function decodeEvent(value: Record<string, unknown>) {
  return decodeRealtimeTranscriptionServerEvent(JSON.stringify(value));
}
