import { useEffect, useMemo, useRef, useState } from "react";
import {
  WORKSPACE_CODE_SECTION_KIND,
  WorkspaceCanvas,
  WorkspaceProvider,
  createWorkspaceCodeSection,
  createWorkspaceHost,
  registerSectionKinds,
  type TextValueCompletionProvider,
  type WorkspaceDocument,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  ProjectClientError,
  commitCallable,
  fetchProjectSnapshot,
  setParameterExpression,
} from "../backend/client";
import type { ProjectSnapshotV1 } from "../backend/generatedContract";
import {
  PARAMETER_ITEM_ID,
  CallableSection,
  readCallableSectionData,
  readParameterItemData,
} from "../sections/CallableSection";
import { createCallableCompletionProvider } from "../sections/callableCompletion";
import {
  CALLABLE_SECTION_ID,
  CALLABLE_SECTION_KIND,
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_SIZE,
  applyProjectSnapshotToWorkspace,
  projectWorkspaceDocument,
  setParameterItemDisabled,
  setParameterItemExpression,
} from "./workspaceProjection";
import {
  PythonCanvasMutationContext,
  type PythonCanvasMutationContextValue,
} from "./PythonCanvasMutationContext";

const parameterMutationDebounceMs = 300;

type AppState =
  | { kind: "loading" }
  | { kind: "ready"; host: WorkspaceHost }
  | { kind: "error" };

type MutationState =
  | { kind: "idle" }
  | { description: string; kind: "pending" }
  | { kind: "error"; message: string };

type AppController = {
  commitCallable: (value: string) => void;
  setCallableDraft: (value: string) => void;
  setParameterExpression: (parameterID: string, value: string) => void;
};

export function registerPythonCanvasSectionKinds(host: WorkspaceHost): void {
  registerSectionKinds(host, {
    [CALLABLE_SECTION_KIND]: {
      defaultSize: CALLABLE_SECTION_SIZE,
      contentClassName: "python-canvas-callable-section-content",
      assertValidData: (section) => {
        readCallableSectionData(section.data);
      },
      renderContent: (section) => (
        <CallableSection data={readCallableSectionData(section.data)} />
      ),
    },
    [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
      defaultSize: GENERATED_PYTHON_SECTION_SIZE,
      languages: ["python"],
    }),
  });
}

export function PythonCanvasApp() {
  const [state, setState] = useState<AppState>({ kind: "loading" });
  const [callableDraft, setCallableDraft] = useState("");
  const [callableCompletionProvider, setCallableCompletionProvider] =
    useState<TextValueCompletionProvider>();
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [mutation, setMutation] = useState<MutationState>({ kind: "idle" });
  const controllerRef = useRef<AppController | null>(null);
  const isProjectingRef = useRef(false);

  useEffect(() => {
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);

    let active = true;
    let disposed = false;
    let snapshot: ProjectSnapshotV1 | null = null;
    let parameterTimer: ReturnType<typeof setTimeout> | null = null;
    let mutationChain = Promise.resolve();

    const disposeHost = () => {
      if (!disposed) {
        disposed = true;
        host.dispose();
      }
    };
    const updateMutation = (next: MutationState) => {
      if (active) {
        setMutation(next);
      }
    };
    const clearError = () => {
      if (active) {
        setMutation((current) =>
          current.kind === "error" ? { kind: "idle" } : current,
        );
      }
    };
    const applyProjection = (nextSnapshot: ProjectSnapshotV1) => {
      isProjectingRef.current = true;
      try {
        applyProjectSnapshotToWorkspace(host, nextSnapshot);
      } finally {
        isProjectingRef.current = false;
      }
    };
    const setParameterDisabled = (disabled: boolean) => {
      isProjectingRef.current = true;
      try {
        setParameterItemDisabled(host, disabled);
      } finally {
        isProjectingRef.current = false;
      }
    };
    const handleMutationError = (target: string, error: unknown) => {
      updateMutation({
        kind: "error",
        message: mutationErrorMessage(target, error),
      });
    };
    const enqueue = (operation: () => Promise<void>) => {
      const run = async () => {
        try {
          await operation();
        } catch (error) {
          handleMutationError("project", error);
        }
      };
      mutationChain = mutationChain.then(run, run);
    };
    const cancelScheduledParameterMutation = () => {
      if (parameterTimer !== null) {
        clearTimeout(parameterTimer);
        parameterTimer = null;
      }
    };
    const commitCallableMutation = (value: string) => {
      cancelScheduledParameterMutation();
      enqueue(async () => {
        if (!active || snapshot === null) {
          return;
        }
        updateMutation({
          description: "Checking the callable with Basedpyright.",
          kind: "pending",
        });
        setParameterDisabled(true);
        try {
          const nextSnapshot = await commitCallable({
            authoredExpression: value,
            projectId: snapshot.project.id,
            sectionId: snapshot.callables[0].id,
          });
          if (!active) {
            return;
          }
          snapshot = nextSnapshot;
          applyProjection(nextSnapshot);
          setCallableDraft(nextSnapshot.callables[0].authoredExpression);
          updateMutation({ kind: "idle" });
        } catch (error) {
          if (!active) {
            return;
          }
          setParameterDisabled(false);
          handleMutationError("callable", error);
        }
      });
    };
    const scheduleParameterMutation = (parameterID: string, value: string) => {
      cancelScheduledParameterMutation();
      parameterTimer = setTimeout(() => {
        parameterTimer = null;
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          const parameter = snapshot.parameters.find(
            (candidate) => candidate.id === parameterID,
          );
          if (
            parameter === undefined ||
            parameter.authoredExpression === value
          ) {
            return;
          }
          updateMutation({
            description: `Checking the ${parameter.name} expression with Basedpyright.`,
            kind: "pending",
          });
          setParameterDisabled(true);
          try {
            const nextSnapshot = await setParameterExpression({
              authoredExpression: value,
              parameterId: parameterID,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            applyProjection(nextSnapshot);
            setCallableDraft(nextSnapshot.callables[0].authoredExpression);
            updateMutation({ kind: "idle" });
          } catch (error) {
            if (!active) {
              return;
            }
            setParameterDisabled(false);
            handleMutationError(`${parameter.name} expression`, error);
          }
        });
      }, parameterMutationDebounceMs);
    };

    controllerRef.current = {
      commitCallable: (value) => {
        if (!active) {
          return;
        }
        setCallableDraft(value);
        setCompletionError(null);
        clearError();
        commitCallableMutation(value);
      },
      setCallableDraft: (value) => {
        if (!active) {
          return;
        }
        setCallableDraft(value);
        setCompletionError(null);
        clearError();
      },
      setParameterExpression: (parameterID, value) => {
        if (!active) {
          return;
        }
        clearError();
        setParameterItemExpression(host, parameterID, value);
      },
    };

    const unsubscribe = host.subscribe((document) => {
      if (isProjectingRef.current || snapshot === null || !active) {
        return;
      }
      const nextMutation = pendingParameterMutation(document, snapshot);
      if (nextMutation === null) {
        return;
      }
      scheduleParameterMutation(nextMutation.parameterID, nextMutation.value);
    });

    const load = async () => {
      try {
        const initialSnapshot = await fetchProjectSnapshot();
        if (!active) {
          return;
        }
        snapshot = initialSnapshot;
        setCallableCompletionProvider(() =>
          createCallableCompletionProvider({
            onFailure: (message) => {
              if (active) {
                setCompletionError(message);
              }
            },
            onSuccess: () => {
              if (active) {
                setCompletionError(null);
              }
            },
            projectId: initialSnapshot.project.id,
            sectionId: initialSnapshot.callables[0].id,
          }),
        );
        isProjectingRef.current = true;
        try {
          host.loadDocument(projectWorkspaceDocument(initialSnapshot));
        } finally {
          isProjectingRef.current = false;
        }
        setCallableDraft(initialSnapshot.callables[0].authoredExpression);
        setState({ kind: "ready", host });
      } catch {
        if (!active) {
          return;
        }
        disposeHost();
        setState({ kind: "error" });
      }
    };

    void load();

    return () => {
      active = false;
      cancelScheduledParameterMutation();
      controllerRef.current = null;
      unsubscribe();
      disposeHost();
    };
  }, []);

  const mutationContext = useMemo<PythonCanvasMutationContextValue>(
    () => ({
      callableCompletionProvider,
      callableDraft,
      completionError,
      mutationError: mutation.kind === "error" ? mutation.message : null,
      onCallableCommit: (value) => controllerRef.current?.commitCallable(value),
      onCallableDraftChange: (value) =>
        controllerRef.current?.setCallableDraft(value),
      onParameterExpressionChange: (parameterID, value) =>
        controllerRef.current?.setParameterExpression(parameterID, value),
      pendingDescription:
        mutation.kind === "pending" ? mutation.description : null,
    }),
    [callableCompletionProvider, callableDraft, completionError, mutation],
  );

  const statusMessage =
    state.kind === "loading"
      ? "Loading project."
      : state.kind === "ready"
        ? mutation.kind === "pending"
          ? "Updating project."
          : "Project loaded."
        : "Project could not be loaded.";

  return (
    <main className="python-canvas-app">
      <div className="python-canvas-heading">
        <h1>Python Canvas</h1>
        <p className="python-canvas-status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </div>
      {state.kind === "error" ? (
        <p className="python-canvas-error" role="alert">
          Unable to load Python Canvas. Check that the backend is running and
          reload the page.
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <div className="python-canvas-workspace">
          <PythonCanvasMutationContext.Provider value={mutationContext}>
            <WorkspaceProvider host={state.host}>
              <WorkspaceCanvas />
            </WorkspaceProvider>
          </PythonCanvasMutationContext.Provider>
        </div>
      ) : null}
    </main>
  );
}

function pendingParameterMutation(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV1,
): { parameterID: string; value: string } | null {
  const item =
    document.sections[CALLABLE_SECTION_ID]?.itemTree?.items[PARAMETER_ITEM_ID];
  if (item === undefined) {
    return null;
  }
  const parameterItem = readParameterItemData(item.data);
  if (parameterItem.kind === "empty" || parameterItem.disabled) {
    return null;
  }
  const parameter = snapshot.parameters.find(
    (candidate) => candidate.id === parameterItem.parameterId,
  );
  if (
    parameter === undefined ||
    parameter.authoredExpression === parameterItem.authoredExpression
  ) {
    return null;
  }
  return {
    parameterID: parameterItem.parameterId,
    value: parameterItem.authoredExpression,
  };
}

function mutationErrorMessage(target: string, error: unknown): string {
  if (error instanceof ProjectClientError) {
    return `Unable to update ${target}. ${error.message}`;
  }
  return `Unable to update ${target}. Try again.`;
}
