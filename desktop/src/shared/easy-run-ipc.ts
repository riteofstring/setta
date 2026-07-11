import type {
  EasyRun,
  EasyRunSnapshot,
  StartEasyRunRequest,
  SteerEasyRunRequest,
  StopEasyRunRequest,
} from "@generated/backend";

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
    result: EasyRun;
  };
  easyRunStop: {
    args: [request: StopEasyRunRequest];
    result: EasyRun;
  };
}
