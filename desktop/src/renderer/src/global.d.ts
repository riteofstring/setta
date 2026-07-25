import type { SettaAPI } from "@shared/types";

import type { WorkspaceFrameMetrics } from "./workspace-layout/types";

declare global {
  interface Window {
    __settaWorkspaceReadFrameMetrics?: () => WorkspaceFrameMetrics;
    __settaWorkspaceResetFrameMetrics?: () => void;
    setta: SettaAPI;
  }
}

export {};
