import {
  createWorkspaceShellViewState,
  createWorkspaceWindowingState,
  createWorkspaceWindowViewport,
  focusWorkspaceWindow,
  openWorkspaceFloatingWindow,
  reopenWorkspaceWindow,
  WorkspaceProvider,
  WorkspaceShell,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
  type WorkspaceWindowBoundaryInsets,
  type WorkspaceWindowRenderers,
  type WorkspaceWindowViewport,
} from "@setta/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SelectionComparisonWindow } from "../windows/SelectionComparisonWindow";
import { useLens } from "./lensContext";
import { LENS_COMPACT_VIEWPORT_QUERY } from "./lensProjection";

const EMPTY_TABS: readonly WorkspaceShellTabDefinition[] = [];
const CLOSED_PANE_WIDTH = 40;
const COMPARISON_WINDOW_ID = "lens-selection-comparison";

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
  const insets = useMemo(() => viewportInsets(viewState), [viewState]);
  const { ref, viewport } = useWindowViewport(insets);
  useEffect(() => {
    if (
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
    <div className="lens-workspace" ref={ref}>
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
          renderers,
          state: windowingState,
          viewport,
        }}
      />
    </div>
  );
}

export function ExperimentLensView({ host }: { host: WorkspaceHost }) {
  const lens = useLens();
  const selectedCount = lens.selection.selectedObservationIds.length;
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
            disabled={selectedCount === 0 || lens.busy}
            onClick={() => void lens.actions.exportSelection().catch(() => {})}
            type="button"
          >
            Export selection
          </button>
        </div>
      </header>
      <WorkspaceProvider host={host}>
        <LensWorkspace />
      </WorkspaceProvider>
    </main>
  );
}
