import type {
  AcceptedMasterInput,
  ActiveShellInteraction,
  PresentationIntent,
  PresentationResolution,
  PresentationResolutionRequest,
  ReadMasterInputRoutingStateRequest,
  ShellInteractionState,
  SubmitMasterInputRequest,
} from "@generated/backend";

export const masterIpcChannels = {
  masterReadActiveInteraction: "master:read-active-interaction",
  masterResolvePresentation: "master:resolve-presentation",
  masterSubmitInput: "master:submit-input",
  masterWaitInteraction: "master:wait-interaction",
  masterWaitPresentation: "master:wait-presentation",
} as const;

export interface MasterIpcContract {
  masterReadActiveInteraction: {
    args: [];
    result: ActiveShellInteraction;
  };
  masterResolvePresentation: {
    args: [request: PresentationResolutionRequest];
    result: PresentationResolution;
  };
  masterSubmitInput: {
    args: [request: SubmitMasterInputRequest];
    result: AcceptedMasterInput;
  };
  masterWaitInteraction: {
    args: [request: ReadMasterInputRoutingStateRequest];
    result: ShellInteractionState;
  };
  masterWaitPresentation: {
    args: [request: ReadMasterInputRoutingStateRequest];
    result: PresentationIntent;
  };
}
