import type { EasyRunSnapshot } from "@generated/backend";

export interface EasyRunIpcContract {
  easyRunSnapshot: {
    args: [workspaceId: string];
    result: EasyRunSnapshot;
  };
}
