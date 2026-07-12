import type {
  AcceptedMasterInput,
  ActiveShellInteraction,
  ReadMasterInputRoutingStateRequest,
  ShellInteractionState,
  SubmitMasterInputRequest,
} from "@generated/backend";

export const masterIpcChannels = {
  masterReadActiveInteraction: "master:read-active-interaction",
  masterSubmitInput: "master:submit-input",
  masterWaitInteraction: "master:wait-interaction",
} as const;

export interface MasterIpcContract {
  masterReadActiveInteraction: {
    args: [];
    result: ActiveShellInteraction;
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
