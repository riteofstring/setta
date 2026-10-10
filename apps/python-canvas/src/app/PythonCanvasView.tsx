import {
  WorkspaceProvider,
  WorkspaceParameterConfigurationIcon,
  WorkspaceSectionEditor,
  WorkspaceSectionSettingsIcon,
  WorkspaceShell,
  useWorkspaceDocumentSnapshot,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
} from "@setta/workspace";
import { useCallback, useMemo, useState } from "react";

import {
  PythonCanvasMutationContext,
  type PythonCanvasMutationContextValue,
} from "./PythonCanvasMutationContext";
import {
  PythonTargetCompletionErrorProvider,
  pythonTargetCompletionErrorId,
} from "./PythonTargetCompletionBoundary";
import {
  GeneratedPythonTerminalContext,
  type GeneratedPythonTerminalContextValue,
} from "./generatedPythonTerminalContext";
import {
  loadPythonCanvasShellViewState,
  persistPythonCanvasShellViewState,
} from "./pythonCanvasShellPreferences";
import {
  PythonCanvasParamsPane,
  getPythonCanvasParamsPaneModel,
} from "./PythonCanvasParamsPane";
import {
  PYTHON_CANVAS_PARAMS_TAB_ID,
  PYTHON_CANVAS_SECTION_SETTINGS_TAB_ID,
} from "./pythonCanvasRightPane";

const EMPTY_SHELL_TABS: ReadonlyArray<WorkspaceShellTabDefinition> = [];

const PYTHON_CANVAS_SECTION_TAB: WorkspaceShellTabDefinition = {
  icon: WorkspaceSectionSettingsIcon,
  id: PYTHON_CANVAS_SECTION_SETTINGS_TAB_ID,
  label: "Section",
  renderContent: () => <WorkspaceSectionEditor />,
};

const PYTHON_CANVAS_PARAMS_TAB: WorkspaceShellTabDefinition = {
  icon: WorkspaceParameterConfigurationIcon,
  id: PYTHON_CANVAS_PARAMS_TAB_ID,
  label: "Params",
  renderContent: () => <PythonCanvasParamsPane />,
};

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; host: WorkspaceHost }
  | { kind: "error" };

type ViewMutation =
  | { kind: "idle" }
  | { description: string; kind: "pending" }
  | { kind: "error"; message: string };

type PythonCanvasViewProps = {
  announcement: ViewMutation;
  mutationContext: PythonCanvasMutationContextValue;
  onRetry?: () => void;
  pythonTargetCompletionError: string | null;
  state: ViewState;
  terminalContext: GeneratedPythonTerminalContextValue;
};

type PythonCanvasReadyWorkspaceProps = Omit<PythonCanvasViewProps, "state"> & {
  state: Extract<ViewState, { kind: "ready" }>;
};

export function PythonCanvasView(props: PythonCanvasViewProps) {
  return (
    <main className="python-canvas-app">
      <PythonCanvasStatus
        announcement={props.announcement}
        state={props.state}
      />
      <PythonCanvasLoadError state={props.state} onRetry={props.onRetry} />
      <PythonCanvasMutationError announcement={props.announcement} />
      <PythonCanvasCompletionError error={props.pythonTargetCompletionError} />
      <PythonCanvasTerminalError error={props.terminalContext.state.error} />
      {props.state.kind === "ready" ? (
        <PythonCanvasReadyWorkspace
          announcement={props.announcement}
          mutationContext={props.mutationContext}
          pythonTargetCompletionError={props.pythonTargetCompletionError}
          state={props.state}
          terminalContext={props.terminalContext}
        />
      ) : null}
    </main>
  );
}

function PythonCanvasStatus({
  announcement,
  state,
}: Pick<PythonCanvasViewProps, "announcement" | "state">) {
  return (
    <p
      aria-busy={announcement.kind === "pending"}
      aria-live="polite"
      className="python-canvas-announcer"
      role="status"
    >
      {pythonCanvasStatusMessage(state, announcement)}
    </p>
  );
}

function pythonCanvasStatusMessage(
  state: ViewState,
  announcement: ViewMutation,
): string {
  if (state.kind === "loading") {
    return "Loading Python Canvas.";
  }
  if (state.kind === "error" || announcement.kind === "error") {
    return "";
  }
  if (announcement.kind === "pending") {
    return announcement.description;
  }
  return "Python Canvas ready.";
}

function PythonCanvasLoadError({
  state,
  onRetry,
}: Pick<PythonCanvasViewProps, "state" | "onRetry">) {
  if (state.kind === "ready") return null;
  return (
    <div className="python-canvas-load-state">
      <p role={state.kind === "error" ? "alert" : "status"}>
        {state.kind === "error"
          ? "Unable to connect to Python Canvas. Check that the app is running, then try again."
          : "Opening Python Canvas…"}
      </p>
      {state.kind === "error" ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

function PythonCanvasMutationError({
  announcement: mutation,
}: Pick<PythonCanvasViewProps, "announcement">) {
  return (
    <p
      className="python-canvas-error"
      id="python-canvas-mutation-error"
      role="alert"
    >
      {mutation.kind === "error" ? mutation.message : null}
    </p>
  );
}

function PythonCanvasCompletionError({ error }: { error: string | null }) {
  return (
    <p
      className="python-canvas-error"
      id={pythonTargetCompletionErrorId}
      role="alert"
    >
      {error}
    </p>
  );
}

function PythonCanvasTerminalError({ error }: { error: string | null }) {
  return (
    <p
      className="python-canvas-error"
      id="python-canvas-terminal-error"
      role="alert"
    >
      {error}
    </p>
  );
}

function PythonCanvasReadyWorkspace({
  mutationContext,
  pythonTargetCompletionError,
  state,
  terminalContext,
}: PythonCanvasReadyWorkspaceProps) {
  const [shellViewState, setShellViewState] = useState<WorkspaceShellViewState>(
    loadPythonCanvasShellViewState,
  );
  const handleShellViewStateChange = useCallback(
    (nextState: WorkspaceShellViewState): void => {
      setShellViewState(nextState);
      persistPythonCanvasShellViewState(nextState);
    },
    [],
  );
  return (
    <div className="python-canvas-workspace">
      <PythonCanvasMutationContext.Provider value={mutationContext}>
        <GeneratedPythonTerminalContext.Provider value={terminalContext}>
          <PythonTargetCompletionErrorProvider
            error={pythonTargetCompletionError}
          >
            <WorkspaceProvider host={state.host}>
              <PythonCanvasWorkspaceShell
                onViewStateChange={handleShellViewStateChange}
                viewState={shellViewState}
              />
            </WorkspaceProvider>
          </PythonTargetCompletionErrorProvider>
        </GeneratedPythonTerminalContext.Provider>
      </PythonCanvasMutationContext.Provider>
    </div>
  );
}

function PythonCanvasWorkspaceShell({
  onViewStateChange,
  viewState,
}: {
  onViewStateChange: (nextState: WorkspaceShellViewState) => void;
  viewState: WorkspaceShellViewState;
}) {
  const document = useWorkspaceDocumentSnapshot();
  const paramsEnabled = getPythonCanvasParamsPaneModel(document) !== null;
  const trailingTabs = useMemo<ReadonlyArray<WorkspaceShellTabDefinition>>(
    () => [
      PYTHON_CANVAS_SECTION_TAB,
      { ...PYTHON_CANVAS_PARAMS_TAB, disabled: !paramsEnabled },
    ],
    [paramsEnabled],
  );
  return (
    <WorkspaceShell
      ariaLabel="Python Canvas workspace"
      includeBuiltInInspector={false}
      includeBuiltInSavedViews={true}
      leadingPaneShiftsCanvas={true}
      leadingTabs={EMPTY_SHELL_TABS}
      onViewStateChange={onViewStateChange}
      trailingTabs={trailingTabs}
      viewState={viewState}
    />
  );
}
