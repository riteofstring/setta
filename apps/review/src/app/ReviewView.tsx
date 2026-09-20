import {
  createWorkspaceShellViewState,
  createWorkspaceWindowingState,
  createWorkspaceWindowViewport,
  WorkspaceProvider,
  WorkspaceShell,
  type WorkspaceCanvasConfiguration,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
  type WorkspaceWindowBoundaryInsets,
  type WorkspaceWindowViewport,
} from "@setta/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useReview } from "./reviewContext";
import { projectReviewGraph } from "./reviewProjection";

const EMPTY_TABS: readonly WorkspaceShellTabDefinition[] = [];
const CLOSED_PANE_WIDTH = 40;
const COMPACT_VIEWPORT_QUERY = "(max-width: 720px)";

function viewportInsets(
  viewState: WorkspaceShellViewState,
): WorkspaceWindowBoundaryInsets {
  return {
    bottom: 0,
    left: viewState.leading.visible
      ? viewState.leading.width
      : CLOSED_PANE_WIDTH,
    right: viewState.trailing.visible
      ? viewState.trailing.width
      : CLOSED_PANE_WIDTH,
    top: 0,
  };
}

function useWindowViewport(insets: WorkspaceWindowBoundaryInsets): {
  ref: React.RefObject<HTMLDivElement | null>;
  viewport: WorkspaceWindowViewport;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ height: 720, width: 1_200 });
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setSize((current) =>
          current.width === width && current.height === height
            ? current
            : { height, width },
        );
      }
    };
    const bounds = element.getBoundingClientRect();
    measure(bounds.width, bounds.height);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === element) {
          measure(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return {
    ref,
    viewport: useMemo(
      () => createWorkspaceWindowViewport({ ...size, insets }),
      [insets, size],
    ),
  };
}

function ReviewWorkspace() {
  const review = useReview();
  const [viewState, setViewState] = useState(() =>
    createWorkspaceShellViewState(),
  );
  const [windowingState, setWindowingState] = useState(() =>
    createWorkspaceWindowingState(),
  );
  useEffect(() => {
    const media = window.matchMedia(COMPACT_VIEWPORT_QUERY);
    const closeOutline = () => {
      if (!media.matches) {
        return;
      }
      setViewState((current) =>
        current.leading.visible
          ? {
              ...current,
              leading: { ...current.leading, visible: false },
            }
          : current,
      );
    };
    closeOutline();
    media.addEventListener("change", closeOutline);
    return () => media.removeEventListener("change", closeOutline);
  }, []);
  const graph = useMemo(
    () => projectReviewGraph(review.snapshot, review.selection),
    [review.selection, review.snapshot],
  );
  const canvas = useMemo<WorkspaceCanvasConfiguration>(
    () => ({
      graph: {
        canConnect: () => false,
        edges: graph.edges,
        ports: graph.ports,
        selectedEdgeIds: graph.selectedEdgeIds,
      },
    }),
    [graph],
  );
  const insets = useMemo(() => viewportInsets(viewState), [viewState]);
  const { ref, viewport } = useWindowViewport(insets);
  const handleViewStateChange = useCallback(
    (next: WorkspaceShellViewState) => setViewState(next),
    [],
  );
  return (
    <div className="review-workspace" ref={ref}>
      <WorkspaceShell
        ariaLabel="Setta Review workspace"
        canvas={canvas}
        includeBuiltInInspector
        includeBuiltInSavedViews={false}
        leadingPaneShiftsCanvas
        leadingTabs={EMPTY_TABS}
        navigator={{}}
        onViewStateChange={handleViewStateChange}
        trailingTabs={EMPTY_TABS}
        viewState={viewState}
        windowing={{
          ariaLabel: "Review comparison windows",
          onStateChange: setWindowingState,
          renderers: {},
          state: windowingState,
          viewport,
        }}
      />
    </div>
  );
}

export function ReviewView({ host }: { host: WorkspaceHost }) {
  const review = useReview();
  const finalCount = review.snapshot.requests.filter(
    (request) => request.response?.status === "final",
  ).length;
  return (
    <main className="review-app">
      <header className="review-app-bar">
        <div>
          <strong>{review.snapshot.project.name}</strong>
          <span>
            {finalCount} of {review.snapshot.requests.length} complete
          </span>
        </div>
        <div className="review-app-actions">
          {review.error ? (
            <span role="alert">{review.error}</span>
          ) : (
            <span
              className="review-live"
              title="New review submissions appear automatically"
            >
              Auto-updating
            </span>
          )}
          <button
            onClick={() => void review.actions.exportReview().catch(() => {})}
            type="button"
          >
            Export responses
          </button>
        </div>
      </header>
      <WorkspaceProvider host={host}>
        <ReviewWorkspace />
      </WorkspaceProvider>
    </main>
  );
}
