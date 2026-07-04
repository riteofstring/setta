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
  const point = {
    x: event.clientX,
    y: event.clientY,
  };
  const host = paneHostFromClickTarget(event.target);
  if (host) {
    return paneFocusTargetFromHost(host, point);
  }
  return paneFocusTargetFromDocument(event.target, point);
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

function paneFocusTargetFromDocument(
  target: EventTarget | null,
  point: PaneFocusPoint,
): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  for (const host of target.ownerDocument.querySelectorAll<HTMLElement>(visiblePaneHostSelector)) {
    const paneId = paneFocusTargetFromHost(host, point);
    if (paneId) {
      return paneId;
    }
  }
  return null;
}

function paneFocusTargetFromHost(host: HTMLElement, point: PaneFocusPoint): string | null {
  const paneId = host.dataset.paneId;
  if (!paneId) {
    return null;
  }
  return paneFocusHitContainsPoint(host.getBoundingClientRect(), point) ? paneId : null;
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
