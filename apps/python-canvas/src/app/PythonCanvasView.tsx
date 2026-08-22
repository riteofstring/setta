import { useEffect, useRef } from "react";
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
  callableFormOpen: boolean;
  mutationContext: PythonCanvasMutationContextValue;
  newCallableName: string;
  onCloseCallableForm: () => void;
  onCreateCallable: (name: string) => void;
  onNewCallableNameChange: (name: string) => void;
  onOpenCallableForm: () => void;
  onProjectNameChange: (name: string) => void;
  onRenameProject: (name: string) => void;
  project: ProjectSnapshotV2 | null;
  projectNameDraft: string;
  projectMutation: ViewMutation;
  pythonTargetCompletionError: string | null;
  state: ViewState;
};

export function PythonCanvasView(props: PythonCanvasViewProps) {
  return (
    <main className="python-canvas-app">
      <PythonCanvasStatus
        announcement={props.announcement}
        project={props.project}
        state={props.state}
      />
      <PythonCanvasLoadError state={props.state} />
      <PythonCanvasMutationError projectMutation={props.projectMutation} />
      <PythonCanvasCompletionError error={props.pythonTargetCompletionError} />
      <PythonCanvasReadyProject {...props} />
    </main>
  );
}

function PythonCanvasStatus({
  announcement,
  project,
  state,
}: Pick<PythonCanvasViewProps, "announcement" | "project" | "state">) {
  return (
    <div className="python-canvas-heading">
      <h1>Python Canvas</h1>
      <p
        aria-busy={announcement.kind === "pending"}
        aria-live="polite"
        className="python-canvas-status"
        role="status"
      >
        {pythonCanvasStatusMessage(state, announcement, project)}
      </p>
    </div>
  );
}

function pythonCanvasStatusMessage(
  state: ViewState,
  announcement: ViewMutation,
  project: ProjectSnapshotV2 | null,
): string {
  if (state.kind === "loading") {
    return "Loading project.";
  }
  if (state.kind === "error") {
    return "Project could not be loaded.";
  }
  if (announcement.kind === "pending") {
    return announcement.description;
  }
  if (announcement.kind === "error") {
    return announcement.message;
  }
  if (project?.providerStatus.status === "unavailable") {
    return "Project loaded. Basedpyright is unavailable.";
  }
  if (project?.providerStatus.state === "pending") {
    return "Project loaded. Basedpyright is not ready yet.";
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
  projectMutation: mutation,
}: Pick<PythonCanvasViewProps, "projectMutation">) {
  return (
    <p
      className={
        mutation.kind === "error"
          ? "python-canvas-error"
          : "python-canvas-announcer"
      }
      id="python-canvas-mutation-error"
    >
      {mutation.kind === "error" ? mutation.message : null}
    </p>
  );
}

function PythonCanvasCompletionError({ error }: { error: string | null }) {
  if (error === null) {
    return null;
  }
  return (
    <p
      className="python-canvas-completion-error"
      id={pythonTargetCompletionErrorId}
      role="alert"
    >
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
      <PythonCanvasEmptyState
        onOpenCallableForm={props.onOpenCallableForm}
        project={props.project}
      />
      <div className="python-canvas-workspace">
        <PythonCanvasMutationContext.Provider value={props.mutationContext}>
          <PythonTargetCompletionErrorProvider
            error={props.pythonTargetCompletionError}
          >
            <WorkspaceProvider host={props.state.host}>
              <WorkspaceCanvas />
            </WorkspaceProvider>
          </PythonTargetCompletionErrorProvider>
        </PythonCanvasMutationContext.Provider>
      </div>
    </>
  );
}

function PythonCanvasProjectControls({
  callableFormOpen,
  newCallableName,
  onCloseCallableForm,
  onCreateCallable,
  onNewCallableNameChange,
  onOpenCallableForm,
  onProjectNameChange,
  onRenameProject,
  projectNameDraft,
  projectMutation,
}: Pick<
  PythonCanvasViewProps,
  | "callableFormOpen"
  | "newCallableName"
  | "onCloseCallableForm"
  | "onCreateCallable"
  | "onNewCallableNameChange"
  | "onOpenCallableForm"
  | "onProjectNameChange"
  | "onRenameProject"
  | "projectNameDraft"
  | "projectMutation"
>) {
  const callableNameInput = useRef<HTMLInputElement>(null);
  const pending = projectMutation.kind === "pending";
  const mutationErrorId =
    projectMutation.kind === "error"
      ? "python-canvas-mutation-error"
      : undefined;
  useEffect(() => {
    if (callableFormOpen) {
      callableNameInput.current?.focus();
    }
  }, [callableFormOpen]);
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
          aria-describedby={mutationErrorId}
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
      {callableFormOpen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onCreateCallable(newCallableName);
          }}
        >
          <label htmlFor="python-canvas-new-callable">New callable name</label>
          <input
            aria-describedby={mutationErrorId}
            id="python-canvas-new-callable"
            name="new-callable-name"
            onChange={(event) => onNewCallableNameChange(event.target.value)}
            ref={callableNameInput}
            required
            type="text"
            value={newCallableName}
          />
          <button disabled={pending} type="submit">
            Add callable
          </button>
          <button
            disabled={pending}
            onClick={onCloseCallableForm}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={onOpenCallableForm} type="button">
          Add callable
        </button>
      )}
    </section>
  );
}

function PythonCanvasEmptyState({
  onOpenCallableForm,
  project,
}: Pick<PythonCanvasViewProps, "onOpenCallableForm" | "project">) {
  if (project === null || project.callables.length !== 0) {
    return null;
  }
  return (
    <section
      className="python-canvas-empty-state"
      aria-labelledby="python-canvas-empty-heading"
    >
      <h2 id="python-canvas-empty-heading">No callables yet</h2>
      <p>
        Callables are Python functions or methods that Python Canvas can call
        after their signature is resolved. Add one to author its Python
        expression and parameters.
      </p>
      <button onClick={onOpenCallableForm} type="button">
        Add callable
      </button>
    </section>
  );
}
