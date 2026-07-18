import type { ConversationInput } from "@generated/backend";

type SpeechCaptureDestination =
  | Readonly<{ type: "master" }>
  | Readonly<{
      conversationId: string;
      type: "conversation";
      workspaceId: string;
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
  cancelActiveConversationCapture?: (request: ConversationSpeechCaptureRequest) => boolean;
  start: (request: SpeechCaptureRequest) => Promise<void>;
}

export interface FinalizedConversationSpeechTranscript {
  readonly captureSessionId: string;
  readonly request: ConversationSpeechCaptureRequest;
  readonly runtimeId: string;
  readonly transcript: string;
}

export interface CompletedConversationSpeechTranscript extends FinalizedConversationSpeechTranscript {
  readonly input: ConversationInput;
}

export function masterSpeechCaptureRequest(): MasterSpeechCaptureRequest {
  return Object.freeze({
    destination: Object.freeze({ type: "master" }),
    sourcePaneId: null,
  });
}

export function conversationSpeechCaptureRequest(
  workspaceId: string,
  conversationId: string,
  sourcePaneId: string,
): ConversationSpeechCaptureRequest {
  assertCaptureIdentifier("workspace", workspaceId);
  assertCaptureIdentifier("conversation", conversationId);
  assertCaptureIdentifier("source pane", sourcePaneId);
  return Object.freeze({
    destination: Object.freeze({ conversationId, type: "conversation", workspaceId }),
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
        request.destination.workspaceId,
        request.destination.conversationId,
        request.sourcePaneId,
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
