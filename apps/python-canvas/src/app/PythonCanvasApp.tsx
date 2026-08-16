import { useEffect, useMemo, useRef, useState } from "react";
import {
  WORKSPACE_CODE_SECTION_KIND,
  WorkspaceCanvas,
  WorkspaceProvider,
  createWorkspaceCodeSection,
  createWorkspaceHost,
  registerSectionKinds,
  setWorkspaceColorMode,
  type TextValueCompletionProvider,
  type WorkspaceDocument,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  ProjectClientError,
  commitCallable,
  fetchProjectSnapshot,
  setCallableParameters,
} from "../backend/client";
import type {
  ParameterProposalV1,
  ProjectSnapshotV1,
} from "../backend/generatedContract";
import {
  CallableExpressionField,
  CallableSection,
  parameterItemSearchableText,
  readCallableSectionData,
} from "../sections/CallableSection";
import { createCallableCompletionProvider } from "../sections/callableCompletion";
import {
  CALLABLE_SECTION_KIND,
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_SIZE,
  applyProjectSnapshotKeepingParameterList,
  applyProjectSnapshotToWorkspace,
  createCallableParameterItem,
  projectWorkspaceDocument,
  readCallableParameterItemIds,
  readCallableParameterItems,
  setParameterItemExpression,
  setParameterItemName,
  setParameterItemsDisabled,
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
  revertCallableDraft: () => void;
  setCallableDraft: (value: string) => void;
  setParameterExpression: (parameterID: string, value: string) => void;
  setParameterName: (parameterID: string, name: string) => void;
};

export function registerPythonCanvasSectionKinds(host: WorkspaceHost): void {
  registerSectionKinds(host, {
    [CALLABLE_SECTION_KIND]: {
      defaultSize: CALLABLE_SECTION_SIZE,
      assertValidData: (section) => {
        readCallableSectionData(section.data);
      },
      // The callable editor is this section's primary control, so it is the package's leading
      // item-area content. The toolbar is the ordinary authoring one: Add, Remove Last, and Delete
      // Selected all reach the canonical parameter-list mutation behind this section.
      itemArea: {
        renderLeadingContent: () => <CallableExpressionField />,
        toolbar: "authoring-and-filter",
      },
      createItem: () => createCallableParameterItem(host),
      getItemSearchableText: (context) =>
        parameterItemSearchableText(context.item),
      renderContent: (section) => (
        <CallableSection
          data={readCallableSectionData(section.data)}
          parameterItemIds={readCallableParameterItemIds(section)}
        />
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
    // The package paints a light and a dark surface, and this view has no appearance control of
    // its own, so it follows the reader's system appearance and its own chrome does the same in
    // index.css. Appearance is resolved before the document loads because node projection derives
    // section-style backgrounds from it.
    setWorkspaceColorMode(host, "system");
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
    const applyProjectionKeepingParameterList = (
      nextSnapshot: ProjectSnapshotV1,
    ) => {
      isProjectingRef.current = true;
      try {
        applyProjectSnapshotKeepingParameterList(host, nextSnapshot);
      } finally {
        isProjectingRef.current = false;
      }
    };
    const setParametersDisabled = (disabled: boolean) => {
      isProjectingRef.current = true;
      try {
        setParameterItemsDisabled(host, disabled);
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
    // A rejected proposal leaves the workspace document holding an edit the project never took, so
    // the canonical snapshot is put back before the failure is reported.
    const restoreCanonicalParameters = () => {
      if (snapshot !== null) {
        applyProjection(snapshot);
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
        setParametersDisabled(true);
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
          setParametersDisabled(false);
          handleMutationError("callable", error);
        }
      });
    };
    // A structural action runs in the package the moment it is clicked, so the document can already
    // hold a newer list than the one this response answers. That list is what the person last asked
    // for, so the canonical one is not rebuilt over it: the project's own data lands on the rows
    // that survive and the newer list is proposed in turn.
    const acceptParameterListResponse = (
      sent: Array<ParameterProposalV1>,
      nextSnapshot: ProjectSnapshotV1,
    ) => {
      const moved = !sameProposedList(
        sent,
        proposedParameterList(host.getSnapshot()),
      );
      if (moved) {
        applyProjectionKeepingParameterList(nextSnapshot);
      } else {
        applyProjection(nextSnapshot);
      }
      setCallableDraft(nextSnapshot.callables[0].authoredExpression);
      updateMutation({ kind: "idle" });
      if (moved) {
        scheduleParameterListMutation();
      }
    };
    // One debounce coalesces every proposal the workspace document produces — a value edit, a
    // rename, an Add, a Remove Last, a Delete Selected, or a drag reorder — into one complete
    // revision-bound parameter list.
    const scheduleParameterListMutation = () => {
      cancelScheduledParameterMutation();
      parameterTimer = setTimeout(() => {
        parameterTimer = null;
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          const proposal = proposedParameterList(host.getSnapshot());
          if (proposal === null || sameParameterList(proposal, snapshot)) {
            return;
          }
          const revision = snapshot.project.revision;
          updateMutation({
            description: "Checking the parameters with Basedpyright.",
            kind: "pending",
          });
          setParametersDisabled(true);
          try {
            const nextSnapshot = await setCallableParameters({
              callableId: snapshot.callables[0].id,
              expectedRevision: revision,
              parameters: proposal,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptParameterListResponse(proposal, nextSnapshot);
          } catch (error) {
            if (!active) {
              return;
            }
            restoreCanonicalParameters();
            handleMutationError("the parameters", error);
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
      revertCallableDraft: () => {
        if (!active || snapshot === null) {
          return;
        }
        // The canonical expression is the one the store last accepted, so an abandoned draft has
        // nothing of its own left to keep.
        setCallableDraft(snapshot.callables[0].authoredExpression);
        setCompletionError(null);
        clearError();
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
      setParameterName: (parameterID, name) => {
        if (!active) {
          return;
        }
        clearError();
        setParameterItemName(host, parameterID, name);
      },
    };

    // Every parameter change reaches the project the same way: the package's own funnels write the
    // controlled document, and this subscription proposes whatever list that document now holds.
    const unsubscribe = host.subscribe((document) => {
      if (isProjectingRef.current || snapshot === null || !active) {
        return;
      }
      const proposal = proposedParameterList(document);
      if (proposal === null || sameParameterList(proposal, snapshot)) {
        return;
      }
      scheduleParameterListMutation();
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
      onCallableRevert: () => controllerRef.current?.revertCallableDraft(),
      onParameterExpressionChange: (parameterID, value) =>
        controllerRef.current?.setParameterExpression(parameterID, value),
      onParameterNameChange: (parameterID, name) =>
        controllerRef.current?.setParameterName(parameterID, name),
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

// The complete ordered candidate the workspace document currently holds. A disabled row is one
// whose mutation is already in flight, so its document state is not a new proposal.
function proposedParameterList(
  document: WorkspaceDocument,
): Array<ParameterProposalV1> | null {
  const items = readCallableParameterItems(document);
  if (items.some((item) => item.data.disabled)) {
    return null;
  }
  return items.map((item) => ({
    authoredExpression: item.data.authoredExpression,
    id: item.id,
    name: item.data.name,
  }));
}

// Whether the document still holds the exact list a proposal was made from. A disabled row reads as
// no proposal at all, which is not the same list.
function sameProposedList(
  sent: Array<ParameterProposalV1>,
  current: Array<ParameterProposalV1> | null,
): boolean {
  return (
    current !== null &&
    current.length === sent.length &&
    current.every((proposed, index) => {
      const original = sent[index];
      return (
        original !== undefined &&
        original.id === proposed.id &&
        original.name === proposed.name &&
        original.authoredExpression === proposed.authoredExpression
      );
    })
  );
}

function sameParameterList(
  proposal: Array<ParameterProposalV1>,
  snapshot: ProjectSnapshotV1,
): boolean {
  const canonical = snapshot.callables[0].parameterIds;
  if (proposal.length !== canonical.length) {
    return false;
  }
  return proposal.every((proposed, index) => {
    const parameter = snapshot.parameters.find(
      (candidate) => candidate.id === canonical[index],
    );
    return (
      parameter !== undefined &&
      parameter.id === proposed.id &&
      parameter.name === proposed.name &&
      parameter.authoredExpression === proposed.authoredExpression
    );
  });
}

function mutationErrorMessage(target: string, error: unknown): string {
  if (error instanceof ProjectClientError) {
    return `Unable to update ${target}. ${error.message}`;
  }
  return `Unable to update ${target}. Try again.`;
}
