import {
  isOpenAIRealtimeServerEventType,
  openAIRealtimeServerEventContracts,
  openAIRealtimeServerEventType,
  type OpenAISchemaShape,
  type OpenAIRealtimeServerEventType,
} from "@generated/openai-realtime";

type RealtimeTranscriptionProviderError = {
  code: string | null;
  message: string;
  type: string;
};

export type RealtimeTranscriptionServerEvent =
  | {
      eventId: string;
      providerSessionId: string;
      type: typeof openAIRealtimeServerEventType.sessionCreated;
    }
  | {
      eventId: string;
      itemId: string;
      type: typeof openAIRealtimeServerEventType.conversationItemAdded;
    }
  | {
      eventId: string;
      itemId: string;
      type: typeof openAIRealtimeServerEventType.conversationItemDone;
    }
  | {
      eventId: string;
      itemId: string;
      type: typeof openAIRealtimeServerEventType.inputAudioBufferCommitted;
    }
  | {
      contentIndex: number;
      delta: string;
      eventId: string;
      itemId: string;
      type: typeof openAIRealtimeServerEventType.transcriptionDelta;
    }
  | {
      contentIndex: number;
      eventId: string;
      itemId: string;
      transcript: string;
      type: typeof openAIRealtimeServerEventType.transcriptionCompleted;
    }
  | {
      contentIndex: number;
      error: RealtimeTranscriptionProviderError;
      eventId: string;
      itemId: string;
      type: typeof openAIRealtimeServerEventType.transcriptionFailed;
    }
  | {
      error: RealtimeTranscriptionProviderError;
      eventId: string;
      type: typeof openAIRealtimeServerEventType.error;
    }
  | {
      eventId: string;
      type: typeof openAIRealtimeServerEventType.rateLimitsUpdated;
    };

type RealtimeTranscriptionFailureOrAdministrativeEventType =
  | typeof openAIRealtimeServerEventType.transcriptionFailed
  | typeof openAIRealtimeServerEventType.error
  | typeof openAIRealtimeServerEventType.rateLimitsUpdated;

export function decodeRealtimeTranscriptionServerEvent(
  message: unknown,
): RealtimeTranscriptionServerEvent {
  const record = parseEventRecord(message);
  const type = documentedEventType(record);
  return decodeDocumentedEvent(record, type);
}

function decodeDocumentedEvent(
  record: Record<string, unknown>,
  type: OpenAIRealtimeServerEventType,
): RealtimeTranscriptionServerEvent {
  switch (type) {
    case openAIRealtimeServerEventType.sessionCreated:
      return decodeSessionCreated(record);
    case openAIRealtimeServerEventType.conversationItemAdded:
      return decodeConversationItemLifecycle(record, type);
    case openAIRealtimeServerEventType.conversationItemDone:
      return decodeConversationItemLifecycle(record, type);
    case openAIRealtimeServerEventType.inputAudioBufferCommitted:
      return decodeInputAudioBufferCommitted(record);
    case openAIRealtimeServerEventType.transcriptionDelta:
      return decodeTranscriptDelta(record);
    case openAIRealtimeServerEventType.transcriptionCompleted:
      return decodeTranscriptCompleted(record);
    default:
      return decodeFailureOrAdministrativeEvent(record, type);
  }
}

function decodeFailureOrAdministrativeEvent(
  record: Record<string, unknown>,
  type: RealtimeTranscriptionFailureOrAdministrativeEventType,
): RealtimeTranscriptionServerEvent {
  switch (type) {
    case openAIRealtimeServerEventType.transcriptionFailed:
      return decodeTranscriptFailed(record);
    case openAIRealtimeServerEventType.error:
      return decodeErrorEvent(record);
    case openAIRealtimeServerEventType.rateLimitsUpdated:
      return { eventId: eventId(record), type };
    default:
      return assertNever(type);
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
    type: openAIRealtimeServerEventType.sessionCreated,
  };
}

function decodeConversationItemLifecycle(
  record: Record<string, unknown>,
  type:
    | typeof openAIRealtimeServerEventType.conversationItemAdded
    | typeof openAIRealtimeServerEventType.conversationItemDone,
): RealtimeTranscriptionServerEvent {
  const item = requiredRecord(record, "item", `${type} event`);
  const itemType = requiredString(item, "type", `${type} item`);
  const role = requiredString(item, "role", `${type} item`);
  if (itemType !== "message" || role !== "user") {
    throw new Error("Realtime transcription created an unexpected non-user message item.");
  }
  return {
    eventId: eventId(record),
    itemId: requiredString(item, "id", `${type} item`),
    type,
  };
}

function decodeInputAudioBufferCommitted(
  record: Record<string, unknown>,
): RealtimeTranscriptionServerEvent {
  return {
    eventId: eventId(record),
    itemId: requiredString(record, "item_id", "input_audio_buffer.committed event"),
    type: openAIRealtimeServerEventType.inputAudioBufferCommitted,
  };
}

function decodeTranscriptDelta(record: Record<string, unknown>): RealtimeTranscriptionServerEvent {
  return {
    contentIndex: contentIndex(record),
    delta: requiredString(record, "delta", "transcription delta event", true),
    eventId: eventId(record),
    itemId: transcriptItemId(record),
    type: openAIRealtimeServerEventType.transcriptionDelta,
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
    type: openAIRealtimeServerEventType.transcriptionCompleted,
  };
}

function decodeTranscriptFailed(record: Record<string, unknown>): RealtimeTranscriptionServerEvent {
  return {
    contentIndex: contentIndex(record),
    error: providerError(record, "transcription failed event", false),
    eventId: eventId(record),
    itemId: transcriptItemId(record),
    type: openAIRealtimeServerEventType.transcriptionFailed,
  };
}

function decodeErrorEvent(record: Record<string, unknown>): RealtimeTranscriptionServerEvent {
  return {
    error: providerError(record, "Realtime error event", true),
    eventId: eventId(record),
    type: openAIRealtimeServerEventType.error,
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

function documentedEventType(record: Record<string, unknown>): OpenAIRealtimeServerEventType {
  const type = requiredString(record, "type", "Realtime transcription event");
  if (!isOpenAIRealtimeServerEventType(type)) {
    throw new Error(`Unsupported Realtime transcription event type ${JSON.stringify(type)}.`);
  }
  validateDocumentedEnvelope(record, type);
  return type;
}

function validateDocumentedEnvelope(
  record: Record<string, unknown>,
  type: OpenAIRealtimeServerEventType,
): void {
  const contract = openAIRealtimeServerEventContracts[type];
  for (const field of contract.requiredFields) {
    if (!(field in record)) {
      throw new Error(`${type} event requires documented field ${field}.`);
    }
  }
  for (const [field, shape] of Object.entries(contract.properties)) {
    if (field in record && !matchesDocumentedShape(record[field], shape)) {
      throw new Error(`${type} event field ${field} must match documented ${shape} shape.`);
    }
  }
}

const documentedShapeValidators = {
  array: (value: unknown) => Array.isArray(value),
  boolean: (value: unknown) => typeof value === "boolean",
  integer: (value: unknown) => Number.isInteger(value),
  null: (value: unknown) => value === null,
  number: (value: unknown) => typeof value === "number",
  object: (value: unknown) => isRecord(value),
  reference: (value: unknown) => isRecord(value),
  string: (value: unknown) => typeof value === "string",
  union: documentedShapeAlwaysMatches,
  unknown: documentedShapeAlwaysMatches,
} satisfies Record<OpenAISchemaShape, (value: unknown) => boolean>;

function documentedShapeAlwaysMatches(): boolean {
  return true;
}

function matchesDocumentedShape(value: unknown, shape: OpenAISchemaShape): boolean {
  return documentedShapeValidators[shape](value);
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

function assertNever(value: never): never {
  throw new Error(`Unhandled OpenAI Realtime contract value: ${JSON.stringify(value)}`);
}
