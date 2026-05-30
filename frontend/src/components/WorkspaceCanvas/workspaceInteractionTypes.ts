import type {
  WorkspaceParamRowDropTarget,
  WorkspaceSceneTarget,
} from "./workspaceController";
import type {
  WorkspaceDictRowScene,
  WorkspacePoint,
  WorkspaceRect,
  WorkspaceViewport,
} from "./workspaceSceneTypes";

export type WorkspaceResizeHandleKind = "right" | "bottom" | "corner";

export type WorkspaceCanvasPointerInteraction =
  | {
      kind: "pan-viewport";
      pointerId: number;
      startScreen: WorkspacePoint;
      startViewport: WorkspaceViewport;
    }
  | {
      kind: "minimap-pan";
      pointerId: number;
    }
  | {
      kind: "section-drag";
      pointerId: number;
      sectionIds: Array<string>;
      startWorkspace: WorkspacePoint;
      currentWorkspace: WorkspacePoint;
      startBoundsById: Record<string, WorkspaceRect>;
      currentBoundsById: Record<string, WorkspaceRect>;
      moved: boolean;
    }
  | {
      kind: "section-resize";
      pointerId: number;
      sectionId: string;
      handle: WorkspaceResizeHandleKind;
      startWorkspace: WorkspacePoint;
      startBounds: WorkspaceRect;
      currentBounds: WorkspaceRect;
      moved: boolean;
    }
  | {
      kind: "section-scrollbar";
      pointerId: number;
      sectionId: string;
      startScreenY: number;
      startOffset: number;
      scrollRange: number;
      thumbTravel: number;
    }
  | {
      kind: "param-row-drag";
      pointerId: number;
      sectionId: string;
      rowId: string;
      paramId: string;
      list: WorkspaceDictRowScene["list"];
      startScreen: WorkspacePoint;
      startWorkspace: WorkspacePoint;
      currentWorkspace: WorkspacePoint;
      rowRect: WorkspaceRect;
      draggingParamIds: Array<string>;
      parentById: Record<string, string | null>;
      moved: boolean;
      dropTarget: WorkspaceParamRowDropTarget | null;
    }
  | {
      kind: "slider";
      pointerId: number;
      target: Extract<WorkspaceSceneTarget, { kind: "control" }>;
      controlRect: WorkspaceRect;
      min: number;
      max: number;
      step: number;
      draftValue: string;
    };

export const WORKSPACE_MIN_SECTION_WIDTH = 120;
export const WORKSPACE_MIN_SECTION_HEIGHT = 80;
export const WORKSPACE_PARAM_ROW_DRAG_THRESHOLD_PX = 4;
