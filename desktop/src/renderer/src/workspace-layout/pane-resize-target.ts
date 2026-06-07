const visiblePaneHostSelector = '[data-testid="workspace-pane-host"][data-visible="true"]';
const resizeHandleSelector = "[data-workspace-pane-resize-axis]";

export type PaneResizeTarget =
  | {
      axis: "horizontal";
      paneId: string;
      width: number;
    }
  | {
      adjacentPaneId: string;
      afterHeight: number;
      axis: "vertical";
      beforeHeight: number;
      paneId: string;
    };

interface ResizeHandleDataset {
  adjacentPaneId?: string;
  workspacePaneResizeAxis?: string;
  paneId?: string;
}

export function paneResizeTargetFromPointer(event: PointerEvent): PaneResizeTarget | null {
  const handle = paneResizeHandleFromPointerTarget(event.target);
  if (!handle) {
    return null;
  }
  const dataset = handle.dataset as ResizeHandleDataset;
  if (dataset.workspacePaneResizeAxis === "horizontal") {
    return horizontalResizeTargetFromHandle(handle, dataset);
  }
  if (dataset.workspacePaneResizeAxis === "vertical") {
    return verticalResizeTargetFromHandle(handle, dataset);
  }
  return null;
}

function horizontalResizeTargetFromHandle(
  handle: HTMLElement,
  dataset: ResizeHandleDataset,
): PaneResizeTarget | null {
  const paneId = dataset.paneId;
  const host = paneId
    ? visiblePaneHostByPaneId(handle.ownerDocument, paneId)
    : handle.closest<HTMLElement>(visiblePaneHostSelector);
  if (!host || !paneId) {
    return null;
  }
  return {
    axis: "horizontal",
    paneId,
    width: host.getBoundingClientRect().width,
  };
}

function verticalResizeTargetFromHandle(
  handle: HTMLElement,
  dataset: ResizeHandleDataset,
): PaneResizeTarget | null {
  const paneId = dataset.paneId;
  const host = paneId
    ? visiblePaneHostByPaneId(handle.ownerDocument, paneId)
    : handle.closest<HTMLElement>(visiblePaneHostSelector);
  const adjacentPaneId = dataset.adjacentPaneId;
  if (!host || !paneId || !adjacentPaneId) {
    return null;
  }
  const adjacentHost = visiblePaneHostByPaneId(handle.ownerDocument, adjacentPaneId);
  if (!adjacentHost) {
    return null;
  }
  return {
    adjacentPaneId,
    afterHeight: adjacentHost.getBoundingClientRect().height,
    axis: "vertical",
    beforeHeight: host.getBoundingClientRect().height,
    paneId,
  };
}

function paneResizeHandleFromPointerTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest<HTMLElement>(resizeHandleSelector);
}

function visiblePaneHostByPaneId(document: Document, paneId: string): HTMLElement | null {
  for (const host of document.querySelectorAll<HTMLElement>(visiblePaneHostSelector)) {
    if (host.dataset.paneId === paneId) {
      return host;
    }
  }
  return null;
}
