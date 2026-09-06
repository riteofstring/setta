import { useCallback, useLayoutEffect, useState } from "react";
import {
  WorkspaceProvider,
  WorkspaceParameterConfigurationIcon,
  WorkspaceShell,
  createWorkspaceShellViewState,
  setWorkspaceCapabilities,
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
};

function initialMode(): "author" | "use" {
  if (typeof window === "undefined") {
    return "use";
  }
  return new URLSearchParams(window.location.search).get("mode") === "author"
    ? "author"
    : "use";
}

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

function RuntimeFeedback({
  error,
  runtime,
}: {
  error: string | null;
  runtime: RuntimeViewState;
}) {
  const outcomes = terminalInvocations(runtime);
  const visible =
    error !== null ||
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
      {runtime.error === null ? null : (
        <p role="alert">
          <strong>{runtime.error.code}</strong>: {runtime.error.message}
        </p>
      )}
      {outcomes.length === 0 ? null : (
        <ul aria-label="Invocation outcomes">
          {outcomes.map(([bindingId, invocation]) => (
            <li key={bindingId}>
              <strong>{bindingId}</strong>: {invocation.state}
              {invocation.error === null
                ? null
                : ` — ${invocation.error.message}`}
            </li>
          ))}
        </ul>
      )}
      {runtime.logs.length === 0 ? null : (
        <details className="realtime-runtime-logs">
          <summary>Runtime logs ({runtime.logs.length})</summary>
          <pre>
            {runtime.logs
              .map((log) => `[${log.stream}] ${log.text}`)
              .join("\n")}
          </pre>
        </details>
      )}
    </section>
  );
}

function RealtimeRuntimePane() {
  const { project, runtime } = useRealtime();
  const activeInvocations = Object.values(runtime.invocations).filter(
    (invocation) => !TERMINAL_INVOCATION_STATES.has(invocation.state),
  ).length;
  return (
    <div className="realtime-runtime-pane">
      <h2>Runtime</h2>
      <dl>
        <div>
          <dt>Worker</dt>
          <dd>{runtime.workerState}</dd>
        </div>
        <div>
          <dt>Entrypoint</dt>
          <dd>{runtimeTitle(project.runtime)}</dd>
        </div>
        <div>
          <dt>Active invocations</dt>
          <dd>{activeInvocations}</dd>
        </div>
      </dl>
    </div>
  );
}

function ReadyRealtimeView({
  actions,
  error,
  host,
  project,
  runtime,
}: RealtimeViewProps & { host: WorkspaceHost; project: Project }) {
  const [mode, setMode] = useState<"author" | "use">(initialMode);
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
  return (
    <main className={`realtime-app realtime-mode-${mode}`}>
      <p aria-live="polite" className="realtime-announcer" role="status">
        Realtime ready.
      </p>
      <RealtimeContext.Provider value={{ actions, project, runtime }}>
        <WorkspaceProvider host={host}>
          <div className="realtime-app-chrome">
            <header className="realtime-app-header">
              <div>
                <span
                  className="realtime-app-eyebrow"
                  title={runtimeTitle(project.runtime)}
                >
                  Setta Realtime
                </span>
                <h1>{project.name}</h1>
              </div>
              <div className="realtime-app-controls">
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
                {mode === "author" ? (
                  <button
                    className="realtime-mode-exit"
                    onClick={() => setMode("use")}
                    type="button"
                  >
                    Use
                  </button>
                ) : null}
              </div>
            </header>
            <RuntimeFeedback error={error} runtime={runtime} />
          </div>
          <div className="realtime-workspace">
            <RealtimeWorkspace host={host} mode={mode} />
          </div>
        </WorkspaceProvider>
      </RealtimeContext.Provider>
    </main>
  );
}

function LoadingRealtimeView({ error }: { error: string | null }) {
  return (
    <main className="realtime-app realtime-mode-use">
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

function RealtimeWorkspace({
  host,
  mode,
}: {
  host: WorkspaceHost;
  mode: "author" | "use";
}) {
  const [viewState, setViewState] = useState<WorkspaceShellViewState>(() =>
    createWorkspaceShellViewState({ trailingTabId: "runtime" }),
  );
  useLayoutEffect(() => {
    const editable = mode === "author";
    setWorkspaceCapabilities(host, {
      canEditLayout: editable,
      canEditStructure: editable,
    });
  }, [host, mode]);
  const handleViewStateChange = useCallback(
    (next: WorkspaceShellViewState) => setViewState(next),
    [],
  );
  return (
    <WorkspaceShell
      ariaLabel="Realtime workspace"
      includeBuiltInInspector={mode === "author"}
      includeBuiltInSavedViews={false}
      leadingPaneShiftsCanvas={true}
      leadingTabs={EMPTY_TABS}
      onViewStateChange={handleViewStateChange}
      trailingTabs={REALTIME_RUNTIME_TABS}
      viewState={viewState}
    />
  );
}
