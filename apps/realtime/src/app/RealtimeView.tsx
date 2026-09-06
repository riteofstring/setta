import { useCallback, useState } from "react";
import {
  WorkspaceProvider,
  WorkspaceParameterConfigurationIcon,
  WorkspaceShell,
  createWorkspaceShellViewState,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
} from "@setta/workspace";

import type {
  InvocationStatus,
  Project,
  RuntimeDeclaration,
} from "../backend/generatedContract";
import {
  RealtimeContext,
  useRealtime,
  type RealtimeActions,
  type RuntimeSourceViewState,
} from "./runtimeContext";
import type { RuntimeViewState } from "./runtimeState";

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
  const [viewState, setViewState] = useState<WorkspaceShellViewState>(() =>
    createWorkspaceShellViewState({ trailingTabId: "runtime" }),
  );
  const handleViewStateChange = useCallback(
    (next: WorkspaceShellViewState) => setViewState(next),
    [],
  );
  return (
    <WorkspaceShell
      ariaLabel="Realtime workspace"
      includeBuiltInInspector
      includeBuiltInSavedViews={false}
      leadingPaneShiftsCanvas={true}
      leadingTabs={EMPTY_TABS}
      onViewStateChange={handleViewStateChange}
      trailingTabs={REALTIME_RUNTIME_TABS}
      viewState={viewState}
    />
  );
}
