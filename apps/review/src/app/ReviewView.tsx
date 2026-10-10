import {
  createWorkspaceShellViewState,
  createWorkspaceWindowingState,
  WorkspaceProvider,
  WorkspaceShell,
  type WorkspaceCanvasConfiguration,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
} from "@setta/workspace";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useReview } from "./reviewContext";
import { projectReviewGraph } from "./reviewProjection";

const EMPTY_TABS: readonly WorkspaceShellTabDefinition[] = [];
const COMPACT_VIEWPORT_QUERY = "(max-width: 720px)";

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
  const handleViewStateChange = useCallback(
    (next: WorkspaceShellViewState) => setViewState(next),
    [],
  );
  return (
    <div className="review-workspace">
      <WorkspaceShell
        ariaLabel="Setta Review workspace"
        canvas={canvas}
        includeBuiltInInspector
        includeBuiltInSavedViews={false}
        includeSavedViewTabs
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
        }}
      />
    </div>
  );
}

export function ReviewView({
  host,
  draftStatus,
}: {
  host: WorkspaceHost;
  draftStatus?: string | null;
}) {
  const review = useReview();
  const oldCount = review.snapshot.requests.filter(
    (request) => request.response?.status === "final",
  ).length;
  const currentCount = review.snapshot.requests.length - oldCount;
  return (
    <main className="review-app">
      <header className="review-app-bar">
        <div>
          <strong>{review.snapshot.project.name}</strong>
          <span>
            {currentCount} current · {oldCount} old
          </span>
        </div>
        <div className="review-app-actions">
          {draftStatus ? (
            <span className="review-draft-status" role="status">
              {draftStatus}
            </span>
          ) : null}
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
        </div>
      </header>
      <WorkspaceProvider host={host}>
        <ReviewWorkspace />
      </WorkspaceProvider>
    </main>
  );
}
