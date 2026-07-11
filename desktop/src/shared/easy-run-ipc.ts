import type {
  EasyRun,
  EasyRunSnapshot,
  StartEasyRunRequest,
  SteerEasyRunRequest,
  StopEasyRunRequest,
} from "@generated/backend";

export const easyRunIpcChannels = {
  easyRunSnapshot: "easy-run:snapshot",
  easyRunStart: "easy-run:start",
  easyRunSteer: "easy-run:steer",
  easyRunStop: "easy-run:stop",
} as const;

export type EasyRunSteerResult =
  | {
      kind: "success";
      run: EasyRun;
    }
  | {
      code: string;
      kind: "failure";
      message: string;
      operationApplied: boolean;
    };

export interface EasyRunIpcContract {
  easyRunSnapshot: {
    args: [workspaceId: string];
    result: EasyRunSnapshot;
  };
  easyRunStart: {
    args: [request: StartEasyRunRequest];
    result: EasyRun;
  };
  easyRunSteer: {
    args: [request: SteerEasyRunRequest];
    result: EasyRunSteerResult;
  };
  easyRunStop: {
    args: [request: StopEasyRunRequest];
    result: EasyRun;
  };
}
