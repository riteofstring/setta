import { describe, expect, test } from "vitest";

import type { RealtimeTranscriptionServerEvent } from "./realtime-transcription-events";
import { RealtimeTranscriptionSession } from "./realtime-transcription-session";

describe("Realtime transcription protocol session", () => {
  test("streams deltas before commit and correlates the committed-item lifecycle by identity", () => {
    const session = readySession();

    expect(session.accept(delta("item_current", "Hello "))).toEqual({
      captureSessionId: "capture_current",
      delta: "Hello ",
      itemId: "item_current",
      providerSessionId: "session_current",
      transcript: "Hello ",
      type: "delta",
    });
    expect(session.accept(delta("item_current", "world"))).toMatchObject({
      transcript: "Hello world",
      type: "delta",
    });
    session.beginCommit();
    expect(session.accept(committed("item_current"))).toBeNull();
    expect(session.accept(itemLifecycle("conversation.item.added", "item_current"))).toBeNull();
    expect(session.accept(itemLifecycle("conversation.item.done", "item_current"))).toBeNull();
    expect(session.accept(completed("item_current", "Hello, world."))).toEqual({
      captureSessionId: "capture_current",
      itemId: "item_current",
      providerSessionId: "session_current",
      transcript: "Hello, world.",
      type: "completed",
    });
  });

  test("accepts independently ordered lifecycle acknowledgements for the correlated item", () => {
    const session = readySession();

    expect(session.accept(delta("item_current", "Concurrent"))).toMatchObject({
      transcript: "Concurrent",
    });
    session.beginCommit();
    expect(session.accept(itemLifecycle("conversation.item.done", "item_current"))).toBeNull();
    expect(session.accept(committed("item_current"))).toBeNull();
    expect(session.accept(itemLifecycle("conversation.item.added", "item_current"))).toBeNull();
    expect(session.accept(completed("item_current", "Concurrent transcript."))).toMatchObject({
      transcript: "Concurrent transcript.",
      type: "completed",
    });
  });

  test("rejects premature finalization, duplicate acknowledgements, and cross-item events", () => {
    const beforeCommit = readySession();
    expect(() => beforeCommit.accept(committed("item_current"))).toThrowError(
      expect.objectContaining({ code: "protocol_violation" }),
    );
    expect(() => beforeCommit.accept(completed("item_current", "Too early"))).toThrowError(
      expect.objectContaining({ code: "protocol_violation" }),
    );

    const crossItem = readySession();
    crossItem.accept(delta("item_current", "Current"));
    crossItem.beginCommit();
    expect(() => crossItem.accept(committed("item_other"))).toThrowError(
      expect.objectContaining({ code: "protocol_violation" }),
    );

    const duplicate = readySession();
    duplicate.beginCommit();
    duplicate.accept(committed("item_current"));
    expect(() => duplicate.accept(committed("item_current"))).toThrowError(
      expect.objectContaining({ code: "protocol_violation" }),
    );
  });

  test("bounds accumulated and authoritative transcript text by Unicode character", () => {
    const session = readySession(2);
    expect(session.accept(delta("item_current", "😀😀"))).toMatchObject({ transcript: "😀😀" });
    expect(() => session.accept(delta("item_current", "é"))).toThrowError(
      expect.objectContaining({ code: "transcript_too_large" }),
    );
  });
});

function readySession(maximumTranscriptCharacters = 8_000): RealtimeTranscriptionSession {
  const session = new RealtimeTranscriptionSession("capture_current", maximumTranscriptCharacters);
  session.accept({
    eventId: "event_session",
    providerSessionId: "session_current",
    type: "session.created",
  });
  return session;
}

function committed(itemId: string): RealtimeTranscriptionServerEvent {
  return {
    eventId: `event_committed_${itemId}`,
    itemId,
    type: "input_audio_buffer.committed",
  };
}

function itemLifecycle(
  type: "conversation.item.added" | "conversation.item.done",
  itemId: string,
): RealtimeTranscriptionServerEvent {
  return { eventId: `event_${type}_${itemId}`, itemId, type };
}

function delta(itemId: string, text: string): RealtimeTranscriptionServerEvent {
  return {
    contentIndex: 0,
    delta: text,
    eventId: `event_delta_${text}`,
    itemId,
    type: "conversation.item.input_audio_transcription.delta",
  };
}

function completed(itemId: string, transcript: string): RealtimeTranscriptionServerEvent {
  return {
    contentIndex: 0,
    eventId: "event_completed",
    itemId,
    transcript,
    type: "conversation.item.input_audio_transcription.completed",
  };
}
