import {
  WorkspaceCanvas,
  WorkspaceProvider,
  type WorkspaceHost,
} from "@setta/workspace";

import type { ProjectSnapshotV2 } from "../backend/generatedContract";
import {
  PythonCanvasMutationContext,
  type PythonCanvasMutationContextValue,
} from "./PythonCanvasMutationContext";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; host: WorkspaceHost }
  | { kind: "error" };

type ViewMutation =
  | { kind: "idle" }
  | { description: string; kind: "pending" }
  | { kind: "error"; message: string };

type PythonCanvasViewProps = {
  mutation: ViewMutation;
  mutationContext: PythonCanvasMutationContextValue;
  newCallableName: string;
  onCreateCallable: (name: string) => void;
  onNewCallableNameChange: (name: string) => void;
  onProjectNameChange: (name: string) => void;
  onRenameProject: (name: string) => void;
  project: ProjectSnapshotV2 | null;
  projectNameDraft: string;
  pythonTargetCompletionError: string | null;
  state: ViewState;
};

export function PythonCanvasView(props: PythonCanvasViewProps) {
  return (
    <main className="python-canvas-app">
      <PythonCanvasStatus
        mutation={props.mutation}
        project={props.project}
        state={props.state}
      />
      <PythonCanvasLoadError state={props.state} />
      <PythonCanvasMutationError mutation={props.mutation} />
      <PythonCanvasCompletionError error={props.pythonTargetCompletionError} />
      <PythonCanvasReadyProject {...props} />
    </main>
  );
}

function PythonCanvasStatus({
  mutation,
  project,
  state,
}: Pick<PythonCanvasViewProps, "mutation" | "project" | "state">) {
  return (
    <div className="python-canvas-heading">
      <h1>Python Canvas</h1>
      <p className="python-canvas-status" role="status" aria-live="polite">
        {pythonCanvasStatusMessage(state, mutation, project)}
      </p>
    </div>
  );
}

function pythonCanvasStatusMessage(
  state: ViewState,
  mutation: ViewMutation,
  project: ProjectSnapshotV2 | null,
): string {
  if (state.kind === "loading") {
    return "Loading project.";
  }
  if (state.kind === "error") {
    return "Project could not be loaded.";
  }
  if (mutation.kind === "pending") {
    return mutation.description;
  }
  if (project?.providerStatus.status === "unavailable") {
    return "Project loaded. Basedpyright is unavailable.";
  }
  return "Project loaded.";
}

function PythonCanvasLoadError({
  state,
}: Pick<PythonCanvasViewProps, "state">) {
  if (state.kind !== "error") {
    return null;
  }
  return (
    <p className="python-canvas-error" role="alert">
      Unable to load Python Canvas. Check that the backend is running and reload
      the page.
    </p>
  );
}

function PythonCanvasMutationError({
  mutation,
}: Pick<PythonCanvasViewProps, "mutation">) {
  if (mutation.kind !== "error") {
    return null;
  }
  return (
    <p className="python-canvas-error" role="alert">
      {mutation.message}
    </p>
  );
}

function PythonCanvasCompletionError({ error }: { error: string | null }) {
  if (error === null) {
    return null;
  }
  return (
    <p className="python-canvas-completion-error" role="alert">
      {error}
    </p>
  );
}

function PythonCanvasReadyProject(props: PythonCanvasViewProps) {
  if (props.state.kind !== "ready" || props.project === null) {
    return null;
  }
  return (
    <>
      <PythonCanvasProjectControls {...props} />
      <PythonCanvasEmptyState project={props.project} />
      <div className="python-canvas-workspace">
        <PythonCanvasMutationContext.Provider value={props.mutationContext}>
          <WorkspaceProvider host={props.state.host}>
            <WorkspaceCanvas />
          </WorkspaceProvider>
        </PythonCanvasMutationContext.Provider>
      </div>
    </>
  );
}

function PythonCanvasProjectControls({
  mutation,
  newCallableName,
  onCreateCallable,
  onNewCallableNameChange,
  onProjectNameChange,
  onRenameProject,
  projectNameDraft,
}: Pick<
  PythonCanvasViewProps,
  | "mutation"
  | "newCallableName"
  | "onCreateCallable"
  | "onNewCallableNameChange"
  | "onProjectNameChange"
  | "onRenameProject"
  | "projectNameDraft"
>) {
  const pending = mutation.kind === "pending";
  return (
    <section
      className="python-canvas-project-controls"
      aria-label="Project controls"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onRenameProject(projectNameDraft);
        }}
      >
        <label htmlFor="python-canvas-project-name">Project name</label>
        <input
          id="python-canvas-project-name"
          name="project-name"
          onChange={(event) => onProjectNameChange(event.target.value)}
          required
          type="text"
          value={projectNameDraft}
        />
        <button disabled={pending} type="submit">
          Rename project
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreateCallable(newCallableName);
        }}
      >
        <label htmlFor="python-canvas-new-callable">New callable name</label>
        <input
          id="python-canvas-new-callable"
          name="new-callable-name"
          onChange={(event) => onNewCallableNameChange(event.target.value)}
          required
          type="text"
          value={newCallableName}
        />
        <button disabled={pending} type="submit">
          Add callable
        </button>
      </form>
    </section>
  );
}

function PythonCanvasEmptyState({ project }: { project: ProjectSnapshotV2 }) {
  if (project.callables.length !== 0) {
    return null;
  }
  return (
    <section
      className="python-canvas-empty-state"
      aria-labelledby="python-canvas-empty-heading"
    >
      <h2 id="python-canvas-empty-heading">No callables yet</h2>
      <p>
        Add a callable to begin authoring its Python expression and parameters.
      </p>
    </section>
  );
}
