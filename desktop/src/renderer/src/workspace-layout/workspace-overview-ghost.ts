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

export interface OverviewPaneFrame {
  bottom: number;
  height: number;
  left: number;
  paneId: string;
  planeIndex: number;
  relativeLeft: number;
  relativeTop: number;
  right: number;
  top: number;
  width: number;
}

export function eventTargetsOverviewGhost(event: PointerEvent): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest("[data-workspace-overview-ghost]") instanceof HTMLButtonElement
  );
}

export function overviewPaneIdAtPoint(event: PointerEvent, excludedPaneId?: string): string | null {
  return visiblePaneHostIdAtPoint(event.clientX, event.clientY, excludedPaneId);
}

// Snapshot the visible overview pane frames (screen + stage-relative geometry).
// Captured once when an insert preview activates so subsequent hover resolution
// is a pure function of the committed layout -- the reflow can't shift panes under
// the cursor and oscillate the resolved slot.
export function captureOverviewPaneFrames(stage: HTMLElement): OverviewPaneFrame[] {
  return overviewPaneFrames(stage, stage.getBoundingClientRect());
}

// Pure geometry: pick the "add pane" ghost slot for a pointer over a set of
// overview pane frames. Split out from the DOM extraction above so the slot
// math (including the non-overlap guard) is testable without a laid-out DOM.
export function overviewGhostTargetFromFrames(
  panes: OverviewPaneFrame[],
  clientX: number,
  clientY: number,
): OverviewGhostTarget | null {
  if (panes.length === 0) {
    return null;
  }
  return (
    overviewRightGhostTarget(panes, clientX, clientY) ??
    overviewVerticalGhostTarget(panes, clientX, clientY)
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

function overviewPaneFrames(stage: HTMLElement, stageRect: DOMRect): OverviewPaneFrame[] {
  return Array.from(
    stage.querySelectorAll<HTMLElement>('[data-testid="workspace-pane-host"][data-visible="true"]'),
  ).flatMap((host) => {
    if (host.dataset.dragSource === "true") {
      return [];
    }
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
        planeIndex: paneFramePlaneIndex(host),
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
    const candidate = ghostTargetForPane(pane, "right", planeBandForPane(pane, panes));
    if (ghostTargetOverlapsAnyPane(candidate, panes)) {
      continue;
    }
    bestDistance = distance;
    best = candidate;
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
    const candidate = verticalGhostCandidateForPane(pane, clientY, panes);
    if (!candidate || candidate.distance >= bestDistance) {
      continue;
    }
    if (ghostTargetOverlapsAnyPane(candidate.target, panes)) {
      continue;
    }
    bestDistance = candidate.distance;
    best = candidate.target;
  }
  return best;
}

// A ghost "add pane here" slot must land in empty space, never on top of an
// existing pane. In a dense overview grid the above/below/right detection bands
// extend a full pane width/height into the neighbouring row or column, so the
// computed slot would otherwise overlay (and steal pointer events from) the
// adjacent pane. Reject any candidate whose rect intersects a real pane so the
// affordance only appears at the outer edges of the grid.
function ghostTargetOverlapsAnyPane(
  target: OverviewGhostTarget,
  panes: OverviewPaneFrame[],
): boolean {
  const left = target.left + overviewGhostGapPx;
  const right = target.left + target.width - overviewGhostGapPx;
  const top = target.top + overviewGhostGapPx;
  const bottom = target.top + target.height - overviewGhostGapPx;
  return panes.some(
    (pane) =>
      left < pane.relativeLeft + pane.width &&
      right > pane.relativeLeft &&
      top < pane.relativeTop + pane.height &&
      bottom > pane.relativeTop,
  );
}

function verticalGhostCandidateForPane(
  pane: OverviewPaneFrame,
  clientY: number,
  panes: OverviewPaneFrame[],
): { distance: number; target: OverviewGhostTarget } | null {
  return (
    aboveGhostCandidateForPane(pane, clientY, panes) ??
    belowGhostCandidateForPane(pane, clientY, panes)
  );
}

function aboveGhostCandidateForPane(
  pane: OverviewPaneFrame,
  clientY: number,
  panes: OverviewPaneFrame[],
): { distance: number; target: OverviewGhostTarget } | null {
  const band = planeBandForPane(pane, panes);
  const height = band.bottom - band.top;
  // The hit region is the full row height of empty space above the column, not
  // just the (possibly half-height) anchor pane, so the slot is hoverable across
  // the whole row.
  const aboveTop = band.top - height - overviewGhostGapPx;
  if (clientY < aboveTop || clientY > band.top) {
    return null;
  }
  return {
    distance: pane.top - clientY,
    target: ghostTargetForPane(pane, "above", band),
  };
}

function belowGhostCandidateForPane(
  pane: OverviewPaneFrame,
  clientY: number,
  panes: OverviewPaneFrame[],
): { distance: number; target: OverviewGhostTarget } | null {
  const band = planeBandForPane(pane, panes);
  const belowBottom = band.bottom + (band.bottom - band.top) + overviewGhostGapPx;
  if (clientY < band.bottom || clientY > belowBottom) {
    return null;
  }
  return {
    distance: clientY - pane.bottom,
    target: ghostTargetForPane(pane, "below", band),
  };
}

function ghostTargetForPane(
  pane: OverviewPaneFrame,
  placement: PaneInsertionPlacement,
  band: PaneRowBand,
): OverviewGhostTarget {
  const height = band.bottom - band.top;
  return {
    height,
    left: pane.relativeLeft + (placement === "right" ? pane.width + overviewGhostGapPx : 0),
    paneId: pane.paneId,
    placement,
    top: ghostTargetTop(placement, band, height),
    width: pane.width,
  };
}

function ghostTargetTop(
  placement: PaneInsertionPlacement,
  band: PaneRowBand,
  height: number,
): number {
  if (placement === "above") {
    return band.top - height - overviewGhostGapPx;
  }
  if (placement === "below") {
    return band.bottom + overviewGhostGapPx;
  }
  // The "right" slot is a brand-new full-row column, so align it to the top of
  // the row (plane) band rather than to the anchor pane's own (possibly mid-row)
  // top.
  return band.top;
}

interface PaneRowBand {
  bottom: number;
  planeIndex: number;
  top: number;
}

// The "add pane" affordance fills an empty slot in the overview grid. Both its
// hit region and its box span the full height of the row (plane) the anchor pane
// belongs to rather than that single pane, so a slot above/below/beside a stacked
// (half-height) column still reads - and stays hoverable - as a full-height row
// instead of a short stub. Each pane carries its plane index, so the row band is
// the vertical span of every pane sharing the anchor's plane; a lone pane falls
// back to its own rect.
function planeBandForPane(pane: OverviewPaneFrame, panes: OverviewPaneFrame[]): PaneRowBand {
  return (
    rowBandsByPlane(panes).find((band) => band.planeIndex === pane.planeIndex) ?? {
      bottom: pane.relativeTop + pane.height,
      planeIndex: pane.planeIndex,
      top: pane.relativeTop,
    }
  );
}

function rowBandsByPlane(panes: OverviewPaneFrame[]): PaneRowBand[] {
  const bands = new Map<number, PaneRowBand>();
  for (const pane of panes) {
    const top = pane.relativeTop;
    const bottom = pane.relativeTop + pane.height;
    const band = bands.get(pane.planeIndex);
    if (band) {
      band.top = Math.min(band.top, top);
      band.bottom = Math.max(band.bottom, bottom);
    } else {
      bands.set(pane.planeIndex, { bottom, planeIndex: pane.planeIndex, top });
    }
  }
  return [...bands.values()];
}

function paneFramePlaneIndex(host: HTMLElement): number {
  const parsed = Number.parseInt(host.dataset.planeIndex ?? "", 10);
  return Number.isInteger(parsed) ? parsed : 0;
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
