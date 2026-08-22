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
  setPythonTarget,
} from "../backend/client";
import type {
  ParameterProposalV1,
  ProjectSnapshotV1,
  PythonTargetV1,
} from "../backend/generatedContract";
import {
  CallableExpressionField,
  CallableSection,
  parameterItemSearchableText,
  readCallableSectionData,
} from "../sections/CallableSection";
import { createCallableCompletionProvider } from "../sections/callableCompletion";
import { hasBlockingParameterName } from "../sections/parameterNames";
import {
  CALLABLE_SECTION_KIND,
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_SIZE,
  applyProjectSnapshotToWorkspace,
  createCallableParameterItem,
  generatedPythonRegionText,
  projectWorkspaceDocument,
  readCallableParameterItems,
  readCallableParameterRows,
  readGeneratedPythonTarget,
  setParameterItemExpression,
  setParameterItemName,
  setParameterItemsDisabled,
  type ProjectSnapshotProjectionOptions,
} from "./workspaceProjection";
import {
  PythonCanvasMutationContext,
  type PythonCanvasMutationContextValue,
} from "./PythonCanvasMutationContext";

// One coalescing window for every authored change the workspace document produces, whether it is
// a parameter list or the Python around the generated body.
const mutationDebounceMs = 300;

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
          parameters={readCallableParameterRows(section)}
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
    let targetTimer: ReturnType<typeof setTimeout> | null = null;
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
    const applyProjection = (
      nextSnapshot: ProjectSnapshotV1,
      options: ProjectSnapshotProjectionOptions = {
        keepAuthoredPython: false,
        keepParameterList: false,
      },
    ) => {
      isProjectingRef.current = true;
      try {
        applyProjectSnapshotToWorkspace(host, nextSnapshot, options);
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
    const cancelScheduledTargetMutation = () => {
      if (targetTimer !== null) {
        clearTimeout(targetTimer);
        targetTimer = null;
      }
    };
    // A rejected proposal leaves the workspace document holding an edit the project never took, so
    // the canonical snapshot is put back whole before the failure is reported.
    const restoreCanonicalProject = () => {
      if (snapshot !== null) {
        applyProjection(snapshot);
      }
    };
    const commitCallableMutation = (value: string) => {
      cancelScheduledParameterMutation();
      cancelScheduledTargetMutation();
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
          acceptCanonicalSnapshot(nextSnapshot, { kind: "redefined" });
        } catch (error) {
          if (!active) {
            return;
          }
          setParametersDisabled(false);
          handleMutationError("callable", error);
        }
      });
    };
    // A canonical response can arrive for a document that has already moved on: a structural action
    // runs in the package the moment it is clicked, and a keystroke in the generated document lands
    // the same way. Whatever the person changed since stays where they left it and is proposed in
    // turn; everything else the project owns lands, including the generated body they never author.
    //
    // The authored Python is compared against canonical outright, because the store changes the
    // target only when this client asks: a difference is always somebody's own unsent edit. The
    // parameter list has one case that is not — a response that redefines it, as a newly resolved
    // signature does — so what the response answers for decides the comparison.
    const acceptCanonicalSnapshot = (
      nextSnapshot: ProjectSnapshotV1,
      answered: AnsweredParameterList,
    ) => {
      const keepParameterList = documentHasNewerParameterList(
        host.getSnapshot(),
        nextSnapshot,
        answered,
      );
      const keepAuthoredPython = !sameCanonicalPythonTarget(
        readGeneratedPythonTarget(host),
        nextSnapshot.pythonTarget,
      );
      applyProjection(nextSnapshot, { keepAuthoredPython, keepParameterList });
      setCallableDraft(nextSnapshot.callables[0].authoredExpression);
      updateMutation({ kind: "idle" });
      if (keepParameterList) {
        scheduleParameterListMutation();
      }
      if (keepAuthoredPython) {
        schedulePythonTargetMutation();
      }
    };
    // One debounce coalesces every prefix and suffix keystroke the generated document accepts into
    // one complete revision-bound Python target.
    const schedulePythonTargetMutation = () => {
      cancelScheduledTargetMutation();
      targetTimer = setTimeout(() => {
        targetTimer = null;
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          const authored = readGeneratedPythonTarget(host);
          if (sameCanonicalPythonTarget(authored, snapshot.pythonTarget)) {
            return;
          }
          // The bytes the package protected have to be the canonical separator, body, and
          // separator this split was made around. Every response writes the canonical body back
          // between the authored regions, so a mismatch here is the protected range having failed
          // to protect anything, and the offsets it was split at describe some other document.
          if (authored.generated !== generatedPythonRegionText(snapshot)) {
            throw new Error(
              "Generated Python no longer holds its canonical generated body.",
            );
          }
          const revision = snapshot.project.revision;
          updateMutation({
            description: "Checking the generated Python with Basedpyright.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await setPythonTarget({
              expectedRevision: revision,
              prefix: authored.prefix,
              projectId: snapshot.project.id,
              suffix: authored.suffix,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "untouched" });
          } catch (error) {
            if (!active) {
              return;
            }
            restoreCanonicalProject();
            handleMutationError("the generated Python", error);
          }
        });
      }, mutationDebounceMs);
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
            acceptCanonicalSnapshot(nextSnapshot, {
              kind: "proposed",
              sent: proposal,
            });
          } catch (error) {
            if (!active) {
              return;
            }
            restoreCanonicalProject();
            handleMutationError("the parameters", error);
          }
        });
      }, mutationDebounceMs);
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

    // Every authored change reaches the project the same way: the package's own funnels write the
    // controlled document, and this subscription proposes whatever that document now holds — the
    // complete parameter list, the complete Python target, or both.
    const unsubscribe = host.subscribe((document) => {
      if (isProjectingRef.current || snapshot === null || !active) {
        return;
      }
      const proposal = proposedParameterList(document);
      if (proposal !== null && !sameParameterList(proposal, snapshot)) {
        scheduleParameterListMutation();
      }
      if (
        !sameCanonicalPythonTarget(
          readGeneratedPythonTarget(host),
          snapshot.pythonTarget,
        )
      ) {
        schedulePythonTargetMutation();
      }
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
      cancelScheduledTargetMutation();
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

// What a canonical response says about the parameter list. A callable commit redefines it, so its
// response is the list; a parameter mutation answers for exactly the list it sent; and a Python
// target mutation says nothing about it at all.
type AnsweredParameterList =
  | { kind: "redefined" }
  | { kind: "proposed"; sent: Array<ParameterProposalV1> }
  | { kind: "untouched" };

// Whether the workspace document holds a list this response cannot answer for. A proposal is
// compared against the list it was made from, because every row it answers for is still disabled
// and would propose nothing at all; a response that never touched the list is compared against
// canonical, because any difference there is somebody's own unsent edit.
function documentHasNewerParameterList(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV1,
  answered: AnsweredParameterList,
): boolean {
  if (answered.kind === "redefined") {
    return false;
  }
  const current = documentParameterList(document);
  return answered.kind === "proposed"
    ? !sameProposedList(answered.sent, current)
    : !sameParameterList(current, snapshot);
}

// The complete ordered candidate the workspace document currently holds, whatever its rows' own
// in-flight state. This is the list a response is compared against to see whether the person moved
// on while it was away.
function documentParameterList(
  document: WorkspaceDocument,
): Array<ParameterProposalV1> {
  return readCallableParameterItems(document).map((item) => ({
    authoredExpression: item.data.authoredExpression,
    id: item.id,
    name: item.data.name,
  }));
}

// The candidate this document is proposing to the store. A disabled row is one whose mutation is
// already in flight, so its document state is not a new proposal; and a name the store would
// refuse is one main never sends, so the row keeps what is being typed and reports the problem
// beside itself instead of having the whole list restored underneath it.
function proposedParameterList(
  document: WorkspaceDocument,
): Array<ParameterProposalV1> | null {
  const items = readCallableParameterItems(document);
  if (items.some((item) => item.data.disabled)) {
    return null;
  }
  if (hasBlockingParameterName(items)) {
    return null;
  }
  return documentParameterList(document);
}

// Whether the document still holds the exact list a proposal was made from.
function sameProposedList(
  sent: Array<ParameterProposalV1>,
  current: Array<ParameterProposalV1>,
): boolean {
  return (
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

// Whether the authored Python the document holds is the target the store last published.
function sameCanonicalPythonTarget(
  authored: { prefix: string; suffix: string },
  canonical: PythonTargetV1,
): boolean {
  return (
    authored.prefix === canonical.prefix && authored.suffix === canonical.suffix
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
