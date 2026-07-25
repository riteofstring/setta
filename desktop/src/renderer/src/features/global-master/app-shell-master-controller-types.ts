import type {
  AcceptedMasterInput,
  ActiveShellInteraction,
  CancelMasterInputRequest,
  MasterInput,
  PresentationIntent,
  PresentationResolution,
  PresentationResolutionRequest,
  ReadMasterInputRoutingStateRequest,
  ReadMasterTranscriptRequest,
  ShellInteractionState,
  SubmitMasterInputRequest,
  Transcript,
} from "@generated/backend";

import type { MasterTranscriptState } from "./app-shell-master-transcript";

export interface MasterInputFocusHints {
  focusedConversationId: string | null;
  focusedPaneId: string | null;
  focusedWorkspaceId: string | null;
}

export interface CompletedGlobalSpeechTranscript {
  captureSessionId: string;
  input: MasterInput;
  runtimeId: string;
  transcript: string;
}

export interface PendingShellMasterInput {
  input: MasterInput;
  runtimeId: string;
}

export type MasterInputSubmissionState =
  | { type: "idle" }
  | { input: MasterInput; type: "submitting" }
  | { accepted: AcceptedMasterInput; type: "accepted" }
  | {
      input: MasterInput;
      message: string;
      type: "failed";
    };

export type MasterInteractionState =
  | { type: "disconnected" }
  | { type: "loading" }
  | { type: "idle" }
  | { state: ShellInteractionState; type: "active" }
  | { message: string; type: "load_failed" }
  | { message: string; state: ShellInteractionState; type: "observation_failed" };

type MasterInputCancellationState =
  | { type: "idle" }
  | { inputId: string; type: "cancelling" }
  | { inputId: string; message: string; type: "failed" };

export interface AppShellMasterSnapshot {
  cancellation: MasterInputCancellationState;
  completedTranscript: CompletedGlobalSpeechTranscript | null;
  draft: string;
  interaction: MasterInteractionState;
  runtimeId: string | null;
  submission: MasterInputSubmissionState;
  transcript: MasterTranscriptState;
}

export interface AppShellMasterControllerDependencies {
  cancelMasterInput: (request: CancelMasterInputRequest) => Promise<ShellInteractionState>;
  createInputId: () => string;
  now: () => Date;
  presentPresentationIntent: (intent: PresentationIntent) => Promise<{ paneId: string }>;
  readActiveInteraction: (runtimeId: string) => Promise<ActiveShellInteraction>;
  readFocusHints: () => MasterInputFocusHints;
  readTranscript: (request: ReadMasterTranscriptRequest) => Promise<Transcript>;
  resolvePresentationIntent: (
    request: PresentationResolutionRequest,
  ) => Promise<PresentationResolution>;
  submitMasterInput: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
  waitShellInteraction: (
    request: ReadMasterInputRoutingStateRequest,
  ) => Promise<ShellInteractionState>;
  waitPresentationIntent: (
    request: ReadMasterInputRoutingStateRequest,
  ) => Promise<PresentationIntent>;
}
