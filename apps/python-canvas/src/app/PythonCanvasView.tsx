import {
  WorkspaceProvider,
  WorkspaceParameterConfigurationIcon,
  WorkspaceSectionEditor,
  WorkspaceSectionSettingsIcon,
  WorkspaceShell,
  WorkspaceQuickStartIcon,
  createWorkspaceShellViewState,
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

import { PythonCanvasPlayground } from "./PythonCanvasPlayground";
import {
  DisplayContext,
  DisplayToolbar,
  type DisplayContextValue,
} from "./displayContext";
import { getPlayground } from "./playgroundCatalog";

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
  | { kind: "ready"; host: WorkspaceHost; projectId?: string }
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
  displayContext?: DisplayContextValue;
};

type PythonCanvasReadyWorkspaceProps = Omit<PythonCanvasViewProps, "state"> & {
  state: Extract<ViewState, { kind: "ready" }>;
};

export function PythonCanvasView(props: PythonCanvasViewProps) {
  return (
    <DisplayContext.Provider value={props.displayContext ?? null}>
      <main className="python-canvas-app">
        <PythonCanvasStatus
          announcement={props.announcement}
          state={props.state}
        />
        <PythonCanvasLoadError state={props.state} onRetry={props.onRetry} />
        <PythonCanvasMutationError announcement={props.announcement} />
        <PythonCanvasCompletionError
          error={props.pythonTargetCompletionError}
        />
        <PythonCanvasTerminalError error={props.terminalContext.state.error} />
        <DisplayToolbar />
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
    </DisplayContext.Provider>
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
    () =>
      getPlayground(state.projectId) !== undefined
        ? createWorkspaceShellViewState({
            leadingTabId: "start-here",
            trailingTabId: PYTHON_CANVAS_SECTION_SETTINGS_TAB_ID,
          })
        : loadPythonCanvasShellViewState(),
  );
  const handleShellViewStateChange = useCallback(
    (nextState: WorkspaceShellViewState): void => {
      setShellViewState(nextState);
      persistPythonCanvasShellViewState({
        ...nextState,
        leading: {
          ...nextState.leading,
          selectedTabId:
            nextState.leading.selectedTabId === "start-here"
              ? "outline"
              : nextState.leading.selectedTabId,
        },
      });
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
                playgroundId={
                  getPlayground(state.projectId) ? state.projectId : undefined
                }
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
  playgroundId,
  onViewStateChange,
  viewState,
}: {
  playgroundId: string | undefined;
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
      includeSavedViewTabs={playgroundId !== undefined}
      leadingPaneShiftsCanvas={true}
      leadingTabs={
        playgroundId
          ? [
              {
                id: "start-here",
                label: "Start here",
                icon: WorkspaceQuickStartIcon,
                renderContent: () => (
                  <PythonCanvasPlayground
                    projectId={playgroundId}
                    onNavigate={() => {
                      if (window.matchMedia("(max-width: 720px)").matches) {
                        onViewStateChange({
                          ...viewState,
                          leading: { ...viewState.leading, visible: false },
                        });
                      }
                    }}
                  />
                ),
              },
            ]
          : EMPTY_SHELL_TABS
      }
      onViewStateChange={onViewStateChange}
      trailingTabs={trailingTabs}
      viewState={viewState}
    />
  );
}
