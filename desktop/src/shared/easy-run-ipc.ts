import type {
  EasyRun,
  EasyRunSnapshot,
  StartEasyRunRequest,
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
  easyRunStop: {
    args: [request: StopEasyRunRequest];
    result: EasyRun;
  };
}
