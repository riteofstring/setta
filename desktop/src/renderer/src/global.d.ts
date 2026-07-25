import type { SettaAPI } from "@shared/types";

import type { PrototypeGalleryDebugBridge } from "./features/prototype-gallery/prototype-types";
import type { WorkspaceFrameMetrics } from "./workspace-layout/types";

declare global {
  interface Window {
    __settaPrototypeGalleryDebug?: PrototypeGalleryDebugBridge;
    __settaWorkspaceReadFrameMetrics?: () => WorkspaceFrameMetrics;
    __settaWorkspaceResetFrameMetrics?: () => void;
    setta: SettaAPI;
  }
}

export {};
