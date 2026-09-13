import {
  WORKSPACE_OUTLINE_TAB_ID,
  WorkspaceProvider,
  WorkspaceShell,
  createWorkspaceShellViewState,
  createWorkspaceWindowViewport,
  useWorkspaceDocumentSnapshot,
  type WorkspaceCanvasConfiguration,
  type WorkspaceFloatingWindow,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
  type WorkspaceWindowBoundaryInsets,
  type WorkspaceWindowRenderers,
  type WorkspaceWindowViewport,
} from "@setta/workspace";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { ApplicationSnapshotV1 } from "../backend/generatedContract";
import {
  CasesIcon,
  PlayIcon,
  ReviewIcon,
  RunsIcon,
} from "../sections/SectionIcons";
import { CasesPane } from "../views/CasesPane";
import { ComparisonWindow } from "../views/ComparisonWindow";
import { LaunchPane } from "../views/LaunchPane";
import { ReviewPane } from "../views/ReviewPane";
import { RunDetailsPane } from "../views/RunDetailsPane";
import { RunsPane } from "../views/RunsPane";
import { RunsWindow } from "../views/RunsWindow";
import {
  BenchContext,
  type BenchActions,
  type BenchSelection,
  useBench,
} from "./benchContext";
import {
  alignedCaseResults,
  defaultComparedRunIds,
  findRun,
  reconciledId,
} from "./benchSelection";
import { projectBenchGraph, pruneBenchSelectedEdgeIds } from "./benchGraph";
import { createBenchWindowingStates } from "./benchWindowing";
import {
  BENCH_BUILD_VIEW_ID,
  BENCH_COMPARE_VIEW_ID,
  BENCH_RUNS_VIEW_ID,
  type BenchViewId,
} from "./projectProjection";

const RUNS_TAB_ID = "bench-runs";
const CASES_TAB_ID = "bench-cases";
const LAUNCH_TAB_ID = "bench-launch";
const RUN_DETAILS_TAB_ID = "bench-run-details";
const REVIEW_TAB_ID = "bench-review";
const CLOSED_PANE_WIDTH = 40;
const LEADING_PANE_WIDTH = 250;
const TRAILING_PANE_WIDTH = 425;
const WINDOW_VIEWPORT_FALLBACK = { height: 760, width: 1_280 };

const LEADING_TABS: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    icon: RunsIcon,
    id: RUNS_TAB_ID,
    label: "Runs",
    renderContent: () => <RunsPane />,
  },
  {
    icon: CasesIcon,
    id: CASES_TAB_ID,
    label: "Cases",
    renderContent: () => <CasesPane />,
  },
];

const TRAILING_TABS: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    icon: PlayIcon,
    id: LAUNCH_TAB_ID,
    label: "Launch",
    renderContent: () => <LaunchPane />,
  },
  {
    icon: RunsIcon,
    id: RUN_DETAILS_TAB_ID,
    label: "Run details",
    renderContent: () => <RunDetailsPane />,
  },
  {
    icon: ReviewIcon,
    id: REVIEW_TAB_ID,
    label: "Review",
    renderContent: () => <ReviewPane />,
  },
];

const WINDOW_RENDERERS = {
  "bench-comparison": (window) => (
    <ComparisonWindow side={comparisonWindowSide(window)} />
  ),
  "bench-runs": () => <RunsWindow />,
} satisfies WorkspaceWindowRenderers;

function comparisonWindowSide(
  window: WorkspaceFloatingWindow,
): "left" | "right" {
  return window.contentId === "bench-comparison-right" ? "right" : "left";
}

type BenchViewProps = {
  actions: BenchActions;
  error: string | null;
  host: WorkspaceHost | null;
  pendingAction: string | null;
  snapshot: ApplicationSnapshotV1 | null;
};

export function BenchView({
  actions,
  error,
  host,
  pendingAction,
  snapshot,
}: BenchViewProps) {
  if (host === null || snapshot === null) {
    return <BenchLoading error={error} />;
  }
  return (
    <BenchReady
      actions={actions}
      error={error}
      host={host}
      pendingAction={pendingAction}
      snapshot={snapshot}
    />
  );
}

function BenchLoading({ error }: { error: string | null }) {
  return (
    <main className="bench-app">
      <p aria-live="polite" className="bench-announcer" role="status">
        Loading Setta Bench.
      </p>
      <div className="bench-loading-state">
        <div className="bench-loading-mark" aria-hidden="true" />
        <strong>Opening comparison</strong>
        {error === null ? null : <p role="alert">{error}</p>}
      </div>
    </main>
  );
}

function BenchReady({
  actions,
  error,
  host,
  pendingAction,
  snapshot,
}: {
  actions: BenchActions;
  error: string | null;
  host: WorkspaceHost;
  pendingAction: string | null;
  snapshot: ApplicationSnapshotV1;
}) {
  const initialComparedRef = useRef(defaultComparedRunIds(snapshot));
  const initialCompared = initialComparedRef.current;
  const [activeRunId, setActiveRunId] = useState<string | null>(
    snapshot.runs[0]?.id ?? null,
  );
  const [comparedRunIds, setComparedRunIds] =
    useState<readonly [string | null, string | null]>(initialCompared);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(() => {
    const left = findRun(snapshot, initialCompared[0]);
    const right = findRun(snapshot, initialCompared[1]);
    return alignedCaseResults(left, right)[0]?.caseId ?? null;
  });
  useEffect(() => {
    const runIds = new Set(snapshot.runs.map((run) => run.id));
    setActiveRunId((current) =>
      reconciledId(current, runIds, snapshot.runs[0]?.id ?? null),
    );
    setComparedRunIds((current) => {
      const defaults = defaultComparedRunIds(snapshot);
      const left = reconciledId(current[0], runIds, defaults[0]);
      const right = reconciledId(current[1], runIds, defaults[1]);
      return left === right ? defaults : [left, right];
    });
  }, [snapshot]);
  useEffect(() => {
    const left = findRun(snapshot, comparedRunIds[0]);
    const right = findRun(snapshot, comparedRunIds[1]);
    const aligned = alignedCaseResults(left, right);
    const caseIds = new Set(aligned.map((entry) => entry.caseId));
    setActiveCaseId((current) =>
      reconciledId(
        current,
        caseIds,
        aligned.find((entry) => entry.differs)?.caseId ??
          aligned[0]?.caseId ??
          null,
      ),
    );
  }, [comparedRunIds, snapshot]);
  const selection = useMemo<BenchSelection>(
    () => ({
      activeCaseId,
      activeRunId,
      comparedRunIds,
      selectCase: setActiveCaseId,
      selectComparedRun: (side, runId) =>
        setComparedRunIds((current) =>
          side === "left" ? [runId, current[1]] : [current[0], runId],
        ),
      selectRun: setActiveRunId,
    }),
    [activeCaseId, activeRunId, comparedRunIds],
  );
  const context = useMemo(
    () => ({ actions, error, pendingAction, selection, snapshot }),
    [actions, error, pendingAction, selection, snapshot],
  );
  return (
    <main className="bench-app">
      <p aria-live="polite" className="bench-announcer" role="status">
        {pendingAction === null ? "Setta Bench ready." : pendingAction}
      </p>
      {error === null ? null : (
        <p className="bench-announcer" role="alert">
          {error}
        </p>
      )}
      <BenchContext.Provider value={context}>
        <WorkspaceProvider host={host}>
          <BenchWorkspace />
        </WorkspaceProvider>
      </BenchContext.Provider>
    </main>
  );
}

function BenchWorkspace() {
  const { snapshot } = useBench();
  const workspaceDocument = useWorkspaceDocumentSnapshot();
  const activeViewId = readActiveViewId(
    workspaceDocument.savedViews?.activeViewId,
  );
  const [shellViewState, setShellViewState] = useState<WorkspaceShellViewState>(
    createInitialBenchShellViewState,
  );
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const graph = useMemo(
    () => projectBenchGraph(snapshot, activeViewId === BENCH_BUILD_VIEW_ID),
    [activeViewId, snapshot],
  );
  useEffect(() => {
    setSelectedEdgeIds((current) =>
      pruneBenchSelectedEdgeIds(current, graph.edges),
    );
  }, [graph.edges]);
  const projectedSelectedEdgeIds = useMemo(
    () => pruneBenchSelectedEdgeIds(selectedEdgeIds, graph.edges),
    [graph.edges, selectedEdgeIds],
  );
  const canvas = useMemo<WorkspaceCanvasConfiguration>(
    () => ({
      graph: {
        canConnect: () => false,
        edges: graph.edges,
        onSelectedEdgeIdsChange: setSelectedEdgeIds,
        ports: graph.ports,
        selectedEdgeIds: projectedSelectedEdgeIds,
      },
    }),
    [graph, projectedSelectedEdgeIds],
  );
  useEffect(() => {
    const nextTabs = tabsForView(activeViewId);
    setShellViewState((current) => ({
      ...current,
      leading: {
        ...current.leading,
        rememberedNonFullWidth: LEADING_PANE_WIDTH,
        selectedTabId: nextTabs.leading,
        visible: true,
        width: LEADING_PANE_WIDTH,
      },
      trailing: {
        ...current.trailing,
        rememberedNonFullWidth: TRAILING_PANE_WIDTH,
        selectedTabId: nextTabs.trailing,
        visible: true,
        width: TRAILING_PANE_WIDTH,
      },
    }));
  }, [activeViewId]);
  const windowInsets = useMemo(
    () => shellWindowInsets(shellViewState),
    [shellViewState],
  );
  const { ref, viewport } = useBenchWindowViewport(windowInsets);
  const [windowingStates, setWindowingStates] = useState(
    createBenchWindowingStates,
  );
  const updateWindowingState = useCallback(
    (nextState: (typeof windowingStates)[BenchViewId]) =>
      setWindowingStates((current) => ({
        ...current,
        [activeViewId]: nextState,
      })),
    [activeViewId],
  );
  return (
    <div className="bench-workspace" ref={ref}>
      <WorkspaceShell
        ariaLabel="Setta Bench workspace"
        canvas={canvas}
        includeBuiltInInspector
        includeBuiltInSavedViews={false}
        includeSavedViewTabs
        leadingPaneShiftsCanvas
        leadingTabs={LEADING_TABS}
        navigator={{}}
        onViewStateChange={setShellViewState}
        trailingTabs={TRAILING_TABS}
        viewState={shellViewState}
        windowing={{
          ariaLabel: "Bench result windows",
          onStateChange: updateWindowingState,
          renderers: WINDOW_RENDERERS,
          state: windowingStates[activeViewId],
          viewport,
        }}
      />
    </div>
  );
}

function createInitialBenchShellViewState(): WorkspaceShellViewState {
  const state = createWorkspaceShellViewState({ trailingTabId: LAUNCH_TAB_ID });
  return {
    ...state,
    leading: {
      ...state.leading,
      rememberedNonFullWidth: LEADING_PANE_WIDTH,
      width: LEADING_PANE_WIDTH,
    },
    trailing: {
      ...state.trailing,
      rememberedNonFullWidth: TRAILING_PANE_WIDTH,
      visible: true,
      width: TRAILING_PANE_WIDTH,
    },
  };
}

function readActiveViewId(value: string | undefined): BenchViewId {
  if (value === BENCH_RUNS_VIEW_ID || value === BENCH_COMPARE_VIEW_ID) {
    return value;
  }
  return BENCH_BUILD_VIEW_ID;
}

function tabsForView(view: BenchViewId): { leading: string; trailing: string } {
  if (view === BENCH_RUNS_VIEW_ID) {
    return { leading: RUNS_TAB_ID, trailing: RUN_DETAILS_TAB_ID };
  }
  if (view === BENCH_COMPARE_VIEW_ID) {
    return { leading: CASES_TAB_ID, trailing: REVIEW_TAB_ID };
  }
  return {
    leading: WORKSPACE_OUTLINE_TAB_ID,
    trailing: LAUNCH_TAB_ID,
  };
}

function shellWindowInsets(
  state: WorkspaceShellViewState,
): WorkspaceWindowBoundaryInsets {
  return {
    bottom: 0,
    left: state.leading.visible ? state.leading.width : CLOSED_PANE_WIDTH,
    right: state.trailing.visible ? state.trailing.width : CLOSED_PANE_WIDTH,
    top: 0,
  };
}

function useBenchWindowViewport(insets: WorkspaceWindowBoundaryInsets): {
  ref: RefObject<HTMLDivElement | null>;
  viewport: WorkspaceWindowViewport;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(WINDOW_VIEWPORT_FALLBACK);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const update = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { height, width },
      );
    };
    const bounds = element.getBoundingClientRect();
    update(bounds.width, bounds.height);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === element) {
          update(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const viewport = useMemo(
    () => createWorkspaceWindowViewport({ ...size, insets }),
    [insets, size],
  );
  return { ref, viewport };
}
