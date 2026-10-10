import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WorkspaceProvider,
  WorkspaceParameterConfigurationIcon,
  WorkspaceShell,
  WorkspaceQuickStartIcon,
  createWorkspaceShellViewState,
  useWorkspaceDocumentSnapshot,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
} from "@setta/workspace";

import type {
  InvocationStatus,
  Project,
  RuntimeDeclaration,
} from "../api/generatedContract";
import {
  RealtimeContext,
  useRealtime,
  type RealtimeActions,
  type RuntimeSourceViewState,
} from "./runtimeContext";
import type { RuntimeViewState } from "./runtimeState";
import {
  canConnectRealtimeGraph,
  canReconnectRealtimeGraph,
  pruneRealtimeSelectedEdgeIds,
  projectRealtimeGraph,
} from "./realtimeGraph";

import { RealtimePlayground } from "./RealtimePlayground";

const EMPTY_TABS: ReadonlyArray<WorkspaceShellTabDefinition> = [];
const REALTIME_RUNTIME_TAB: WorkspaceShellTabDefinition = {
  icon: WorkspaceParameterConfigurationIcon,
  id: "runtime",
  label: "Runtime",
  renderContent: () => <RealtimeRuntimePane />,
};
const REALTIME_RUNTIME_TABS: ReadonlyArray<WorkspaceShellTabDefinition> = [
  REALTIME_RUNTIME_TAB,
];

type RealtimeViewProps = {
  actions: RealtimeActions;
  error: string | null;
  host: WorkspaceHost | null;
  project: Project | null;
  runtime: RuntimeViewState;
  source: RuntimeSourceViewState;
};

function runtimeTitle(runtime: RuntimeDeclaration): string {
  return `${runtime.kind}: ${runtime.entrypoint}`;
}

const TERMINAL_INVOCATION_STATES = new Set([
  "completed",
  "cancelled",
  "timedOut",
  "failed",
  "crashed",
  "superseded",
  "blocked",
]);

function terminalInvocations(
  runtime: RuntimeViewState,
): Array<[string, InvocationStatus]> {
  return Object.entries(runtime.invocations).filter(([, invocation]) =>
    TERMINAL_INVOCATION_STATES.has(invocation.state),
  );
}

function SourceNotice({ source }: { source: RuntimeSourceViewState }) {
  if (source.notice === null) {
    return null;
  }
  return (
    <p role={source.notice.kind === "error" ? "alert" : "status"}>
      {source.notice.message}
    </p>
  );
}

function RuntimeError({ runtime }: { runtime: RuntimeViewState }) {
  if (runtime.error === null) {
    return null;
  }
  return (
    <p role="alert">
      <strong>{runtime.error.code}</strong>: {runtime.error.message}
    </p>
  );
}

function InvocationOutcomes({
  outcomes,
}: {
  outcomes: Array<[string, InvocationStatus]>;
}) {
  if (outcomes.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Invocation outcomes">
      {outcomes.map(([bindingId, invocation]) => (
        <li key={bindingId}>
          <strong>{bindingId}</strong>: {invocation.state}
          {` · run ${invocation.identity.runId}`}
          {invocation.error === null ? null : ` — ${invocation.error.message}`}
        </li>
      ))}
    </ul>
  );
}

function RuntimeLogs({ runtime }: { runtime: RuntimeViewState }) {
  if (runtime.logs.length === 0) {
    return null;
  }
  return (
    <details className="realtime-runtime-logs">
      <summary>Runtime logs ({runtime.logs.length})</summary>
      <pre>
        {runtime.logs.map((log) => `[${log.stream}] ${log.text}`).join("\n")}
      </pre>
    </details>
  );
}

function RuntimeFeedback({
  error,
  runtime,
  source,
}: {
  error: string | null;
  runtime: RuntimeViewState;
  source: RuntimeSourceViewState;
}) {
  const outcomes = terminalInvocations(runtime);
  const visible =
    error !== null ||
    source.notice !== null ||
    runtime.error !== null ||
    outcomes.length > 0 ||
    runtime.logs.length > 0;
  if (!visible) {
    return null;
  }
  return (
    <section
      aria-label="Runtime activity"
      className="realtime-runtime-feedback"
    >
      {error === null ? null : <p role="alert">{error}</p>}
      <SourceNotice source={source} />
      <RuntimeError runtime={runtime} />
      <InvocationOutcomes outcomes={outcomes} />
      <RuntimeLogs runtime={runtime} />
    </section>
  );
}

function RealtimeRuntimePane() {
  const { actions, error, project, runtime, source } = useRealtime();
  const [reloading, setReloading] = useState(false);
  const [handler, setHandler] = useState("");
  const [creating, setCreating] = useState(false);
  const handleReload = async () => {
    setReloading(true);
    try {
      await actions.reload();
    } finally {
      setReloading(false);
    }
  };
  const reloadDisabled =
    reloading ||
    runtime.connection !== "connected" ||
    runtime.workerState === "starting" ||
    runtime.workerState === "replacing";
  const activeInvocations = Object.values(runtime.invocations).filter(
    (invocation) => !TERMINAL_INVOCATION_STATES.has(invocation.state),
  ).length;
  const handlers = [...runtime.handlers].sort();
  const handleCreate = async () => {
    if (!handler) {
      return;
    }
    setCreating(true);
    try {
      if (await actions.createHandler(handler)) {
        setHandler("");
      }
    } finally {
      setCreating(false);
    }
  };
  return (
    <div className="realtime-runtime-pane">
      <h2>Runtime</h2>
      <div className="realtime-runtime-pane-controls">
        <span
          className={`realtime-connection realtime-connection-${runtime.connection}`}
        >
          {runtime.connection}
        </span>
        <span
          className={`realtime-worker-state realtime-worker-state-${runtime.workerState}`}
          data-worker-state={runtime.workerState}
          role="status"
        >
          Worker: {runtime.workerState}
        </span>
        <button
          className="realtime-reload"
          disabled={reloadDisabled}
          onClick={() => void handleReload()}
          type="button"
        >
          Reload runtime
        </button>
      </div>
      <dl>
        <div>
          <dt>Entrypoint</dt>
          <dd>{runtimeTitle(project.runtime)}</dd>
        </div>
        <div>
          <dt>Active invocations</dt>
          <dd>{activeInvocations}</dd>
        </div>
      </dl>
      <section
        className="realtime-runtime-handlers"
        aria-label="Runtime handlers"
      >
        <h3>Handlers</h3>
        {handlers.length === 0 ? (
          <p>No handlers discovered.</p>
        ) : (
          <ul>
            {handlers.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        )}
        <div className="realtime-runtime-handler-create">
          <select
            aria-label="New handler"
            onChange={(event) => setHandler(event.currentTarget.value)}
            value={handler}
          >
            <option value="">Choose a handler</option>
            {handlers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            disabled={!handler || creating}
            onClick={() => void handleCreate()}
            type="button"
          >
            {creating ? "Adding…" : "Add handler"}
          </button>
        </div>
      </section>
      <RuntimeFeedback error={error} runtime={runtime} source={source} />
    </div>
  );
}

function ReadyRealtimeView({
  actions,
  error,
  host,
  project,
  runtime,
  source,
}: RealtimeViewProps & { host: WorkspaceHost; project: Project }) {
  return (
    <main className="realtime-app">
      <p aria-live="polite" className="realtime-announcer" role="status">
        Realtime ready.
      </p>
      <RealtimeContext.Provider
        value={{ actions, error, project, runtime, source }}
      >
        <WorkspaceProvider host={host}>
          <div className="realtime-workspace">
            <RealtimeWorkspace />
          </div>
        </WorkspaceProvider>
      </RealtimeContext.Provider>
    </main>
  );
}

function LoadingRealtimeView({ error }: { error: string | null }) {
  return (
    <main className="realtime-app">
      <p aria-live="polite" className="realtime-announcer" role="status">
        Loading Realtime.
      </p>
      <div className="realtime-loading-state">
        {error === null ? null : (
          <p className="realtime-initial-error" role="alert">
            {error}
          </p>
        )}
        <div className="realtime-loading" aria-hidden="true" />
      </div>
    </main>
  );
}

export function RealtimeView(props: RealtimeViewProps) {
  const ready = props.host !== null && props.project !== null;
  return ready ? (
    <ReadyRealtimeView {...props} host={props.host!} project={props.project!} />
  ) : (
    <LoadingRealtimeView error={props.error} />
  );
}

function RealtimeWorkspace() {
  const { actions, project } = useRealtime();
  const workspaceDocument = useWorkspaceDocumentSnapshot();
  const isPlayground = project.id === "project-neon-sketch";
  const [viewState, setViewState] = useState<WorkspaceShellViewState>(() =>
    createWorkspaceShellViewState({
      trailingTabId: "runtime",
      leadingTabId: isPlayground ? "start-here" : undefined,
    }),
  );
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const visibleSectionIds = useMemo(
    () => new Set(Object.keys(workspaceDocument.sections)),
    [workspaceDocument.sections],
  );
  const projection = useMemo(
    () => projectRealtimeGraph(project, visibleSectionIds),
    [project, visibleSectionIds],
  );
  useEffect(() => {
    setSelectedEdgeIds((current) =>
      pruneRealtimeSelectedEdgeIds(current, projection.edges),
    );
  }, [projection.edges]);
  const projectedSelectedEdgeIds = useMemo(
    () => pruneRealtimeSelectedEdgeIds(selectedEdgeIds, projection.edges),
    [projection.edges, selectedEdgeIds],
  );
  const canvas = useMemo(
    () => ({
      graph: {
        canConnect: (
          connection: Parameters<typeof canConnectRealtimeGraph>[1],
        ) => canConnectRealtimeGraph(project, connection),
        canReconnect: (
          reconnect: Parameters<typeof canReconnectRealtimeGraph>[1],
        ) => canReconnectRealtimeGraph(project, reconnect),
        edges: projection.edges,
        onConnect: (connection: Parameters<typeof actions.connectGraph>[0]) => {
          void actions.connectGraph(connection);
        },
        onDelete: (edgeIds: ReadonlyArray<string>) => {
          void actions.deleteGraphEdges(edgeIds);
        },
        onReconnect: (
          reconnect: Parameters<typeof actions.reconnectGraph>[0],
        ) => {
          void actions.reconnectGraph(reconnect);
        },
        onSelectedEdgeIdsChange: setSelectedEdgeIds,
        ports: projection.ports,
        selectedEdgeIds: projectedSelectedEdgeIds,
      },
    }),
    [actions, project, projectedSelectedEdgeIds, projection],
  );
  const handleViewStateChange = useCallback(
    (next: WorkspaceShellViewState) => setViewState(next),
    [],
  );
  return (
    <WorkspaceShell
      ariaLabel="Realtime workspace"
      canvas={canvas}
      includeBuiltInInspector
      includeBuiltInSavedViews={false}
      leadingPaneShiftsCanvas={true}
      leadingTabs={
        isPlayground
          ? [
              {
                id: "start-here",
                label: "Start here",
                icon: WorkspaceQuickStartIcon,
                renderContent: () => (
                  <RealtimePlayground
                    onNavigate={() => {
                      if (window.matchMedia("(max-width: 720px)").matches) {
                        setViewState((current) => ({
                          ...current,
                          leading: { ...current.leading, visible: false },
                        }));
                      }
                    }}
                  />
                ),
              },
            ]
          : EMPTY_TABS
      }
      onViewStateChange={handleViewStateChange}
      trailingTabs={REALTIME_RUNTIME_TABS}
      viewState={viewState}
    />
  );
}
