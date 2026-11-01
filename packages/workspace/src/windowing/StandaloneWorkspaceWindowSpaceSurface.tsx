import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";
import type { WorkspaceWindowRenderers } from "./WorkspaceWindowManager.js";
import { WorkspaceWindowSurface } from "./WorkspaceWindowSurface.js";
import {
  buildWorkspaceFloatingSnapResizeSeams,
  classifyWorkspaceFloatingSnapPreset,
  type WorkspaceFloatingSnapResizeSeam,
} from "./windowingSnapLayout.js";
import {
  hydrateStandaloneWorkspaceWindowSpace,
  hydrateStandaloneWorkspaceWindowSpaceState,
  type ActiveStandaloneWorkspaceSnapResize,
  type StandaloneWorkspaceWindow,
} from "./standaloneWorkspaceWindowSpaceState.js";
import { useStandaloneWorkspaceWindowSpaceInteractions } from "./useStandaloneWorkspaceWindowSpaceInteractions.js";
import {
  createWorkspaceWindowSpace,
  type WorkspaceWindowSpace,
} from "./windowSpaces.js";
import {
  createWorkspaceWindowViewport,
  type WorkspaceWindowBoundaryInsets,
  type WorkspaceWindowViewport,
  WorkspaceWindowingError,
} from "./windowingTypes.js";

const EMPTY_INSETS: WorkspaceWindowBoundaryInsets = Object.freeze({
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
});
const FALLBACK_WIDTH_PX = 1_440;
const FALLBACK_HEIGHT_PX = 900;
const SEAM_HIT_SIZE_PX = 8;

export type StandaloneWorkspaceWindowSpaceSurfaceProps = {
  windowSpace: WorkspaceWindowSpace;
  renderers: WorkspaceWindowRenderers;

  revision?: string | number;
  ariaLabel?: string;
  className?: string;
};

function joinClassNames(
  ...classNames: ReadonlyArray<string | false | undefined>
): string {
  return classNames.filter(Boolean).join(" ");
}

function getStandaloneViewport(size: {
  readonly width: number;
  readonly height: number;
}): WorkspaceWindowViewport {
  return createWorkspaceWindowViewport({ ...size, insets: EMPTY_INSETS });
}

function getStandaloneHydrationKey(
  spaceId: string,
  revision: string | number | undefined,
): string {
  return JSON.stringify([spaceId, revision ?? null]);
}

function useStandaloneContainerViewport(
  containerRef: RefObject<HTMLElement | null>,
): WorkspaceWindowViewport {
  const [size, setSize] = useState({
    height: FALLBACK_HEIGHT_PX,
    width: FALLBACK_WIDTH_PX,
  });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const measure = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        return;
      }
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { height, width },
      );
    };
    const initial = container.getBoundingClientRect();
    measure(initial.width, initial.height);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === container) {
          measure(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);
  return useMemo(() => getStandaloneViewport(size), [size]);
}

function validateStandaloneWindowSpace(value: WorkspaceWindowSpace): {
  readonly space: WorkspaceWindowSpace | null;
  readonly error: string | null;
} {
  try {
    return { space: createWorkspaceWindowSpace(value), error: null };
  } catch (error) {
    if (error instanceof WorkspaceWindowingError) {
      return { space: null, error: error.message };
    }
    throw error;
  }
}

function hydrateValidatedStandaloneWindowSpace(
  space: WorkspaceWindowSpace | null,
  viewport: WorkspaceWindowViewport,
): readonly StandaloneWorkspaceWindow[] {
  return space ? hydrateStandaloneWorkspaceWindowSpace(space, viewport) : [];
}

function getStandaloneWindowSpaceId(
  validSpace: WorkspaceWindowSpace | null,
  fallbackId: string,
): string {
  return validSpace?.id ?? fallbackId;
}

function useStandaloneLocalWindows(
  hydratedWindows: readonly StandaloneWorkspaceWindow[],
  hydrationKey: string,
  activeResizeRef: { current: ActiveStandaloneWorkspaceSnapResize | null },
) {
  const [localWindows, setLocalWindows] = useState(hydratedWindows);
  const previousHydratedWindowsRef = useRef(hydratedWindows);
  const previousHydrationKeyRef = useRef(hydrationKey);

  useEffect(() => {
    setLocalWindows((currentWindows) => {
      const next = hydrateStandaloneWorkspaceWindowSpaceState({
        currentWindows,
        nextHydratedWindows: hydratedWindows,
        nextKey: hydrationKey,
        previousHydratedWindows: previousHydratedWindowsRef.current,
        previousKey: previousHydrationKeyRef.current,
      });
      previousHydratedWindowsRef.current = next.previousHydratedWindows;
      previousHydrationKeyRef.current = next.previousKey;
      if (next.resetLocalState) {
        activeResizeRef.current = null;
      }
      return next.localWindows;
    });
  }, [activeResizeRef, hydratedWindows, hydrationKey]);

  return { localWindows, setLocalWindows };
}

function getSeamStyle(seam: WorkspaceFloatingSnapResizeSeam): CSSProperties {
  const length = Math.max(SEAM_HIT_SIZE_PX, seam.end - seam.start);
  return seam.axis === "vertical"
    ? {
        height: length,
        left: seam.coordinate - SEAM_HIT_SIZE_PX / 2,
        top: seam.start,
        width: SEAM_HIT_SIZE_PX,
      }
    : {
        height: SEAM_HIT_SIZE_PX,
        left: seam.start,
        top: seam.coordinate - SEAM_HIT_SIZE_PX / 2,
        width: length,
      };
}

function StandaloneWorkspaceWindowFrame({
  window,
  renderers,
  onFocus,
}: {
  window: StandaloneWorkspaceWindow;
  renderers: WorkspaceWindowRenderers;
  onFocus: (windowId: string) => void;
}) {
  const renderer = renderers[window.surfaceKind];
  return (
    <article
      aria-label={`Window ${window.title}`}
      className="setta-workspace-standalone-window-space-window"
      style={{
        height: window.bounds.height,
        left: window.bounds.x,
        top: window.bounds.y,
        width: window.bounds.width,
        zIndex: window.zIndex,
      }}
      data-testid="standalone-workspace-window-space-window"
      data-workspace-window-id={window.id}
      data-workspace-window-surface-kind={window.surfaceKind}
      onPointerDown={() => onFocus(window.id)}
    >
      <WorkspaceWindowSurface
        allowLayoutMutations={false}
        className="setta-workspace-standalone-window-space-frame"
        onFocus={() => onFocus(window.id)}
        title={window.title}
        windowId={window.id}
      >
        {renderer ? (
          renderer(window)
        ) : (
          <div
            className="setta-workspace-standalone-window-space-missing-renderer"
            role="status"
            data-testid="standalone-workspace-window-space-missing-renderer"
          >
            No renderer is registered for {window.surfaceKind}.
          </div>
        )}
      </WorkspaceWindowSurface>
    </article>
  );
}

function StandaloneWorkspaceSnapResizeHandle({
  seam,
  onPointerDown,
  onPointerMove,
  onPointerFinish,
}: {
  seam: WorkspaceFloatingSnapResizeSeam;
  onPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    seam: WorkspaceFloatingSnapResizeSeam,
  ) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerFinish: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-orientation={seam.axis === "vertical" ? "vertical" : "horizontal"}
      className="setta-workspace-standalone-window-space-seam"
      role="separator"
      style={getSeamStyle(seam)}
      data-testid="standalone-workspace-window-space-seam"
      data-axis={seam.axis}
      onPointerCancel={onPointerFinish}
      onPointerDown={(event) => onPointerDown(event, seam)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerFinish}
    >
      <span
        aria-hidden="true"
        className="setta-workspace-standalone-window-space-seam-line"
      />
    </div>
  );
}

export function StandaloneWorkspaceWindowSpaceSurface({
  ariaLabel = "Saved Window Space",
  className,
  renderers,
  revision,
  windowSpace,
}: StandaloneWorkspaceWindowSpaceSurfaceProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const viewport = useStandaloneContainerViewport(containerRef);
  const validation = useMemo(
    () => validateStandaloneWindowSpace(windowSpace),
    [windowSpace],
  );
  const hydratedWindows = useMemo(
    () => hydrateValidatedStandaloneWindowSpace(validation.space, viewport),
    [validation.space, viewport],
  );
  const hydrationKey = getStandaloneHydrationKey(windowSpace.id, revision);
  const activeResizeRef = useRef<ActiveStandaloneWorkspaceSnapResize | null>(
    null,
  );
  const { localWindows, setLocalWindows } = useStandaloneLocalWindows(
    hydratedWindows,
    hydrationKey,
    activeResizeRef,
  );

  const visibleWindows = useMemo(
    () =>
      localWindows
        .map((window, index) => ({ index, window }))
        .sort(
          (first, second) =>
            first.window.zIndex - second.window.zIndex ||
            first.index - second.index,
        )
        .map(({ window }) => window),
    [localWindows],
  );
  const snapSeams = useMemo(
    () =>
      buildWorkspaceFloatingSnapResizeSeams(
        visibleWindows.flatMap((window) => {
          const snapPreset = classifyWorkspaceFloatingSnapPreset(
            window.bounds,
            viewport,
          );
          return snapPreset
            ? [{ bounds: window.bounds, id: window.id, snapPreset }]
            : [];
        }),
      ),
    [viewport, visibleWindows],
  );
  const seamLayerZIndex = useMemo(
    () =>
      localWindows.reduce(
        (highest, window) => Math.max(highest, window.zIndex),
        0,
      ) + 1,
    [localWindows],
  );
  const interactions = useStandaloneWorkspaceWindowSpaceInteractions({
    activeResizeRef,
    localWindows,
    setLocalWindows,
  });

  return (
    <section
      ref={containerRef}
      aria-label={ariaLabel}
      className={joinClassNames(
        "setta-workspace-standalone-window-space",
        className,
      )}
      role="region"
      data-testid="standalone-workspace-window-space-surface"
      data-workspace-window-space-id={getStandaloneWindowSpaceId(
        validation.space,
        windowSpace.id,
      )}
    >
      {validation.error ? (
        <div
          className="setta-workspace-standalone-window-space-status"
          role="alert"
        >
          This Window Space is invalid: {validation.error}
        </div>
      ) : null}
      {!validation.error && visibleWindows.length === 0 ? (
        <div
          className="setta-workspace-standalone-window-space-status"
          role="status"
        >
          This window space does not have any saved floating windows.
        </div>
      ) : null}
      {!validation.error
        ? visibleWindows.map((window) => (
            <StandaloneWorkspaceWindowFrame
              key={window.id}
              renderers={renderers}
              window={window}
              onFocus={interactions.focusWindow}
            />
          ))
        : null}
      {!validation.error && snapSeams.length > 0 ? (
        <div
          className="setta-workspace-standalone-window-space-seams"
          style={{ zIndex: seamLayerZIndex }}
        >
          {snapSeams.map((seam) => (
            <StandaloneWorkspaceSnapResizeHandle
              key={`${seam.axis}-${seam.coordinate}-${seam.leadingWindowIds.join("|")}-${seam.trailingWindowIds.join("|")}`}
              seam={seam}
              onPointerDown={interactions.handleSeamPointerDown}
              onPointerFinish={interactions.handleSeamPointerFinish}
              onPointerMove={interactions.handleSeamPointerMove}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
