import type {
  AcceptedMasterInput,
  RecentMasterInputHistory,
  SubmitMasterInputRequest,
} from "@generated/backend";

export const masterIpcChannels = {
  masterReadRecentInputs: "master:read-recent-inputs",
  masterSubmitInput: "master:submit-input",
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
}
