import type { PointerEvent, ReactNode } from "react";
import type {
  WorkspaceFloatingWindow,
  WorkspaceWindowBounds,
} from "./windowingTypes";

export type WorkspaceBottomDockWindowAction = {
  readonly id:
    | "cycle_backward"
    | "cycle_forward"
    | "show_in_canvas"
    | "undock"
    | "maximize"
    | "minimize"
    | "close";
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly testId: string;
  readonly isLayoutAction: true;
};

export type WorkspaceBottomDockRenderWindowOptions = {
  readonly actions: readonly WorkspaceBottomDockWindowAction[];
  readonly bounds: WorkspaceWindowBounds;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly titleDragAffordance: { readonly enabled: false };
};

export type WorkspaceBottomDockResizeDirection =
  "top" | "bottom" | "top_left" | "top_right" | "bottom_left" | "bottom_right";

export type WorkspaceBottomDockResizeHandlers = {
  readonly begin: (
    event: PointerEvent<HTMLDivElement>,
    window: WorkspaceFloatingWindow,
    direction: WorkspaceBottomDockResizeDirection,
  ) => void;
  readonly finish: (
    event: PointerEvent<HTMLDivElement>,
    commit: boolean,
  ) => void;
  readonly update: (event: PointerEvent<HTMLDivElement>) => void;
};

export const WORKSPACE_BOTTOM_DOCK_TITLE_DRAG_AFFORDANCE = Object.freeze({
  enabled: false as const,
});
