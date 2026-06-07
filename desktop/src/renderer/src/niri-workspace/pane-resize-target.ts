const paneResizeHandleWidthPx = 10;
const visiblePaneHostSelector = '[data-testid="niri-fake-pane-host"][data-visible="true"]';

export interface PaneResizeTarget {
  paneId: string;
  width: number;
}

export function paneResizeTargetFromPointer(event: PointerEvent): PaneResizeTarget | null {
  const host = paneHostFromPointerTarget(event.target);
  const paneId = host?.dataset.paneId;
  if (!host || !paneId) {
    return null;
  }
  const rect = host.getBoundingClientRect();
  if (!pointInResizeHandle(rect, event.clientX)) {
    return null;
  }
  return {
    paneId,
    width: rect.width,
  };
}

function paneHostFromPointerTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest<HTMLElement>(visiblePaneHostSelector);
}

function pointInResizeHandle(rect: DOMRect, x: number): boolean {
  return x >= rect.right - paneResizeHandleWidthPx && x <= rect.right;
}
