import {
  WorkspaceCanvas,
  WorkspaceProvider,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  PythonCanvasMutationContext,
  type PythonCanvasMutationContextValue,
} from "./PythonCanvasMutationContext";
import {
  PythonTargetCompletionErrorProvider,
  pythonTargetCompletionErrorId,
} from "./PythonTargetCompletionBoundary";

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
      <PythonCanvasReadyWorkspace {...props} />
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

function PythonCanvasReadyWorkspace({
  mutationContext,
  pythonTargetCompletionError,
  state,
}: PythonCanvasViewProps) {
  if (state.kind !== "ready") {
    return null;
  }
  return (
    <div className="python-canvas-workspace">
      <PythonCanvasMutationContext.Provider value={mutationContext}>
        <PythonTargetCompletionErrorProvider
          error={pythonTargetCompletionError}
        >
          <WorkspaceProvider host={state.host}>
            <WorkspaceCanvas />
          </WorkspaceProvider>
        </PythonTargetCompletionErrorProvider>
      </PythonCanvasMutationContext.Provider>
    </div>
  );
}
