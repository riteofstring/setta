type RealtimeTranscriptionProviderError = {
  code: string | null;
  message: string;
  type: string;
};

export type RealtimeTranscriptionServerEvent =
  | {
      eventId: string;
      providerSessionId: string;
      type: "session.created";
    }
  | {
      eventId: string;
      itemId: string;
      type: "conversation.item.created";
    }
  | {
      eventId: string;
      itemId: string;
      type: "input_audio_buffer.committed";
    }
  | {
      contentIndex: number;
      delta: string;
      eventId: string;
      itemId: string;
      type: "conversation.item.input_audio_transcription.delta";
    }
  | {
      contentIndex: number;
      eventId: string;
      itemId: string;
      transcript: string;
      type: "conversation.item.input_audio_transcription.completed";
    }
  | {
      contentIndex: number;
      error: RealtimeTranscriptionProviderError;
      eventId: string;
      itemId: string;
      type: "conversation.item.input_audio_transcription.failed";
    }
  | {
      error: RealtimeTranscriptionProviderError;
      eventId: string;
      type: "error";
    }
  | {
      eventId: string;
      type: "rate_limits.updated";
    };

export function decodeRealtimeTranscriptionServerEvent(
  message: unknown,
): RealtimeTranscriptionServerEvent {
  const record = parseEventRecord(message);
  const type = requiredString(record, "type", "Realtime transcription event");
  switch (type) {
    case "session.created":
      return decodeSessionCreated(record);
    case "conversation.item.created":
      return decodeConversationItemCreated(record);
    case "input_audio_buffer.committed":
      return decodeInputAudioBufferCommitted(record);
    case "conversation.item.input_audio_transcription.delta":
      return decodeTranscriptDelta(record);
    case "conversation.item.input_audio_transcription.completed":
      return decodeTranscriptCompleted(record);
    case "conversation.item.input_audio_transcription.failed":
      return decodeTranscriptFailed(record);
    case "error":
      return decodeErrorEvent(record);
    case "rate_limits.updated":
      return { eventId: eventId(record), type };
    default:
      throw new Error(`Unsupported Realtime transcription event type ${JSON.stringify(type)}.`);
  }
}

function decodeSessionCreated(record: Record<string, unknown>): RealtimeTranscriptionServerEvent {
  const session = requiredRecord(record, "session", "session.created event");
  const sessionType = requiredString(session, "type", "session.created session");
  if (sessionType !== "transcription") {
    throw new Error(
      `Realtime session type must be transcription, received ${JSON.stringify(sessionType)}.`,
    );
  }
  return {
    eventId: eventId(record),
    providerSessionId: requiredString(session, "id", "session.created session"),
    type: "session.created",
  };
}

function decodeConversationItemCreated(
  record: Record<string, unknown>,
): RealtimeTranscriptionServerEvent {
  const item = requiredRecord(record, "item", "conversation.item.created event");
  const itemType = requiredString(item, "type", "conversation.item.created item");
  const role = requiredString(item, "role", "conversation.item.created item");
  if (itemType !== "message" || role !== "user") {
    throw new Error("Realtime transcription created an unexpected non-user message item.");
  }
  return {
    eventId: eventId(record),
    itemId: requiredString(item, "id", "conversation.item.created item"),
    type: "conversation.item.created",
  };
}

function decodeInputAudioBufferCommitted(
  record: Record<string, unknown>,
): RealtimeTranscriptionServerEvent {
  return {
    eventId: eventId(record),
    itemId: requiredString(record, "item_id", "input_audio_buffer.committed event"),
    type: "input_audio_buffer.committed",
  };
}

function decodeTranscriptDelta(record: Record<string, unknown>): RealtimeTranscriptionServerEvent {
  return {
    contentIndex: contentIndex(record),
    delta: requiredString(record, "delta", "transcription delta event", true),
    eventId: eventId(record),
    itemId: transcriptItemId(record),
    type: "conversation.item.input_audio_transcription.delta",
  };
}

function decodeTranscriptCompleted(
  record: Record<string, unknown>,
): RealtimeTranscriptionServerEvent {
  return {
    contentIndex: contentIndex(record),
    eventId: eventId(record),
    itemId: transcriptItemId(record),
    transcript: requiredString(record, "transcript", "transcription completed event", true),
    type: "conversation.item.input_audio_transcription.completed",
  };
}

function decodeTranscriptFailed(record: Record<string, unknown>): RealtimeTranscriptionServerEvent {
  return {
    contentIndex: contentIndex(record),
    error: providerError(record, "transcription failed event", false),
    eventId: eventId(record),
    itemId: transcriptItemId(record),
    type: "conversation.item.input_audio_transcription.failed",
  };
}

function decodeErrorEvent(record: Record<string, unknown>): RealtimeTranscriptionServerEvent {
  return {
    error: providerError(record, "Realtime error event", true),
    eventId: eventId(record),
    type: "error",
  };
}

function providerError(
  record: Record<string, unknown>,
  context: string,
  requireDetails: boolean,
): RealtimeTranscriptionProviderError {
  const error = requiredRecord(record, "error", context);
  const type = optionalString(error, "type", `${context} error`);
  const message = optionalString(error, "message", `${context} error`);
  if (requireDetails && (type === null || message === null)) {
    throw new Error(`${context} requires error type and message.`);
  }
  return {
    code: optionalString(error, "code", `${context} error`),
    message: message ?? "OpenAI transcription failed.",
    type: type ?? "transcription_error",
  };
}

function parseEventRecord(message: unknown): Record<string, unknown> {
  if (typeof message !== "string") {
    throw new Error("Realtime transcription event must be a JSON string.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(message) as unknown;
  } catch (error) {
    throw new Error("Realtime transcription event contains malformed JSON.", { cause: error });
  }
  if (!isRecord(parsed)) {
    throw new Error("Realtime transcription event must be a JSON object.");
  }
  return parsed;
}

function eventId(record: Record<string, unknown>): string {
  return requiredString(record, "event_id", "Realtime transcription event");
}

function transcriptItemId(record: Record<string, unknown>): string {
  return requiredString(record, "item_id", "Realtime transcription event");
}

function contentIndex(record: Record<string, unknown>): number {
  const value = record.content_index;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error("Realtime transcription content_index must be a non-negative integer.");
  }
  return value as number;
}

function requiredRecord(
  record: Record<string, unknown>,
  field: string,
  context: string,
): Record<string, unknown> {
  const value = record[field];
  if (!isRecord(value)) {
    throw new Error(`${context} requires object field ${field}.`);
  }
  return value;
}

function requiredString(
  record: Record<string, unknown>,
  field: string,
  context: string,
  allowEmpty = false,
): string {
  const value = record[field];
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`${context} requires string field ${field}.`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string | null {
  const value = record[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} field ${field} must be a non-empty string when present.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
