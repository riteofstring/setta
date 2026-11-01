import { type PointerEvent } from "react";
import type { WorkspaceFloatingSnapResizeSeam } from "./windowingSnapLayout.js";
import {
  applyStandaloneWorkspaceWindowBounds,
  createActiveStandaloneWorkspaceSnapResize,
  focusStandaloneWorkspaceWindow,
  resolveActiveStandaloneWorkspaceSnapResizeBounds,
  type ActiveStandaloneWorkspaceSnapResize,
  type StandaloneWorkspaceWindow,
} from "./standaloneWorkspaceWindowSpaceState.js";

type SetStandaloneWindows = (
  updater: (
    windows: readonly StandaloneWorkspaceWindow[],
  ) => readonly StandaloneWorkspaceWindow[],
) => void;

export function useStandaloneWorkspaceWindowSpaceInteractions({
  activeResizeRef,
  localWindows,
  setLocalWindows,
}: {
  activeResizeRef: { current: ActiveStandaloneWorkspaceSnapResize | null };
  localWindows: readonly StandaloneWorkspaceWindow[];
  setLocalWindows: SetStandaloneWindows;
}) {
  const focusWindow = (windowId: string) => {
    setLocalWindows((windows) =>
      focusStandaloneWorkspaceWindow(windows, windowId),
    );
  };
  const handleSeamPointerDown = (
    event: PointerEvent<HTMLDivElement>,
    seam: WorkspaceFloatingSnapResizeSeam,
  ) => {
    if (event.button !== 0) {
      return;
    }
    const active = createActiveStandaloneWorkspaceSnapResize({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      seam,
      windows: localWindows,
    });
    if (!active) {
      return;
    }
    activeResizeRef.current = active;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleSeamPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = activeResizeRef.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const nextBounds = resolveActiveStandaloneWorkspaceSnapResizeBounds(
      active,
      event.clientX,
      event.clientY,
    );
    setLocalWindows((windows) =>
      applyStandaloneWorkspaceWindowBounds(windows, nextBounds),
    );
  };
  const handleSeamPointerFinish = (event: PointerEvent<HTMLDivElement>) => {
    const active = activeResizeRef.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    activeResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    focusWindow,
    handleSeamPointerDown,
    handleSeamPointerFinish,
    handleSeamPointerMove,
  };
}
