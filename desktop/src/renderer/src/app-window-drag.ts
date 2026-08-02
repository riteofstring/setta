import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

interface WindowDragState {
  pointerId: number;
}

const primaryPointerButton = 0;
const noDragSelector =
  ".app-no-drag, button, a, input, select, textarea, [role='button'], [data-app-window-no-drag='true']";

export function useAppWindowDragHandlers() {
  const dragStateRef = useRef<WindowDragState | null>(null);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    void window.setta.app.endWindowDrag();
  }, []);

  return {
    onLostPointerCapture: endDrag,
    onPointerCancel: endDrag,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!canStartAppWindowDrag(event)) {
        return;
      }
      dragStateRef.current = { pointerId: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
      void window.setta.app.startWindowDrag(windowDragPoint(event));
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      void window.setta.app.moveWindowDrag(windowDragPoint(event));
    },
    onPointerUp: endDrag,
  };
}

function canStartAppWindowDrag(event: ReactPointerEvent<HTMLElement>) {
  return (
    event.button === primaryPointerButton &&
    !event.defaultPrevented &&
    event.target instanceof Element &&
    event.target.closest(noDragSelector) === null
  );
}

function windowDragPoint(event: ReactPointerEvent<HTMLElement>) {
  return {
    screenX: event.screenX,
    screenY: event.screenY,
  };
}
