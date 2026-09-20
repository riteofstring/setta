import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  buildWorkspaceFloatingSnapResizeBounds,
  classifyWorkspaceFloatingSnapPreset,
  type WorkspaceFloatingSnapResizeSeam,
} from "./windowingSnapLayout";
import {
  clampWorkspaceFloatingWindowBounds,
  closeWorkspaceWindow,
  createDefaultWorkspaceFloatingWindowBounds,
  maximizeWorkspaceWindow,
  minimizeWorkspaceWindow,
  reopenWorkspaceWindow,
  renameWorkspaceWindow,
  resizeWorkspaceFloatingWindow,
  restoreWorkspaceWindow,
  setWorkspaceWindowBoundsAtomically,
} from "./windowingState";
import {
  captureWorkspaceWindowPointer,
  clampWorkspaceWindowNumber,
  getWorkspaceWindowFreeResizeBounds,
  getWorkspaceWindowLocalPointer,
  getWorkspaceWindowSnapResizeCoordinateBounds,
  positionWorkspaceWindowUnsnapBounds,
  releaseWorkspaceWindowPointer,
  resolveWorkspaceWindowTitleDragNextState,
  updateWorkspaceWindowTitleDragSession,
  type WorkspaceFreeResizeDirection,
  type WorkspaceWindowDragSession,
  type WorkspaceWindowFreeResizeSession,
  type WorkspaceWindowSnapPreview,
  type WorkspaceWindowSnapResizeSession,
} from "./workspaceWindowManagerInteractions";
import {
  type WorkspaceFloatingWindow,
  type WorkspaceWindowBounds,
  type WorkspaceWindowingMutationOptions,
  type WorkspaceWindowingState,
  type WorkspaceWindowViewport,
} from "./windowingTypes";

type UseInteractionsArgs = {
  rootRef: RefObject<HTMLDivElement | null>;
  stateRef: MutableRefObject<WorkspaceWindowingState>;
  viewport: WorkspaceWindowViewport | null;
  mutationOptions: WorkspaceWindowingMutationOptions;
  emitState: (nextState: WorkspaceWindowingState) => void;
  focusWindow: (windowId: string) => void;
};

export function useWorkspaceWindowManagerInteractions({
  emitState,
  focusWindow,
  mutationOptions,
  rootRef,
  stateRef,
  viewport,
}: UseInteractionsArgs) {
  const dragSessionRef = useRef<WorkspaceWindowDragSession | null>(null);
  const freeResizeSessionRef = useRef<WorkspaceWindowFreeResizeSession | null>(
    null,
  );
  const snapResizeSessionRef = useRef<WorkspaceWindowSnapResizeSession | null>(
    null,
  );
  const previewBoundsRef = useRef<Record<string, WorkspaceWindowBounds>>({});
  const snapPreviewRef = useRef<WorkspaceWindowSnapPreview | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const [previewBoundsByWindowId, setPreviewBoundsByWindowId] = useState<
    Readonly<Record<string, WorkspaceWindowBounds>>
  >({});
  const [snapPreview, setSnapPreview] =
    useState<WorkspaceWindowSnapPreview | null>(null);

  const schedulePreview = useCallback(() => {
    if (previewFrameRef.current !== null) return;
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
    previewFrameRef.current = schedule(() => {
      previewFrameRef.current = null;
      setPreviewBoundsByWindowId({ ...previewBoundsRef.current });
      setSnapPreview(snapPreviewRef.current);
    });
  }, []);
  const setPreviews = useCallback(
    (boundsByWindowId: Readonly<Record<string, WorkspaceWindowBounds>>) => {
      previewBoundsRef.current = {
        ...previewBoundsRef.current,
        ...boundsByWindowId,
      };
      schedulePreview();
    },
    [schedulePreview],
  );
  const clearPreviews = useCallback(
    (ids: readonly string[]) => {
      const next = { ...previewBoundsRef.current };
      for (const id of ids) delete next[id];
      previewBoundsRef.current = next;
      schedulePreview();
    },
    [schedulePreview],
  );
  const updateSnapPreview = useCallback(
    (next: WorkspaceWindowSnapPreview | null) => {
      snapPreviewRef.current = next;
      schedulePreview();
    },
    [schedulePreview],
  );

  useEffect(
    () => () => {
      if (previewFrameRef.current === null) return;
      const cancel =
        typeof window.cancelAnimationFrame === "function"
          ? window.cancelAnimationFrame.bind(window)
          : window.clearTimeout.bind(window);
      cancel(previewFrameRef.current);
    },
    [],
  );

  const activateWindowAction = useCallback(
    (
      windowId: string,
      action: "close" | "maximize" | "minimize" | "restore",
    ) => {
      const state = stateRef.current;
      const next =
        action === "close"
          ? closeWorkspaceWindow(state, windowId, mutationOptions)
          : action === "maximize"
            ? maximizeWorkspaceWindow(state, windowId, mutationOptions)
            : action === "minimize"
              ? minimizeWorkspaceWindow(state, windowId, mutationOptions)
              : restoreWorkspaceWindow(state, windowId, mutationOptions);
      emitState(next);
    },
    [emitState, mutationOptions, stateRef],
  );
  const reopenMinimizedWindow = useCallback(
    (windowId: string) => {
      const state = stateRef.current;
      const window = state.windows.find(
        (candidate) => candidate.id === windowId,
      );
      if (!window?.isMinimized || window.isClosed) return;
      emitState(reopenWorkspaceWindow(state, windowId));
      focusWindow(windowId);
    },
    [emitState, focusWindow, stateRef],
  );
  const commitTitle = useCallback(
    (windowId: string, title: string) =>
      emitState(
        renameWorkspaceWindow(
          stateRef.current,
          windowId,
          title,
          mutationOptions,
        ),
      ),
    [emitState, mutationOptions, stateRef],
  );

  const handleTitlePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, window: WorkspaceFloatingWindow) => {
      const root = rootRef.current;
      if (
        !root ||
        !viewport ||
        event.button !== 0 ||
        event.detail > 1 ||
        window.placement !== "floating"
      ) {
        return;
      }
      const pointer = getWorkspaceWindowLocalPointer(event, root);
      const startedSnapped =
        classifyWorkspaceFloatingSnapPreset(window.bounds, viewport) !== null;
      const restore = startedSnapped
        ? clampWorkspaceFloatingWindowBounds(
            window.lastUnsnappedBounds ??
              createDefaultWorkspaceFloatingWindowBounds(viewport),
            viewport,
          )
        : null;
      dragSessionRef.current = {
        dragBoundsStart: restore
          ? positionWorkspaceWindowUnsnapBounds(
              window.bounds,
              restore,
              pointer,
              viewport,
            )
          : window.bounds,
        hasActivatedUnsnap: !startedSnapped,
        lastBounds: window.bounds,
        pointerId: event.pointerId,
        restoreBoundsOnUnsnap: restore,
        startBounds: window.bounds,
        startPointer: pointer,
        startedSnapped,
        windowId: window.id,
      };
      event.stopPropagation();
      event.preventDefault();
      captureWorkspaceWindowPointer(event.currentTarget, event.pointerId);
    },
    [rootRef, viewport],
  );
  const handleTitlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const session = dragSessionRef.current;
      const root = rootRef.current;
      if (
        !session ||
        !root ||
        !viewport ||
        session.pointerId !== event.pointerId
      ) {
        return;
      }
      const pointer = getWorkspaceWindowLocalPointer(event, root);
      updateSnapPreview(
        updateWorkspaceWindowTitleDragSession(session, pointer, viewport),
      );
      if (session.hasActivatedUnsnap) {
        setPreviews({ [session.windowId]: session.lastBounds });
      }
    },
    [rootRef, setPreviews, updateSnapPreview, viewport],
  );
  const finishTitleDrag = useCallback(
    (event: PointerEvent<HTMLElement>, commit: boolean) => {
      const session = dragSessionRef.current;
      if (!session || !viewport || session.pointerId !== event.pointerId)
        return;
      const committedSnapPreview = snapPreviewRef.current;
      clearPreviews([session.windowId]);
      updateSnapPreview(null);
      dragSessionRef.current = null;
      releaseWorkspaceWindowPointer(event.currentTarget, event.pointerId);
      if (commit) {
        window.setTimeout(() => {
          const nextState = resolveWorkspaceWindowTitleDragNextState(
            session,
            committedSnapPreview,
            stateRef.current,
            viewport,
            mutationOptions,
          );
          if (nextState) emitState(nextState);
          focusWindow(session.windowId);
        }, 0);
      }
    },
    [
      clearPreviews,
      emitState,
      focusWindow,
      mutationOptions,
      stateRef,
      updateSnapPreview,
      viewport,
    ],
  );

  const handleFreeResizePointerDown = useCallback(
    (
      event: PointerEvent<HTMLDivElement>,
      window: WorkspaceFloatingWindow,
      direction: WorkspaceFreeResizeDirection,
    ) => {
      const root = rootRef.current;
      if (!root || !viewport || event.button !== 0) return;
      freeResizeSessionRef.current = {
        direction,
        lastBounds: window.bounds,
        pointerId: event.pointerId,
        startBounds: window.bounds,
        startPointer: getWorkspaceWindowLocalPointer(event, root),
        windowId: window.id,
      };
      event.stopPropagation();
      event.preventDefault();
      captureWorkspaceWindowPointer(event.currentTarget, event.pointerId);
    },
    [rootRef, viewport],
  );
  const handleFreeResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const session = freeResizeSessionRef.current;
      const root = rootRef.current;
      if (
        !session ||
        !root ||
        !viewport ||
        session.pointerId !== event.pointerId
      ) {
        return;
      }
      const pointer = getWorkspaceWindowLocalPointer(event, root);
      session.lastBounds = getWorkspaceWindowFreeResizeBounds(
        session.startBounds,
        session.direction,
        {
          x: pointer.x - session.startPointer.x,
          y: pointer.y - session.startPointer.y,
        },
        viewport,
      );
      setPreviews({ [session.windowId]: session.lastBounds });
    },
    [rootRef, setPreviews, viewport],
  );
  const finishFreeResize = useCallback(
    (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
      const session = freeResizeSessionRef.current;
      if (!session || !viewport || session.pointerId !== event.pointerId)
        return;
      clearPreviews([session.windowId]);
      freeResizeSessionRef.current = null;
      releaseWorkspaceWindowPointer(event.currentTarget, event.pointerId);
      if (commit) {
        globalThis.setTimeout(() => {
          emitState(
            resizeWorkspaceFloatingWindow(
              stateRef.current,
              session.windowId,
              session.lastBounds,
              viewport,
              mutationOptions,
            ),
          );
          focusWindow(session.windowId);
        }, 0);
      }
    },
    [
      clearPreviews,
      emitState,
      focusWindow,
      mutationOptions,
      stateRef,
      viewport,
    ],
  );

  const handleSnapResizePointerDown = useCallback(
    (
      event: PointerEvent<HTMLDivElement>,
      seam: WorkspaceFloatingSnapResizeSeam,
    ) => {
      if (event.button !== 0) return;
      const startBoundsByWindowId: Record<string, WorkspaceWindowBounds> = {};
      for (const id of [...seam.leadingWindowIds, ...seam.trailingWindowIds]) {
        const window = stateRef.current.windows.find(
          (candidate) => candidate.id === id,
        );
        if (!window) return;
        startBoundsByWindowId[id] = window.bounds;
      }
      const coordinateBounds = getWorkspaceWindowSnapResizeCoordinateBounds(
        seam,
        startBoundsByWindowId,
      );
      const root = rootRef.current;
      if (!coordinateBounds || !root) return;
      const pointer = getWorkspaceWindowLocalPointer(event, root);
      snapResizeSessionRef.current = {
        lastBoundsByWindowId: startBoundsByWindowId,
        maximumCoordinate: coordinateBounds.maximum,
        minimumCoordinate: coordinateBounds.minimum,
        pointerId: event.pointerId,
        seam,
        startBoundsByWindowId,
        startPointerPosition: seam.axis === "vertical" ? pointer.x : pointer.y,
      };
      event.stopPropagation();
      event.preventDefault();
      captureWorkspaceWindowPointer(event.currentTarget, event.pointerId);
    },
    [rootRef, stateRef],
  );
  const handleSnapResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const session = snapResizeSessionRef.current;
      const root = rootRef.current;
      if (!session || !root || session.pointerId !== event.pointerId) return;
      const pointer = getWorkspaceWindowLocalPointer(event, root);
      const pointerPosition =
        session.seam.axis === "vertical" ? pointer.x : pointer.y;
      const coordinate = clampWorkspaceWindowNumber(
        session.seam.coordinate +
          pointerPosition -
          session.startPointerPosition,
        session.minimumCoordinate,
        session.maximumCoordinate,
      );
      session.lastBoundsByWindowId = buildWorkspaceFloatingSnapResizeBounds(
        session.seam,
        session.startBoundsByWindowId,
        coordinate,
      );
      setPreviews(session.lastBoundsByWindowId);
    },
    [rootRef, setPreviews],
  );
  const finishSnapResize = useCallback(
    (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
      const session = snapResizeSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      clearPreviews([
        ...session.seam.leadingWindowIds,
        ...session.seam.trailingWindowIds,
      ]);
      snapResizeSessionRef.current = null;
      releaseWorkspaceWindowPointer(event.currentTarget, event.pointerId);
      if (commit) {
        globalThis.setTimeout(() => {
          emitState(
            setWorkspaceWindowBoundsAtomically(
              stateRef.current,
              Object.entries(session.lastBoundsByWindowId).map(
                ([id, bounds]) => ({
                  bounds,
                  id,
                }),
              ),
              mutationOptions,
            ),
          );
        }, 0);
      }
    },
    [clearPreviews, emitState, mutationOptions, stateRef],
  );

  return {
    activateWindowAction,
    commitTitle,
    finishFreeResize,
    finishSnapResize,
    finishTitleDrag,
    handleFreeResizePointerDown,
    handleFreeResizePointerMove,
    handleSnapResizePointerDown,
    handleSnapResizePointerMove,
    handleTitlePointerDown,
    handleTitlePointerMove,
    previewBoundsByWindowId,
    reopenMinimizedWindow,
    snapPreview,
  };
}
