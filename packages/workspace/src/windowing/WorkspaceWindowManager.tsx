import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWorkspaceHost } from "../workspaceHostContext";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";
import {
  WorkspaceWindowManagerWindows,
  WorkspaceWindowManagerSnapPreview,
  WorkspaceWindowManagerSnapResizeHandle,
  type WorkspaceWindowRenderers,
} from "./WorkspaceWindowManagerParts";
import {
  areWorkspaceWindowBoundsEqual,
  areWorkspaceWindowViewportsEqual,
  canHandleWorkspaceWindowShortcut,
  getFocusedWorkspaceWindow,
  isWorkspaceWindowExclusivelyTop,
  isWorkspaceWindowPresentationExclusivelyTop,
  resolveWorkspaceWindowShortcut,
} from "./workspaceWindowManagerInteractions";
import {
  buildWorkspaceFloatingSnapResizeSeams,
  classifyWorkspaceFloatingSnapPreset,
  denormalizeWorkspaceWindowBounds,
  normalizeWorkspaceWindowBounds,
} from "./windowingSnapLayout";
import {
  clampWorkspaceFloatingWindowBounds,
  focusWorkspaceWindow,
  getWorkspaceWindowStackingOrder,
  setWorkspaceWindowBoundsAtomically,
  snapWorkspaceFloatingWindow,
} from "./windowingState";
import { useWorkspaceWindowManagerInteractions } from "./useWorkspaceWindowManagerInteractions";
import {
  createWorkspaceWindowViewport,
  isWorkspaceWindowVisible,
  type WorkspaceFloatingWindow,
  type WorkspaceWindowBoundaryInsets,
  type WorkspaceWindowBounds,
  type WorkspaceWindowingMutationOptions,
  type WorkspaceWindowingState,
  type WorkspaceWindowViewport,
  WorkspaceWindowingError,
} from "./windowingTypes";

const EMPTY_INSETS: WorkspaceWindowBoundaryInsets = Object.freeze({
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
});

export type {
  WorkspaceWindowRenderer,
  WorkspaceWindowRenderers,
} from "./WorkspaceWindowManagerParts";

export type WorkspaceWindowManagerProps = {
  state: WorkspaceWindowingState;
  onStateChange: (nextState: WorkspaceWindowingState) => void;
  renderers: WorkspaceWindowRenderers;
  boundaryInsets?: WorkspaceWindowBoundaryInsets;
  // Defaults to true. When false, focus remains available while layout mutations are hidden.
  layoutEditable?: boolean;
  // Defaults to true. Hosts can opt out when they provide their own command surface.
  shortcuts?: boolean;
  ariaLabel?: string;
  className?: string;
};

function joinClassNames(
  ...classNames: ReadonlyArray<string | undefined | false>
): string {
  return classNames.filter(Boolean).join(" ");
}

function assertWindowRenderers(renderers: WorkspaceWindowRenderers): void {
  for (const [surfaceKind, renderer] of Object.entries(renderers)) {
    if (surfaceKind.trim() === "" || typeof renderer !== "function") {
      throw new WorkspaceWindowingError(
        "invalid_input",
        `Workspace window renderer ${JSON.stringify(surfaceKind)} must be a nonblank function key.`,
      );
    }
  }
}

type WorkspaceWindowShortcut = NonNullable<
  ReturnType<typeof resolveWorkspaceWindowShortcut>
>;

type WorkspaceWindowActionHandler = (
  windowId: string,
  action: "close" | "maximize" | "minimize" | "restore",
) => void;

function runWorkspaceWindowShortcut({
  activateWindowAction,
  command,
  emitState,
  mutationOptions,
  state,
  viewport,
  window,
}: {
  activateWindowAction: WorkspaceWindowActionHandler;
  command: WorkspaceWindowShortcut;
  emitState: (state: WorkspaceWindowingState) => void;
  mutationOptions: WorkspaceWindowingMutationOptions;
  state: WorkspaceWindowingState;
  viewport: WorkspaceWindowViewport;
  window: WorkspaceFloatingWindow;
}): void {
  if (command.type === "toggle_maximize") {
    activateWindowAction(
      window.id,
      window.placement === "maximized" ? "restore" : "maximize",
    );
    return;
  }
  if (command.type === "minimize") {
    activateWindowAction(window.id, "minimize");
    return;
  }
  emitState(
    snapWorkspaceFloatingWindow(
      state,
      window.id,
      command.preset,
      viewport,
      mutationOptions,
    ),
  );
}

export function WorkspaceWindowManager({
  ariaLabel = "Workspace windows",
  boundaryInsets = EMPTY_INSETS,
  className,
  layoutEditable = true,
  onStateChange,
  renderers,
  shortcuts = true,
  state,
}: WorkspaceWindowManagerProps) {
  const host = useWorkspaceHost();
  assertWindowRenderers(renderers);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const onStateChangeRef = useRef(onStateChange);
  const focusedWindowIdRef = useRef<string | null>(null);
  const previousViewportRef = useRef<WorkspaceWindowViewport | null>(null);
  const readOnlyResizeBoundsRef = useRef<Record<string, WorkspaceWindowBounds>>(
    {},
  );
  const readOnlyFocusZIndexRef = useRef<Record<string, number>>({});
  const nextReadOnlyFocusZIndexRef = useRef(1);
  const [hostSize, setHostSize] = useState<{
    height: number;
    width: number;
  } | null>(null);
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null);
  const [readOnlyResizeBoundsByWindowId, setReadOnlyResizeBoundsByWindowId] =
    useState<Readonly<Record<string, WorkspaceWindowBounds>>>({});
  const [readOnlyFocusZIndexByWindowId, setReadOnlyFocusZIndexByWindowId] =
    useState<Readonly<Record<string, number>>>({});
  stateRef.current = state;
  onStateChangeRef.current = onStateChange;

  const viewport = useMemo<WorkspaceWindowViewport | null>(() => {
    if (!hostSize || hostSize.width <= 0 || hostSize.height <= 0) return null;
    return createWorkspaceWindowViewport({
      height: hostSize.height,
      insets: boundaryInsets,
      width: hostSize.width,
    });
  }, [boundaryInsets, hostSize]);
  const mutationOptions = useMemo<WorkspaceWindowingMutationOptions>(
    () => ({ layoutEditable }),
    [layoutEditable],
  );
  const emitState = useCallback((nextState: WorkspaceWindowingState) => {
    if (nextState === stateRef.current) return;
    stateRef.current = nextState;
    onStateChangeRef.current(nextState);
  }, []);
  const focusWindow = useCallback(
    (windowId: string) => {
      const window = stateRef.current.windows.find(
        (candidate) => candidate.id === windowId,
      );
      if (!window || !isWorkspaceWindowVisible(window)) return;
      focusedWindowIdRef.current = windowId;
      setFocusedWindowId(windowId);
      if (!layoutEditable) {
        if (
          isWorkspaceWindowPresentationExclusivelyTop(
            stateRef.current,
            window,
            readOnlyFocusZIndexRef.current,
          )
        ) {
          return;
        }
        const highestZIndex = stateRef.current.windows.reduce(
          (highest, candidate) =>
            isWorkspaceWindowVisible(candidate)
              ? Math.max(
                  highest,
                  readOnlyFocusZIndexRef.current[candidate.id] ??
                    candidate.zIndex,
                )
              : highest,
          0,
        );
        const zIndex = Math.max(
          nextReadOnlyFocusZIndexRef.current,
          highestZIndex + 1,
        );
        nextReadOnlyFocusZIndexRef.current = zIndex + 1;
        readOnlyFocusZIndexRef.current = {
          ...readOnlyFocusZIndexRef.current,
          [windowId]: zIndex,
        };
        setReadOnlyFocusZIndexByWindowId(readOnlyFocusZIndexRef.current);
        return;
      }
      if (isWorkspaceWindowExclusivelyTop(stateRef.current, window)) return;
      emitState(focusWorkspaceWindow(stateRef.current, windowId));
    },
    [emitState, layoutEditable],
  );
  const {
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
    snapPreview,
  } = useWorkspaceWindowManagerInteractions({
    emitState,
    focusWindow,
    mutationOptions,
    rootRef,
    stateRef,
    viewport,
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      throw new Error("Workspace window manager root did not mount.");
    }
    return registerWorkspaceHostElement(host, root);
  }, [host]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setHostSize((current) =>
        current?.width === width && current.height === height
          ? current
          : { height, width },
      );
    };
    const initial = root.getBoundingClientRect();
    measure(initial.width, initial.height);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === root)
          measure(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!viewport) return;
    const previousViewport = previousViewportRef.current;
    previousViewportRef.current = viewport;
    if (
      !previousViewport ||
      areWorkspaceWindowViewportsEqual(previousViewport, viewport)
    )
      return;
    const updates = state.windows.flatMap((window) => {
      if (
        !isWorkspaceWindowVisible(window) ||
        window.placement !== "floating"
      ) {
        return [];
      }
      const sourceBounds = layoutEditable
        ? window.bounds
        : (readOnlyResizeBoundsRef.current[window.id] ?? window.bounds);
      const nextBounds =
        classifyWorkspaceFloatingSnapPreset(sourceBounds, previousViewport) !==
        null
          ? denormalizeWorkspaceWindowBounds(
              normalizeWorkspaceWindowBounds(sourceBounds, previousViewport),
              viewport,
            )
          : clampWorkspaceFloatingWindowBounds(sourceBounds, viewport);
      return areWorkspaceWindowBoundsEqual(sourceBounds, nextBounds)
        ? []
        : [{ bounds: nextBounds, id: window.id }];
    });
    if (updates.length === 0) return;
    if (layoutEditable) {
      emitState(
        setWorkspaceWindowBoundsAtomically(state, updates, mutationOptions),
      );
      return;
    }
    const nextBoundsByWindowId = { ...readOnlyResizeBoundsRef.current };
    for (const update of updates)
      nextBoundsByWindowId[update.id] = update.bounds;
    readOnlyResizeBoundsRef.current = nextBoundsByWindowId;
    setReadOnlyResizeBoundsByWindowId(nextBoundsByWindowId);
  }, [emitState, layoutEditable, mutationOptions, state, viewport]);

  const orderedVisibleWindows = useMemo(
    () =>
      getWorkspaceWindowStackingOrder(state).filter(isWorkspaceWindowVisible),
    [state],
  );
  useEffect(() => {
    const current = focusedWindowIdRef.current;
    if (
      current &&
      orderedVisibleWindows.some((window) => window.id === current)
    )
      return;
    const next = orderedVisibleWindows.at(-1)?.id ?? null;
    focusedWindowIdRef.current = next;
    setFocusedWindowId(next);
  }, [orderedVisibleWindows]);

  const snapSeams = useMemo(() => {
    if (!layoutEditable || !viewport) return [];
    return buildWorkspaceFloatingSnapResizeSeams(
      orderedVisibleWindows.flatMap((window) => {
        if (window.placement !== "floating") return [];
        const snapPreset = classifyWorkspaceFloatingSnapPreset(
          window.bounds,
          viewport,
        );
        return snapPreset
          ? [{ bounds: window.bounds, id: window.id, snapPreset }]
          : [];
      }),
    );
  }, [layoutEditable, orderedVisibleWindows, viewport]);

  const presentationZIndexByWindowId = useMemo(
    () =>
      Object.fromEntries(
        orderedVisibleWindows.map((window) => [
          window.id,
          layoutEditable
            ? window.zIndex
            : (readOnlyFocusZIndexByWindowId[window.id] ?? window.zIndex),
        ]),
      ),
    [layoutEditable, orderedVisibleWindows, readOnlyFocusZIndexByWindowId],
  );

  const handleShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (
        !canHandleWorkspaceWindowShortcut(
          host,
          event,
          layoutEditable,
          shortcuts,
          viewport,
        )
      ) {
        return;
      }
      const command = resolveWorkspaceWindowShortcut(event);
      const window = getFocusedWorkspaceWindow(
        stateRef.current,
        focusedWindowIdRef.current,
      );
      if (!command || !window) return;
      runWorkspaceWindowShortcut({
        activateWindowAction,
        command,
        emitState,
        mutationOptions,
        state: stateRef.current,
        viewport,
        window,
      });
      event.preventDefault();
      event.stopPropagation();
    },
    [
      emitState,
      host,
      activateWindowAction,
      layoutEditable,
      mutationOptions,
      shortcuts,
      viewport,
    ],
  );

  useLayoutEffect(() => {
    document.addEventListener("keydown", handleShortcut, true);
    return () => document.removeEventListener("keydown", handleShortcut, true);
  }, [handleShortcut]);

  const overlayZIndex =
    orderedVisibleWindows.reduce(
      (highest, window) =>
        Math.max(
          highest,
          presentationZIndexByWindowId[window.id] ?? window.zIndex,
        ),
      0,
    ) + 1;

  return (
    <div
      ref={rootRef}
      aria-label={ariaLabel}
      className={joinClassNames("setta-workspace-window-manager", className)}
      role="region"
      style={{ pointerEvents: "none" }}
      data-testid="workspace-window-manager"
      data-workspace-window-manager="true"
    >
      {viewport && snapPreview ? (
        <WorkspaceWindowManagerSnapPreview
          preview={snapPreview}
          zIndex={overlayZIndex}
        />
      ) : null}
      <WorkspaceWindowManagerWindows
        focusedWindowId={focusedWindowId}
        layoutEditable={layoutEditable}
        onAction={activateWindowAction}
        onFocus={focusWindow}
        onFreeResizeFinish={finishFreeResize}
        onFreeResizePointerDown={handleFreeResizePointerDown}
        onFreeResizePointerMove={handleFreeResizePointerMove}
        onTitleCommit={commitTitle}
        onTitlePointerDown={handleTitlePointerDown}
        onTitlePointerFinish={finishTitleDrag}
        onTitlePointerMove={handleTitlePointerMove}
        presentationZIndexByWindowId={presentationZIndexByWindowId}
        previewBoundsByWindowId={previewBoundsByWindowId}
        readOnlyResizeBoundsByWindowId={readOnlyResizeBoundsByWindowId}
        renderers={renderers}
        viewport={viewport}
        windows={orderedVisibleWindows}
      />
      {layoutEditable
        ? snapSeams.map((seam) => (
            <WorkspaceWindowManagerSnapResizeHandle
              key={`${seam.axis}-${seam.coordinate}-${seam.leadingWindowIds.join("|")}-${seam.trailingWindowIds.join("|")}`}
              seam={seam}
              onPointerDown={handleSnapResizePointerDown}
              onPointerFinish={finishSnapResize}
              onPointerMove={handleSnapResizePointerMove}
              zIndex={overlayZIndex}
            />
          ))
        : null}
    </div>
  );
}
