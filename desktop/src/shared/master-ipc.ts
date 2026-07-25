import type {
  AcceptedMasterInput,
  ActiveShellInteraction,
  CancelMasterInputRequest,
  ReadMasterInputRoutingStateRequest,
  ReadMasterTranscriptRequest,
  ShellInteractionState,
  SubmitMasterInputRequest,
  Transcript,
} from "@generated/backend";

export const masterIpcChannels = {
  masterCancelInput: "master:cancel-input",
  masterReadActiveInteraction: "master:read-active-interaction",
  masterReadTranscript: "master:read-transcript",
  masterSubmitInput: "master:submit-input",
  masterWaitInteraction: "master:wait-interaction",
} as const;

export interface MasterIpcContract {
  masterCancelInput: {
    args: [request: CancelMasterInputRequest];
    result: ShellInteractionState;
  };
  masterReadActiveInteraction: {
    args: [];
    result: ActiveShellInteraction;
  };
  masterReadTranscript: {
    args: [request: ReadMasterTranscriptRequest];
    result: Transcript;
  };
  masterSubmitInput: {
    args: [request: SubmitMasterInputRequest];
    result: AcceptedMasterInput;
  };
  masterWaitInteraction: {
    args: [request: ReadMasterInputRoutingStateRequest];
    result: ShellInteractionState;
  };
}
