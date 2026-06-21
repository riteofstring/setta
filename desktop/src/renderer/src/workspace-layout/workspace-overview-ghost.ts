import type { Dispatch, SetStateAction } from "react";

import type { PaneDropIntent, PaneInsertionPlacement, WorkspaceScene } from "./types";

const overviewGhostGapPx = 8;

export interface OverviewGhostTarget {
  height: number;
  left: number;
  paneId: string;
  placement: PaneInsertionPlacement;
  top: number;
  width: number;
}

interface OverviewPaneFrame {
  bottom: number;
  height: number;
  left: number;
  paneId: string;
  relativeLeft: number;
  relativeTop: number;
  right: number;
  top: number;
  width: number;
}

interface OverviewGhostPointer {
  clientX: number;
  clientY: number;
}

export function eventTargetsOverviewGhost(event: PointerEvent): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest("[data-workspace-overview-ghost]") instanceof HTMLButtonElement
  );
}

export function overviewPaneIdFromPointer(event: PointerEvent): string | null {
  return event.target instanceof Element ? visiblePaneHostId(event.target) : null;
}

export function overviewPaneIdAtPoint(event: PointerEvent, excludedPaneId?: string): string | null {
  return visiblePaneHostIdAtPoint(event.clientX, event.clientY, excludedPaneId);
}

export function setOverviewGhostTargetIfChanged(
  setTarget: Dispatch<SetStateAction<OverviewGhostTarget | null>>,
  nextTarget: OverviewGhostTarget | null,
): void {
  setTarget((currentTarget) =>
    overviewGhostTargetsMatch(currentTarget, nextTarget) ? currentTarget : nextTarget,
  );
}

export function overviewGhostTargetFromPointer(
  event: OverviewGhostPointer,
  stage: HTMLElement,
): OverviewGhostTarget | null {
  const stageRect = stage.getBoundingClientRect();
  if (!rectContainsPoint(stageRect, event.clientX, event.clientY)) {
    return null;
  }
  const panes = overviewPaneFrames(stage, stageRect);
  return (
    overviewRightGhostTarget(panes, event.clientX, event.clientY) ??
    overviewVerticalGhostTarget(panes, event.clientX, event.clientY)
  );
}

export function overviewGhostLabel(placement: PaneInsertionPlacement): string {
  switch (placement) {
    case "above":
      return "Add pane above";
    case "below":
      return "Add pane below";
    case "right":
      return "Add pane to the right";
    default:
      return assertNever(placement);
  }
}

export function overviewPaneDropIntentFromGhost(
  target: OverviewGhostTarget,
  scene: WorkspaceScene,
): PaneDropIntent | null {
  const targetPane = scene.paneById.get(target.paneId);
  const targetColumn = scene.columns.find((column) => column.columnId === targetPane?.columnId);
  if (!targetPane || !targetColumn) {
    return null;
  }
  switch (target.placement) {
    case "above":
      return {
        kind: "row",
        placement: "before",
        targetPaneId: target.paneId,
      };
    case "below":
      return {
        kind: "row",
        placement: "after",
        targetPaneId: target.paneId,
      };
    case "right":
      return {
        kind: "column",
        planeIndex: targetColumn.planeIndex,
        slotPlacement: "after",
        targetColumnId: targetColumn.columnId,
      };
    default:
      return assertNever(target.placement);
  }
}

function overviewGhostTargetsMatch(
  left: OverviewGhostTarget | null,
  right: OverviewGhostTarget | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  const frameFields = ["left", "top", "width", "height"] as const;
  return (
    left.paneId === right.paneId &&
    left.placement === right.placement &&
    frameFields.every((field) => roundedEqual(left[field], right[field]))
  );
}

function roundedEqual(left: number, right: number): boolean {
  return left === right || Math.abs(left - right) < 0.5;
}

function overviewPaneFrames(stage: HTMLElement, stageRect: DOMRect): OverviewPaneFrame[] {
  return Array.from(
    stage.querySelectorAll<HTMLElement>('[data-testid="workspace-pane-host"][data-visible="true"]'),
  ).flatMap((host) => {
    const paneId = host.dataset.paneId;
    if (!paneId) {
      return [];
    }
    const rect = host.getBoundingClientRect();
    return [
      {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        paneId,
        relativeLeft: rect.left - stageRect.left,
        relativeTop: rect.top - stageRect.top,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      } satisfies OverviewPaneFrame,
    ];
  });
}

function overviewRightGhostTarget(
  panes: OverviewPaneFrame[],
  clientX: number,
  clientY: number,
): OverviewGhostTarget | null {
  const rightMost = Math.max(...panes.map((pane) => pane.right));
  let best: OverviewGhostTarget | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const pane of panes) {
    if (!paneAcceptsRightGhost(pane, rightMost, clientX, clientY)) {
      continue;
    }
    const distance = clientX - pane.right;
    if (distance >= bestDistance) {
      continue;
    }
    bestDistance = distance;
    best = ghostTargetForPane(pane, "right");
  }
  return best;
}

function paneAcceptsRightGhost(
  pane: OverviewPaneFrame,
  rightMost: number,
  clientX: number,
  clientY: number,
): boolean {
  if (Math.abs(pane.right - rightMost) > 2 || clientY < pane.top || clientY > pane.bottom) {
    return false;
  }
  return clientX >= pane.right && clientX <= pane.right + pane.width + overviewGhostGapPx;
}

function overviewVerticalGhostTarget(
  panes: OverviewPaneFrame[],
  clientX: number,
  clientY: number,
): OverviewGhostTarget | null {
  let best: OverviewGhostTarget | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const pane of panes) {
    if (clientX < pane.left || clientX > pane.right) {
      continue;
    }
    const candidate = verticalGhostCandidateForPane(pane, clientY);
    if (!candidate || candidate.distance >= bestDistance) {
      continue;
    }
    bestDistance = candidate.distance;
    best = candidate.target;
  }
  return best;
}

function verticalGhostCandidateForPane(
  pane: OverviewPaneFrame,
  clientY: number,
): { distance: number; target: OverviewGhostTarget } | null {
  return aboveGhostCandidateForPane(pane, clientY) ?? belowGhostCandidateForPane(pane, clientY);
}

function aboveGhostCandidateForPane(
  pane: OverviewPaneFrame,
  clientY: number,
): { distance: number; target: OverviewGhostTarget } | null {
  const aboveTop = pane.top - pane.height - overviewGhostGapPx;
  if (clientY < aboveTop || clientY > pane.top) {
    return null;
  }
  return {
    distance: pane.top - clientY,
    target: ghostTargetForPane(pane, "above"),
  };
}

function belowGhostCandidateForPane(
  pane: OverviewPaneFrame,
  clientY: number,
): { distance: number; target: OverviewGhostTarget } | null {
  const belowBottom = pane.bottom + pane.height + overviewGhostGapPx;
  if (clientY < pane.bottom || clientY > belowBottom) {
    return null;
  }
  return {
    distance: clientY - pane.bottom,
    target: ghostTargetForPane(pane, "below"),
  };
}

function ghostTargetForPane(
  pane: OverviewPaneFrame,
  placement: PaneInsertionPlacement,
): OverviewGhostTarget {
  return {
    height: pane.height,
    left: pane.relativeLeft + (placement === "right" ? pane.width + overviewGhostGapPx : 0),
    paneId: pane.paneId,
    placement,
    top: ghostTargetTop(pane, placement),
    width: pane.width,
  };
}

function ghostTargetTop(pane: OverviewPaneFrame, placement: PaneInsertionPlacement): number {
  if (placement === "above") {
    return pane.relativeTop - pane.height - overviewGhostGapPx;
  }
  if (placement === "below") {
    return pane.relativeTop + pane.height + overviewGhostGapPx;
  }
  return pane.relativeTop;
}

function rectContainsPoint(rect: DOMRect, clientX: number, clientY: number): boolean {
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  );
}

function visiblePaneHostId(element: Element | null): string | null {
  const host = element?.closest<HTMLElement>(
    '[data-testid="workspace-pane-host"][data-visible="true"]',
  );
  return host?.dataset.paneId ?? null;
}

function visiblePaneHostIdAtPoint(
  clientX: number,
  clientY: number,
  excludedPaneId?: string,
): string | null {
  const elements = elementsAtPoint(clientX, clientY);
  for (const element of elements) {
    const paneId = visiblePaneHostId(element);
    if (paneId && paneId !== excludedPaneId) {
      return paneId;
    }
  }
  return null;
}

function elementsAtPoint(clientX: number, clientY: number): Element[] {
  if (typeof document.elementsFromPoint === "function") {
    return document.elementsFromPoint(clientX, clientY);
  }
  return [document.elementFromPoint(clientX, clientY)].filter(
    (element): element is Element => element !== null,
  );
}

function assertNever(value: never): never {
  throw new Error(`unhandled overview ghost placement: ${String(value)}`);
}
