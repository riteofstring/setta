import { conversationInputModeValues, type ConversationInputMode } from "@generated/backend";

type SpeechCaptureDestination =
  | Readonly<{ type: "master" }>
  | Readonly<{
      conversationId: string;
      inputMode: ConversationInputMode;
      type: "conversation";
    }>;

export type SpeechCaptureRequest =
  | Readonly<{
      destination: Extract<SpeechCaptureDestination, { type: "master" }>;
      sourcePaneId: null;
    }>
  | Readonly<{
      destination: Extract<SpeechCaptureDestination, { type: "conversation" }>;
      sourcePaneId: string;
    }>;

export type ConversationSpeechCaptureRequest = Extract<
  SpeechCaptureRequest,
  { destination: { type: "conversation" } }
>;
export type MasterSpeechCaptureRequest = Extract<
  SpeechCaptureRequest,
  { destination: { type: "master" } }
>;

export interface SpeechCaptureRequester {
  start: (request: SpeechCaptureRequest) => Promise<void>;
}

export interface CompletedConversationSpeechTranscript {
  readonly captureSessionId: string;
  readonly request: ConversationSpeechCaptureRequest;
  readonly runtimeId: string;
  readonly transcript: string;
}

const conversationInputModes = new Set<ConversationInputMode>(conversationInputModeValues);

export function masterSpeechCaptureRequest(): MasterSpeechCaptureRequest {
  return Object.freeze({
    destination: Object.freeze({ type: "master" }),
    sourcePaneId: null,
  });
}

export function conversationSpeechCaptureRequest(
  conversationId: string,
  sourcePaneId: string,
  inputMode: ConversationInputMode,
): ConversationSpeechCaptureRequest {
  assertCaptureIdentifier("conversation", conversationId);
  assertCaptureIdentifier("source pane", sourcePaneId);
  if (!conversationInputModes.has(inputMode)) {
    throw new Error(`unsupported conversation speech input mode ${inputMode}`);
  }
  return Object.freeze({
    destination: Object.freeze({ conversationId, inputMode, type: "conversation" }),
    sourcePaneId,
  });
}

export function freezeSpeechCaptureRequest(request: SpeechCaptureRequest): SpeechCaptureRequest {
  switch (request.destination.type) {
    case "master":
      if (request.sourcePaneId !== null) {
        throw new Error("master speech capture cannot have a source pane");
      }
      return masterSpeechCaptureRequest();
    case "conversation":
      if (request.sourcePaneId === null) {
        throw new Error("conversation speech capture requires a source pane");
      }
      return conversationSpeechCaptureRequest(
        request.destination.conversationId,
        request.sourcePaneId,
        request.destination.inputMode,
      );
    default:
      return assertNever(request.destination);
  }
}

function assertCaptureIdentifier(label: string, value: string): void {
  if (value.trim() === "" || value.trim() !== value) {
    throw new Error(`speech capture ${label} id must be non-empty and normalized`);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported speech capture destination: ${JSON.stringify(value)}`);
}
