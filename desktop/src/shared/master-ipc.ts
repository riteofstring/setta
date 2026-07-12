import type {
  AcceptedMasterInput,
  InputRoutingState,
  ReadMasterInputRoutingStateRequest,
  RecentMasterInputHistory,
  SubmitMasterInputRequest,
} from "@generated/backend";

export const masterIpcChannels = {
  masterReadRecentInputs: "master:read-recent-inputs",
  masterSubmitInput: "master:submit-input",
  masterWaitInputState: "master:wait-input-state",
} as const;

export interface MasterIpcContract {
  masterReadRecentInputs: {
    args: [];
    result: RecentMasterInputHistory;
  };
  masterSubmitInput: {
    args: [request: SubmitMasterInputRequest];
    result: AcceptedMasterInput;
  };
  masterWaitInputState: {
    args: [request: ReadMasterInputRoutingStateRequest];
    result: InputRoutingState;
  };
}
