import type {
  ChatPaneConfig as BackendChatPaneConfig,
  ColumnWidthSpec as BackendColumnWidthSpec,
  SurfaceKind as BackendSurfaceKind,
  TerminalPaneConfig as BackendTerminalPaneConfig,
  WorkspaceUIPaneDropPlacement,
  WorkspaceUIPaneOperation,
  WorkspaceUIPaneReorderIntent,
} from "@generated/backend";

import { productSurfaceKinds } from "./types";
import type {
  ColumnWidthSpec,
  ChatPaneConfig,
  OpenPaneRequest,
  PaneDropIntent,
  PaneInsertionPlacement,
  ProductSurfaceKind,
  SurfaceKind,
  TerminalPaneConfig,
} from "./types";
import type { WorkspaceLayoutStore } from "./layout-store";

export type WorkspaceLayoutOperation = WorkspaceUIPaneOperation | null;
export type WorkspaceLayoutAction = () => WorkspaceLayoutOperation | void;

const noPaneDropPlacement = "" as WorkspaceUIPaneDropPlacement;

export function focusPaneOperation(paneId: string): WorkspaceUIPaneOperation {
  return paneOperation("focus_pane", paneId);
}

export function movePaneOperation(
  paneId: string,
  direction: "down" | "left" | "right" | "up",
): WorkspaceUIPaneOperation {
  return paneOperation("move_pane", paneId, {
    move: { direction },
  });
}

export function closePaneOperation(paneId: string): WorkspaceUIPaneOperation {
  return paneOperation("close_pane", paneId, {
    close: { surfaceClose: "none" },
  });
}

export function openPaneFromFocusedColumnOperation(
  store: WorkspaceLayoutStore,
  request: OpenPaneRequest,
): WorkspaceUIPaneOperation | null {
  const surfaceKind = request.surfaceKind ?? "empty-frame";
  if (!isProductSurfaceKind(surfaceKind)) {
    return null;
  }
  return openPaneOperation(request, {
    adjacentToColumnId: store.focusedColumnId(),
  });
}

export function openEmptyFrameFromFocusedColumnOperation(
  store: WorkspaceLayoutStore,
): WorkspaceUIPaneOperation {
  return openPaneOperation(emptyFrameOpenRequest(), {
    adjacentToColumnId: store.focusedColumnId(),
  });
}

export function openEmptyFrameNearOperation(
  store: WorkspaceLayoutStore,
  paneId: string,
  placement: PaneInsertionPlacement,
): WorkspaceUIPaneOperation | null {
  if (placement === "right") {
    const columnId = store.toScene().paneById.get(paneId)?.columnId;
    return columnId
      ? openPaneOperation(emptyFrameOpenRequest(), { adjacentToColumnId: columnId })
      : null;
  }
  return openPaneOperation(emptyFrameOpenRequest(), {
    plane: {
      placement: placement === "above" ? "before" : "after",
      targetPaneId: paneId,
    },
  });
}

export function splitFocusedPaneOperation(
  store: WorkspaceLayoutStore,
  direction: "down" | "right" | "up" | "left",
): WorkspaceUIPaneOperation {
  const paneId = store.focusedPaneId();
  switch (direction) {
    case "down":
      return openPaneOperation(emptyFrameOpenRequest(), {
        row: { placement: "after", targetPaneId: paneId },
      });
    case "up":
      return openPaneOperation(emptyFrameOpenRequest(), {
        row: { placement: "before", targetPaneId: paneId },
      });
    case "right":
      return openEmptyFrameFromFocusedColumnOperation(store);
    case "left":
      throw new Error("workspace backend open operation does not support left split");
    default: {
      const exhaustive: never = direction;
      throw new Error(`unsupported workspace pane split direction: ${String(exhaustive)}`);
    }
  }
}

export function splitFocusedPaneToPlaneOperation(
  store: WorkspaceLayoutStore,
  direction: "down" | "up",
): WorkspaceUIPaneOperation {
  return openPaneOperation(emptyFrameOpenRequest(), {
    plane: {
      placement: direction === "up" ? "before" : "after",
      targetPaneId: store.focusedPaneId(),
    },
  });
}

export function configurePaneOperation(
  paneId: string,
  request: OpenPaneRequest,
): WorkspaceUIPaneOperation {
  return paneOperation("configure_pane", paneId, {
    configure: {
      chatConfig: request.chatConfig ? chatConfigForOperation(request.chatConfig) : null,
      subtitle: request.subtitle ?? null,
      surfaceKind: request.surfaceKind ? productSurfaceKindForOperation(request.surfaceKind) : null,
      terminalConfig: request.terminalConfig
        ? terminalConfigForOperation(request.terminalConfig)
        : null,
      title: request.title ?? null,
      tone: request.tone ?? null,
      workflowNodeDetailsConfig: request.workflowNodeDetailsConfig ?? null,
    },
  });
}

export function focusOrOpenPaneBySurfaceKindOperation(
  store: WorkspaceLayoutStore,
  surfaceKind: SurfaceKind,
  openRequest: OpenPaneRequest | null,
): WorkspaceUIPaneOperation | null {
  if (!isProductSurfaceKind(surfaceKind)) {
    return null;
  }
  const existingPane = store.toScene().panes.find((pane) => pane.surfaceKind === surfaceKind);
  if (existingPane) {
    if (openRequest?.workflowNodeDetailsConfig) {
      return configurePaneOperation(existingPane.paneId, openRequest);
    }
    return focusPaneOperation(existingPane.paneId);
  }
  if (!openRequest || !store.canOpenPane(openRequest)) {
    return null;
  }
  return openPaneFromFocusedColumnOperation(store, openRequest);
}

export function reorderPaneOperation(
  sourcePaneId: string,
  intent: PaneDropIntent,
): WorkspaceUIPaneOperation {
  return paneOperation("reorder_pane", sourcePaneId, {
    reorder: { intent: reorderIntentForOperation(intent) },
  });
}

export function resizeColumnOperation(
  columnId: string,
  widthSpec: ColumnWidthSpec,
): WorkspaceUIPaneOperation {
  return paneOperation("resize_column", "", {
    resizeColumn: {
      columnId,
      widthSpec: requiredColumnWidthSpecForOperation(widthSpec),
    },
  });
}

export function resizePaneRowOperation(
  paneId: string,
  heightPx: number | null,
): WorkspaceUIPaneOperation {
  return paneOperation("resize_pane", paneId, {
    resize: {
      heightDeltaPx: null,
      heightPx,
      heightScale: null,
      resetHeight: heightPx === null,
      split: null,
      widthSpec: null,
    },
  });
}

export function resizePaneSplitOperation(
  upperPaneId: string,
  lowerPaneId: string,
  upperWeight: number,
  lowerWeight: number,
): WorkspaceUIPaneOperation {
  return paneOperation("resize_pane", upperPaneId, {
    resize: {
      heightDeltaPx: null,
      heightPx: null,
      heightScale: null,
      resetHeight: false,
      split: {
        lowerPaneId,
        lowerWeight,
        upperWeight,
      },
      widthSpec: null,
    },
  });
}

function openPaneOperation(
  request: OpenPaneRequest,
  target: {
    adjacentToColumnId?: string;
    plane?: { placement: WorkspaceUIPaneDropPlacement; targetPaneId: string };
    row?: { placement: WorkspaceUIPaneDropPlacement; targetPaneId: string };
  } = {},
): WorkspaceUIPaneOperation {
  return paneOperation("open_pane", "", {
    open: {
      adjacentToColumnId: target.adjacentToColumnId ?? "",
      chatConfig: request.chatConfig ? chatConfigForOperation(request.chatConfig) : null,
      plane: target.plane ?? null,
      row: target.row ?? null,
      subtitle: openPaneSubtitle(request),
      surfaceKind: openPaneSurfaceKind(request),
      terminalConfig: openPaneTerminalConfig(request),
      title: openPaneTitle(request),
      tone: openPaneTone(request),
      widthSpec: openPaneWidthSpec(request, target),
      workflowNodeDetailsConfig: request.workflowNodeDetailsConfig ?? null,
    },
  });
}

function openPaneSubtitle(request: OpenPaneRequest): string {
  return request.subtitle ?? "";
}

function openPaneSurfaceKind(request: OpenPaneRequest): BackendSurfaceKind {
  return productSurfaceKindForOperation(request.surfaceKind ?? "empty-frame");
}

function openPaneTerminalConfig(request: OpenPaneRequest): BackendTerminalPaneConfig | null {
  return request.terminalConfig ? terminalConfigForOperation(request.terminalConfig) : null;
}

function openPaneTitle(request: OpenPaneRequest): string {
  return request.title ?? "New frame";
}

function openPaneTone(request: OpenPaneRequest) {
  return request.tone ?? "slate";
}

function openPaneWidthSpec(
  request: OpenPaneRequest,
  target: { row?: { placement: WorkspaceUIPaneDropPlacement; targetPaneId: string } },
): BackendColumnWidthSpec | null {
  return target.row ? null : columnWidthSpecForOperation(request.widthSpec);
}

function paneOperation(
  kind: WorkspaceUIPaneOperation["kind"],
  paneId: string,
  fields: Partial<WorkspaceUIPaneOperation> = {},
): WorkspaceUIPaneOperation {
  return {
    close: null,
    configure: null,
    kind,
    move: null,
    open: null,
    paneId,
    rename: null,
    reorder: null,
    resize: null,
    resizeColumn: null,
    ...fields,
  };
}

function reorderIntentForOperation(intent: PaneDropIntent): WorkspaceUIPaneReorderIntent {
  switch (intent.kind) {
    case "row":
      return {
        kind: "row",
        placement: intent.placement,
        planeIndex: null,
        referenceColumnId: "",
        slotIndex: null,
        slotPlacement: noPaneDropPlacement,
        targetColumnId: "",
        targetPaneId: intent.targetPaneId,
      };
    case "column":
      return {
        kind: "column",
        placement: noPaneDropPlacement,
        planeIndex: intent.planeIndex,
        referenceColumnId: "",
        slotIndex: null,
        slotPlacement: intent.slotPlacement,
        targetColumnId: intent.targetColumnId,
        targetPaneId: "",
      };
    case "plane-slot":
      return {
        kind: "plane-slot",
        placement: noPaneDropPlacement,
        planeIndex: intent.planeIndex,
        referenceColumnId: intent.referenceColumnId,
        slotIndex: intent.slotIndex,
        slotPlacement: noPaneDropPlacement,
        targetColumnId: "",
        targetPaneId: "",
      };
    case "swap":
      return {
        kind: "swap",
        placement: noPaneDropPlacement,
        planeIndex: null,
        referenceColumnId: "",
        slotIndex: null,
        slotPlacement: noPaneDropPlacement,
        targetColumnId: "",
        targetPaneId: intent.targetPaneId,
      };
    default: {
      const exhaustive: never = intent;
      throw new Error(`unsupported workspace pane drop intent: ${String(exhaustive)}`);
    }
  }
}

function emptyFrameOpenRequest(): OpenPaneRequest {
  return {
    subtitle: "choose a pane type",
    surfaceKind: "empty-frame",
    title: "New frame",
    tone: "slate",
  };
}

function productSurfaceKindForOperation(surfaceKind: SurfaceKind): BackendSurfaceKind {
  if (!isProductSurfaceKind(surfaceKind)) {
    throw new Error(`workspace backend pane operation does not support ${surfaceKind} panes`);
  }
  return surfaceKind;
}

function isProductSurfaceKind(surfaceKind: SurfaceKind): surfaceKind is ProductSurfaceKind {
  return productSurfaceKinds.includes(surfaceKind as ProductSurfaceKind);
}

function columnWidthSpecForOperation(
  widthSpec: ColumnWidthSpec | undefined,
): BackendColumnWidthSpec | null {
  if (!widthSpec) {
    return null;
  }
  return requiredColumnWidthSpecForOperation(widthSpec);
}

function requiredColumnWidthSpecForOperation(widthSpec: ColumnWidthSpec): BackendColumnWidthSpec {
  return {
    unit: widthSpec.unit,
    value: widthSpec.value,
  };
}

function chatConfigForOperation(config: ChatPaneConfig): BackendChatPaneConfig {
  return {
    conversationId: config.conversationId,
  };
}

function terminalConfigForOperation(config: TerminalPaneConfig): BackendTerminalPaneConfig {
  return {
    cwdOverride: config.cwdOverride ?? "",
    profileId: config.profileId,
    titleOverride: config.titleOverride ?? "",
  };
}
