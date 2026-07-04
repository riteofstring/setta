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

export interface PaneFocusTarget {
  paneId: string;
  reveal: boolean;
}

export function paneFocusTargetFromClick(event: MouseEvent): PaneFocusTarget | null {
  const point = {
    x: event.clientX,
    y: event.clientY,
  };
  const hostAtPoint = paneHostFromPoint(eventDocument(event), point);
  if (hostAtPoint) {
    return paneFocusTargetFromHost(hostAtPoint, point);
  }
  const host = paneHostFromClickTarget(event.target);
  if (host) {
    return paneFocusTargetFromHost(host, point);
  }
  return paneFocusTargetFromDocument(eventDocument(event), point);
}

export function paneFocusHitContainsPoint(rect: PaneFocusRect, point: PaneFocusPoint): boolean {
  return pointInsideRect(rect, point);
}

export function paneFocusHitRevealsPane(rect: PaneFocusRect, point: PaneFocusPoint): boolean {
  return paneFocusHitContainsPoint(rect, point) && pointInTopStrip(rect, point.y);
}

function paneHostFromClickTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest<HTMLElement>(visiblePaneHostSelector);
}

function paneHostFromPoint(
  ownerDocument: Document | null,
  point: PaneFocusPoint,
): HTMLElement | null {
  const stack = ownerDocument?.elementsFromPoint?.(point.x, point.y) ?? [];
  for (const element of stack) {
    const host = element.closest<HTMLElement>(visiblePaneHostSelector);
    if (host && paneFocusHitContainsPoint(host.getBoundingClientRect(), point)) {
      return host;
    }
  }
  return null;
}

function paneFocusTargetFromDocument(
  ownerDocument: Document | null,
  point: PaneFocusPoint,
): PaneFocusTarget | null {
  if (!ownerDocument) {
    return null;
  }
  for (const host of ownerDocument.querySelectorAll<HTMLElement>(visiblePaneHostSelector)) {
    const focusTarget = paneFocusTargetFromHost(host, point);
    if (focusTarget) {
      return focusTarget;
    }
  }
  return null;
}

function eventDocument(event: MouseEvent): Document | null {
  if (event.target instanceof Element) {
    return event.target.ownerDocument;
  }
  if (event.currentTarget instanceof Element) {
    return event.currentTarget.ownerDocument;
  }
  return typeof document === "undefined" ? null : document;
}

function paneFocusTargetFromHost(host: HTMLElement, point: PaneFocusPoint): PaneFocusTarget | null {
  const paneId = host.dataset.paneId;
  if (!paneId || !paneFocusHitContainsPoint(host.getBoundingClientRect(), point)) {
    return null;
  }
  return {
    paneId,
    reveal: paneFocusHitRevealsPane(host.getBoundingClientRect(), point),
  };
}

function pointInsideRect(rect: PaneFocusRect, point: PaneFocusPoint): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function pointInTopStrip(rect: PaneFocusRect, y: number): boolean {
  return y <= rect.top + paneFocusTopHeightPx;
}
