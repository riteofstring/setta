import {
  createWorkspaceShellViewState,
  createWorkspaceWindowingState,
  focusWorkspaceWindow,
  openWorkspaceFloatingWindow,
  reopenWorkspaceWindow,
  WorkspaceProvider,
  WorkspaceShell,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
  type WorkspaceWindowRenderers,
  type WorkspaceWindowViewport,
} from "@setta/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SelectionComparisonWindow } from "../windows/SelectionComparisonWindow";
import { useLens } from "./lensContext";
import { LENS_COMPACT_VIEWPORT_QUERY } from "./lensProjection";

const EMPTY_TABS: readonly WorkspaceShellTabDefinition[] = [];
const COMPARISON_WINDOW_ID = "lens-selection-comparison";

function LensWorkspace() {
  const lens = useLens();
  const [viewState, setViewState] = useState(() => {
    const initial = createWorkspaceShellViewState();
    return window.matchMedia(LENS_COMPACT_VIEWPORT_QUERY).matches
      ? {
          ...initial,
          leading: { ...initial.leading, visible: false },
        }
      : initial;
  });
  const [windowingState, setWindowingState] = useState(() =>
    createWorkspaceWindowingState(),
  );
  const lastComparisonRequest = useRef(0);
  const [viewport, setViewport] = useState<WorkspaceWindowViewport | null>(
    null,
  );
  useEffect(() => {
    if (
      !viewport ||
      lens.comparisonRequest === 0 ||
      lens.comparisonRequest === lastComparisonRequest.current ||
      lens.selection.selectedObservationIds.length < 2
    ) {
      return;
    }
    lastComparisonRequest.current = lens.comparisonRequest;
    setWindowingState((current) => {
      const existing = current.windows.find(
        (window) => window.id === COMPARISON_WINDOW_ID,
      );
      if (existing) {
        return existing.isClosed || existing.isMinimized
          ? reopenWorkspaceWindow(current, existing.id)
          : focusWorkspaceWindow(current, existing.id);
      }
      return openWorkspaceFloatingWindow(
        current,
        {
          contentId: "selection",
          id: COMPARISON_WINDOW_ID,
          rendererData: null,
          surfaceKind: "experiment-lens-comparison",
          title: "Selected observations",
        },
        viewport,
      );
    });
  }, [
    lens.comparisonRequest,
    lens.selection.selectedObservationIds.length,
    viewport,
  ]);
  const renderers = useMemo<WorkspaceWindowRenderers>(
    () => ({
      "experiment-lens-comparison": () => <SelectionComparisonWindow />,
    }),
    [],
  );
  const handleViewStateChange = useCallback(
    (next: WorkspaceShellViewState) => setViewState(next),
    [],
  );
  return (
    <div className="lens-workspace">
      <WorkspaceShell
        ariaLabel="Experiment Lens workspace"
        includeBuiltInInspector
        includeBuiltInSavedViews
        includeSavedViewTabs
        leadingPaneShiftsCanvas
        leadingTabs={EMPTY_TABS}
        navigator={{}}
        onViewStateChange={handleViewStateChange}
        trailingTabs={EMPTY_TABS}
        viewState={viewState}
        windowing={{
          ariaLabel: "Experiment comparison windows",
          onStateChange: setWindowingState,
          onViewportChange: setViewport,
          renderers,
          state: windowingState,
        }}
      />
    </div>
  );
}

export function ExperimentLensView({
  host,
  recovery,
}: {
  host: WorkspaceHost;
  recovery?: {
    message: string;
    saveDraft: () => void;
    useSavedSelection: () => void;
  } | null;
}) {
  const lens = useLens();
  const selectedCount = lens.selection.selectedObservationIds.length;
  const canExport = [
    selectedCount,
    lens.selection.selectedArtifactIds.length,
    lens.selection.ranges.length,
    lens.selection.annotations.length,
  ].some((count) => count > 0);
  return (
    <main className="lens-app">
      <header className="lens-app-bar">
        <div className="lens-project-heading">
          <strong>{lens.snapshot.experiment.title}</strong>
          <span>
            {lens.visible.length} of {lens.snapshot.observations.length} visible
          </span>
        </div>
        <div className="lens-app-actions">
          {lens.error ? (
            <span className="lens-error" role="alert">
              {lens.error}
            </span>
          ) : lens.busy ? (
            <span className="lens-saving">Saving…</span>
          ) : null}
          <button
            className="lens-comparison-action"
            disabled={selectedCount < 2}
            onClick={lens.actions.openComparison}
            type="button"
          >
            Compare {selectedCount > 0 ? selectedCount : ""}
          </button>
          <button
            className="lens-primary-action"
            disabled={!canExport || lens.busy || Boolean(recovery)}
            onClick={() => void lens.actions.exportSelection().catch(() => {})}
            type="button"
          >
            Export selection
          </button>
        </div>
      </header>
      {recovery ? (
        <div className="lens-save-recovery" role="alert">
          <span>
            {recovery.message} Saving this draft replaces the last loaded
            selection.
          </span>
          <button
            disabled={lens.busy}
            onClick={recovery.saveDraft}
            type="button"
          >
            Save this draft
          </button>
          <button
            disabled={lens.busy}
            onClick={recovery.useSavedSelection}
            type="button"
          >
            Use saved selection
          </button>
        </div>
      ) : null}
      <WorkspaceProvider host={host}>
        <LensWorkspace />
      </WorkspaceProvider>
    </main>
  );
}
