import {
  WorkspaceProvider,
  WorkspaceShell,
  type WorkspaceHost,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
} from "@setta/workspace";
import { useCallback, useState } from "react";

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

const EMPTY_SHELL_TABS: ReadonlyArray<WorkspaceShellTabDefinition> = [];

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
  pythonTargetCompletionError: string | null;
  state: ViewState;
  terminalContext: GeneratedPythonTerminalContextValue;
};

type PythonCanvasReadyWorkspaceProps = Omit<
  PythonCanvasViewProps,
  "state"
> & {
  state: Extract<ViewState, { kind: "ready" }>;
};

export function PythonCanvasView(props: PythonCanvasViewProps) {
  return (
    <main className="python-canvas-app">
      <PythonCanvasStatus
        announcement={props.announcement}
        state={props.state}
      />
      <PythonCanvasLoadError state={props.state} />
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
}: Pick<PythonCanvasViewProps, "state">) {
  return (
    <p className="python-canvas-announcer" role="alert">
      {state.kind === "error"
        ? "Unable to load Python Canvas. Check that the backend is running and reload the page."
        : null}
    </p>
  );
}

function PythonCanvasMutationError({
  announcement: mutation,
}: Pick<PythonCanvasViewProps, "announcement">) {
  return (
    <p
      className="python-canvas-announcer"
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
      className="python-canvas-announcer"
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
      className="python-canvas-announcer"
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
  const [shellViewState, setShellViewState] =
    useState<WorkspaceShellViewState>(loadPythonCanvasShellViewState);
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
              <WorkspaceShell
                ariaLabel="Python Canvas workspace"
                leadingPaneShiftsCanvas={true}
                leadingTabs={EMPTY_SHELL_TABS}
                onViewStateChange={handleShellViewStateChange}
                trailingTabs={EMPTY_SHELL_TABS}
                viewState={shellViewState}
              />
            </WorkspaceProvider>
          </PythonTargetCompletionErrorProvider>
        </GeneratedPythonTerminalContext.Provider>
      </PythonCanvasMutationContext.Provider>
    </div>
  );
}
