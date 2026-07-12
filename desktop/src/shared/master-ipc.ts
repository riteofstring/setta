import type { AcceptedMasterInput, SubmitMasterInputRequest } from "@generated/backend";

export const masterIpcChannels = {
  masterSubmitInput: "master:submit-input",
} as const;

export interface MasterIpcContract {
  masterSubmitInput: {
    args: [request: SubmitMasterInputRequest];
    result: AcceptedMasterInput;
  };
}
