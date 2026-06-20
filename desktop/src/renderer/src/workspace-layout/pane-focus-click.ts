const paneFocusEdgeWidthPx = 12;
const paneFocusTopHeightPx = 30;
const visiblePaneHostSelector = '[data-testid="workspace-pane-host"][data-visible="true"]';

interface PaneFocusPoint {
  x: number;
  y: number;
}

interface PaneFocusRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function paneFocusTargetFromClick(event: MouseEvent): string | null {
  const host = paneHostFromClickTarget(event.target);
  const paneId = host?.dataset.paneId;
  if (!host || !paneId) {
    return null;
  }
  return paneFocusHitContainsPoint(host.getBoundingClientRect(), {
    x: event.clientX,
    y: event.clientY,
  })
    ? paneId
    : null;
}

export function paneFocusHitContainsPoint(rect: PaneFocusRect, point: PaneFocusPoint): boolean {
  return (
    pointInsideRect(rect, point) &&
    (pointInLeftEdge(rect, point.x) ||
      pointInRightEdge(rect, point.x) ||
      pointInTopStrip(rect, point.y) ||
      pointInBottomEdge(rect, point.y))
  );
}

function paneHostFromClickTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest<HTMLElement>(visiblePaneHostSelector);
}

function pointInsideRect(rect: PaneFocusRect, point: PaneFocusPoint): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function pointInLeftEdge(rect: PaneFocusRect, x: number): boolean {
  return x <= rect.left + paneFocusEdgeWidthPx;
}

function pointInRightEdge(rect: PaneFocusRect, x: number): boolean {
  return x >= rect.right - paneFocusEdgeWidthPx;
}

function pointInTopStrip(rect: PaneFocusRect, y: number): boolean {
  return y <= rect.top + paneFocusTopHeightPx;
}

function pointInBottomEdge(rect: PaneFocusRect, y: number): boolean {
  return y >= rect.bottom - paneFocusEdgeWidthPx;
}
