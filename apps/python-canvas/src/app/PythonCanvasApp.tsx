import { useEffect, useMemo, useRef, useState } from "react";
import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSection,
  createWorkspaceHost,
  registerSectionKinds,
  setWorkspaceColorMode,
  type TextValueCompletionProvider,
  type WorkspaceCodeSectionCompletionProvider,
  type WorkspaceDocument,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  ProjectClientError,
  commitCallable,
  createCallable,
  deleteCallable,
  fetchProjectSnapshot,
  renameCallable,
  renameProject,
  setCallableParameters,
  setPythonTarget,
} from "../backend/client";
import type {
  CallableV2,
  ParameterProposalV2,
  ProjectSnapshotV2,
} from "../backend/generatedContract";
import {
  CallableExpressionField,
  CallableSection,
  parameterItemSearchableText,
  readCallableSectionData,
} from "../sections/CallableSection";
import { createCallableCompletionProvider } from "../sections/callableCompletion";
import { hasBlockingParameterName } from "../sections/parameterNames";
import { createPythonTargetCompletionProvider } from "../sections/pythonTargetCompletion";
import {
  CALLABLE_SECTION_KIND,
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_ID,
  GENERATED_PYTHON_SECTION_SIZE,
  applyProjectSnapshotToWorkspace,
  createCallableParameterItem,
  projectWorkspaceDocument,
  readCallableParameterItems,
  readCallableParameterRows,
  readGeneratedPythonTarget,
  setParameterItemExpression,
  setParameterItemName,
  type ProjectSnapshotProjectionOptions,
} from "./workspaceProjection";
import type { PythonCanvasMutationContextValue } from "./PythonCanvasMutationContext";
import { PythonTargetCompletionBoundary } from "./PythonTargetCompletionBoundary";
import { PythonCanvasView } from "./PythonCanvasView";

const mutationDebounceMs = 300;

type AppState =
  | { kind: "loading" }
  | { kind: "ready"; host: WorkspaceHost }
  | { kind: "error" };

type MutationState =
  | { kind: "idle" }
  | { description: string; kind: "pending" }
  | { kind: "error"; message: string };

type CallableMutationStates = Record<string, MutationState>;
type CallableDrafts = Record<string, string>;
type CallableNameDrafts = Record<string, string>;
type CompletionProviders = Record<string, TextValueCompletionProvider>;
type CompletionErrors = Record<string, string>;

type MutationAnswer =
  | {
      callableId: string;
      kind: "commit";
      parameterDraftAtStart: ParameterProposalV2[] | null;
    }
  | { callableId: string; kind: "parameters"; sent: ParameterProposalV2[] }
  | { kind: "other" };

type RevisionConflictDraft =
  | { callableId: string; kind: "callable-rename"; name: string }
  | { callableId: string; kind: "parameters" }
  | { kind: "project-rename"; name: string }
  | null;

type AppController = {
  commitCallable: (callableId: string, value: string) => void;
  createCallable: (name: string) => void;
  deleteCallable: (callableId: string) => void;
  renameCallable: (callableId: string, name: string) => void;
  renameProject: (name: string) => void;
  revertCallableDraft: (callableId: string) => void;
  setCallableDraft: (callableId: string, value: string) => void;
  setCallableNameDraft: (callableId: string, name: string) => void;
  setParameterExpression: (
    callableId: string,
    parameterId: string,
    value: string,
  ) => void;
  setParameterName: (
    callableId: string,
    parameterId: string,
    name: string,
  ) => void;
};

export function registerPythonCanvasSectionKinds(
  host: WorkspaceHost,
  pythonTargetCompletionProvider?: WorkspaceCodeSectionCompletionProvider,
): void {
  const pythonTargetSection = createWorkspaceCodeSection({
    completionProvider: pythonTargetCompletionProvider,
    defaultSize: GENERATED_PYTHON_SECTION_SIZE,
    languages: ["python"],
  });
  registerSectionKinds(host, {
    [CALLABLE_SECTION_KIND]: {
      defaultSize: CALLABLE_SECTION_SIZE,
      assertValidData: (section) => {
        readCallableSectionData(section.data);
      },
      itemArea: {
        renderLeadingContent: (section) => {
          const data = readCallableSectionData(section.data);
          return <CallableExpressionField data={data} />;
        },
        toolbar: "authoring-and-filter",
      },
      createItem: () => createCallableParameterItem(),
      getItemSearchableText: (context) =>
        parameterItemSearchableText(context.item),
      renderContent: (section) => {
        const data = readCallableSectionData(section.data);
        return (
          <CallableSection
            data={data}
            parameters={readCallableParameterRows(section)}
            sectionId={section.id}
          />
        );
      },
    },
    [WORKSPACE_CODE_SECTION_KIND]: {
      ...pythonTargetSection,
      renderContent: (section) =>
        section.id === GENERATED_PYTHON_SECTION_ID ? (
          <PythonTargetCompletionBoundary>
            {pythonTargetSection.renderContent(section)}
          </PythonTargetCompletionBoundary>
        ) : (
          pythonTargetSection.renderContent(section)
        ),
    },
  });
}

export function PythonCanvasApp() {
  const [state, setState] = useState<AppState>({ kind: "loading" });
  const [project, setProject] = useState<ProjectSnapshotV2 | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [newCallableName, setNewCallableName] = useState("");
  const [callableDrafts, setCallableDrafts] = useState<CallableDrafts>({});
  const [callableNameDrafts, setCallableNameDrafts] =
    useState<CallableNameDrafts>({});
  const [completionProviders, setCompletionProviders] =
    useState<CompletionProviders>({});
  const [completionErrors, setCompletionErrors] = useState<CompletionErrors>(
    {},
  );
  const [pythonTargetCompletionError, setPythonTargetCompletionError] =
    useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<MutationState>({
    kind: "idle",
  });
  const [projectMutation, setProjectMutation] = useState<MutationState>({
    kind: "idle",
  });
  const [callableMutations, setCallableMutations] =
    useState<CallableMutationStates>({});
  const [callableFormOpen, setCallableFormOpen] = useState(false);
  const controllerRef = useRef<AppController | null>(null);
  const isProjectingRef = useRef(false);

  useEffect(() => {
    const host = createWorkspaceHost();
    setWorkspaceColorMode(host, "system");
    let active = true;
    let disposed = false;
    let snapshot: ProjectSnapshotV2 | null = null;
    let canonicalCallableNames = new Map<string, string>();
    let targetTimer: ReturnType<typeof setTimeout> | null = null;
    const parameterTimers = new Map<string, ReturnType<typeof setTimeout>>();
    let mutationChain = Promise.resolve();

    const disposeHost = () => {
      if (!disposed) {
        disposed = true;
        host.dispose();
      }
    };
    const updateProjectMutation = (next: MutationState) => {
      if (active) {
        setProjectMutation(next);
        setAnnouncement(next);
      }
    };
    const updateCallableMutation = (
      callableId: string,
      next: MutationState,
    ) => {
      if (!active) {
        return;
      }
      setCallableMutations((current) => {
        if (next.kind === "idle") {
          const { [callableId]: _cleared, ...remaining } = current;
          return remaining;
        }
        return { ...current, [callableId]: next };
      });
      setAnnouncement(next);
    };
    const clearCallableError = (callableId: string) => {
      if (!active) {
        return;
      }
      setCallableMutations((current) => {
        if (current[callableId]?.kind !== "error") {
          return current;
        }
        const { [callableId]: _cleared, ...remaining } = current;
        return remaining;
      });
      setAnnouncement((current) =>
        current.kind === "error" ? { kind: "idle" } : current,
      );
    };
    const applyProjection = (
      nextSnapshot: ProjectSnapshotV2,
      options: ProjectSnapshotProjectionOptions,
    ) => {
      isProjectingRef.current = true;
      try {
        applyProjectSnapshotToWorkspace(host, nextSnapshot, options);
      } finally {
        isProjectingRef.current = false;
      }
    };
    const cancelTargetMutation = () => {
      if (targetTimer !== null) {
        clearTimeout(targetTimer);
        targetTimer = null;
      }
    };
    const cancelParameterMutation = (callableId: string) => {
      const timer = parameterTimers.get(callableId);
      if (timer !== undefined) {
        clearTimeout(timer);
        parameterTimers.delete(callableId);
      }
    };
    const cancelAllParameterMutations = () => {
      for (const timer of parameterTimers.values()) {
        clearTimeout(timer);
      }
      parameterTimers.clear();
    };
    const enqueue = (operation: () => Promise<void>) => {
      const run = async () => {
        try {
          await operation();
        } catch (error) {
          updateProjectMutation({
            kind: "error",
            message: mutationErrorMessage("the project", error),
          });
        }
      };
      mutationChain = mutationChain.then(run, run);
    };
    const newCallableCompletionProvider = (callableId: string) =>
      createCallableCompletionProvider({
        callableId,
        onFailure: (message) => {
          if (active) {
            setCompletionErrors((current) => ({
              ...current,
              [callableId]: message,
            }));
          }
        },
        onSuccess: () => {
          if (active) {
            setCompletionErrors((current) => {
              const { [callableId]: _cleared, ...remaining } = current;
              return remaining;
            });
          }
        },
        projectId: snapshot?.project.id ?? "",
      });
    const synchronizeReactProjection = (
      nextSnapshot: ProjectSnapshotV2,
      resetCallableId: string | null,
      revisionConflictDraft: RevisionConflictDraft = null,
    ) => {
      setProject(nextSnapshot);
      setProjectNameDraft(
        revisionConflictDraft?.kind === "project-rename"
          ? revisionConflictDraft.name
          : nextSnapshot.project.name,
      );
      setCallableDrafts((current) => {
        const next: CallableDrafts = {};
        for (const callable of nextSnapshot.callables) {
          const currentDraft = current[callable.id];
          next[callable.id] =
            resetCallableId === callable.id || currentDraft === undefined
              ? callable.authoredExpression
              : currentDraft;
        }
        return next;
      });
      const previousCanonicalCallableNames = canonicalCallableNames;
      canonicalCallableNames = new Map(
        nextSnapshot.callables.map((callable) => [callable.id, callable.name]),
      );
      setCallableNameDrafts((current) => {
        const next: CallableNameDrafts = {};
        for (const callable of nextSnapshot.callables) {
          const currentName = current[callable.id];
          const conflictName =
            revisionConflictDraft?.kind === "callable-rename" &&
            revisionConflictDraft.callableId === callable.id
              ? revisionConflictDraft.name
              : undefined;
          const canonicalNameChanged =
            previousCanonicalCallableNames.get(callable.id) !== callable.name;
          next[callable.id] =
            conflictName ??
            (!canonicalNameChanged && currentName !== undefined
              ? currentName
              : callable.name);
        }
        return next;
      });
      setCompletionProviders((current) => {
        const next: CompletionProviders = {};
        for (const callable of nextSnapshot.callables) {
          next[callable.id] =
            current[callable.id] ?? newCallableCompletionProvider(callable.id);
        }
        return next;
      });
      setCompletionErrors((current) => {
        const next: CompletionErrors = {};
        for (const callable of nextSnapshot.callables) {
          const currentError = current[callable.id];
          if (currentError !== undefined) {
            next[callable.id] = currentError;
          }
        }
        return next;
      });
      setCallableMutations((current) => {
        const next: CallableMutationStates = {};
        for (const callable of nextSnapshot.callables) {
          const currentMutation = current[callable.id];
          if (
            currentMutation !== undefined &&
            currentMutation.kind !== "idle"
          ) {
            next[callable.id] = currentMutation;
          }
        }
        return next;
      });
    };
    const collectRetainedParameterLists = (
      document: WorkspaceDocument,
      nextSnapshot: ProjectSnapshotV2,
      answer: MutationAnswer,
    ) => {
      const retained = new Set<string>();
      for (const callable of nextSnapshot.callables) {
        const draft = parameterListDraft(document, callable.id);
        if (draft === null) {
          continue;
        }
        if (answer.kind === "commit" && answer.callableId === callable.id) {
          if (
            answer.parameterDraftAtStart === null ||
            !sameProposedList(answer.parameterDraftAtStart, draft)
          ) {
            retained.add(callable.id);
          }
          continue;
        }
        if (answer.kind === "parameters" && answer.callableId === callable.id) {
          if (!sameProposedList(answer.sent, draft)) {
            retained.add(callable.id);
          }
          continue;
        }
        if (!sameParameterList(draft, callable)) {
          retained.add(callable.id);
        }
      }
      return retained;
    };
    const acceptCanonicalSnapshot = (
      nextSnapshot: ProjectSnapshotV2,
      answer: MutationAnswer,
      revisionConflictDraft: RevisionConflictDraft = null,
    ) => {
      const document = host.getSnapshot();
      let keepAuthoredPython = false;
      try {
        const authored = readGeneratedPythonTarget(host);
        keepAuthoredPython = !sameCanonicalPythonTarget(authored, nextSnapshot);
      } catch {
        keepAuthoredPython = false;
      }
      applyProjection(nextSnapshot, {
        keepAuthoredPython,
        keepParameterLists: new Set([
          ...collectRetainedParameterLists(document, nextSnapshot, answer),
          ...(revisionConflictDraft?.kind === "parameters"
            ? [revisionConflictDraft.callableId]
            : []),
        ]),
      });
      synchronizeReactProjection(
        nextSnapshot,
        answer.kind === "commit" ? answer.callableId : null,
        revisionConflictDraft,
      );
    };
    const restoreCanonicalProject = (
      answer: MutationAnswer = { kind: "other" },
    ) => {
      if (snapshot === null) {
        return;
      }
      applyProjection(snapshot, {
        keepAuthoredPython: false,
        keepParameterLists: collectRetainedParameterLists(
          host.getSnapshot(),
          snapshot,
          answer,
        ),
      });
      synchronizeReactProjection(snapshot, null);
    };
    const recoverRevisionConflict = async (
      revisionConflictDraft: RevisionConflictDraft,
      reportFailure: (next: MutationState) => void,
    ) => {
      const latest = await fetchProjectSnapshot();
      if (!active) {
        return;
      }
      snapshot = latest;
      acceptCanonicalSnapshot(latest, { kind: "other" }, revisionConflictDraft);
      reportFailure({
        kind: "error",
        message:
          revisionConflictDraft === null
            ? "The project changed before this update could be saved. The latest project has been loaded. Review and retry your update."
            : revisionConflictDraft.kind === "parameters"
              ? "The project changed before this update could be saved. The latest project has been loaded, and your parameter draft is still available to retry."
              : "The project changed before this update could be saved. The latest project has been loaded, and your name draft is still available to retry.",
      });
    };
    const handleMutationFailure = async (
      target: string,
      error: unknown,
      options: {
        reportFailure: (next: MutationState) => void;
        restore: () => void;
        revisionConflictDraft?: RevisionConflictDraft;
      },
    ) => {
      if (
        error instanceof ProjectClientError &&
        error.code === "revision_conflict"
      ) {
        try {
          await recoverRevisionConflict(
            options.revisionConflictDraft ?? null,
            options.reportFailure,
          );
          return;
        } catch (refreshError) {
          options.reportFailure({
            kind: "error",
            message: mutationErrorMessage(target, refreshError),
          });
          return;
        }
      }
      options.restore();
      options.reportFailure({
        kind: "error",
        message: mutationErrorMessage(target, error),
      });
    };
    const schedulePythonTargetMutation = () => {
      cancelTargetMutation();
      targetTimer = setTimeout(() => {
        targetTimer = null;
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          let authored: ReturnType<typeof readGeneratedPythonTarget>;
          try {
            authored = readGeneratedPythonTarget(host);
          } catch (error) {
            restoreCanonicalProject();
            updateProjectMutation({
              kind: "error",
              message: "The generated Python boundary cannot be edited.",
            });
            return;
          }
          if (sameCanonicalPythonTarget(authored, snapshot)) {
            return;
          }
          if (authored.generated !== snapshot.generatedCode.body) {
            restoreCanonicalProject();
            updateProjectMutation({
              kind: "error",
              message: "The generated Python body cannot be edited.",
            });
            return;
          }
          const current = snapshot;
          updateProjectMutation({
            description: "Checking the Python target with Basedpyright.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await setPythonTarget({
              expectedRevision: current.project.revision,
              prefix: authored.prefix,
              projectId: current.project.id,
              suffix: authored.suffix,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateProjectMutation({ kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the Python target", error, {
                reportFailure: updateProjectMutation,
                restore: restoreCanonicalProject,
              });
            }
          }
        });
      }, mutationDebounceMs);
    };
    const scheduleParameterListMutation = (callableId: string) => {
      cancelParameterMutation(callableId);
      const timer = setTimeout(() => {
        parameterTimers.delete(callableId);
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          const callable = snapshot.callables.find(
            (candidate) => candidate.id === callableId,
          );
          if (callable === undefined) {
            return;
          }
          const proposal = proposedParameterList(
            host.getSnapshot(),
            callableId,
          );
          if (proposal === null || sameParameterList(proposal, callable)) {
            return;
          }
          const current = snapshot;
          updateCallableMutation(callableId, {
            description: "Checking the parameters with Basedpyright.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await setCallableParameters(callableId, {
              expectedRevision: current.project.revision,
              parameters: proposal,
              projectId: current.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, {
              callableId,
              kind: "parameters",
              sent: proposal,
            });
            updateCallableMutation(callableId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the parameters", error, {
                reportFailure: (next) =>
                  updateCallableMutation(callableId, next),
                restore: () =>
                  restoreCanonicalProject({
                    callableId,
                    kind: "parameters",
                    sent: proposal,
                  }),
                revisionConflictDraft: { callableId, kind: "parameters" },
              });
            }
          }
        });
      }, mutationDebounceMs);
      parameterTimers.set(callableId, timer);
    };

    controllerRef.current = {
      commitCallable: (callableId, value) => {
        cancelParameterMutation(callableId);
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          const callable = snapshot.callables.find(
            (candidate) => candidate.id === callableId,
          );
          if (callable === undefined) {
            return;
          }
          setCallableDrafts((current) => ({ ...current, [callableId]: value }));
          setCompletionErrors((current) => {
            const { [callableId]: _cleared, ...remaining } = current;
            return remaining;
          });
          const parameterDraftAtStart = parameterListDraft(
            host.getSnapshot(),
            callableId,
          );
          updateCallableMutation(callableId, {
            description: "Checking the callable with Basedpyright.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await commitCallable(callableId, {
              authoredExpression: value,
              expectedRevision: snapshot.project.revision,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, {
              callableId,
              kind: "commit",
              parameterDraftAtStart,
            });
            updateCallableMutation(callableId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the callable", error, {
                reportFailure: (next) =>
                  updateCallableMutation(callableId, next),
                restore: () =>
                  restoreCanonicalProject({
                    callableId,
                    kind: "commit",
                    parameterDraftAtStart,
                  }),
              });
            }
          }
        });
      },
      createCallable: (name) => {
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          updateProjectMutation({
            description: "Creating the callable.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await createCallable({
              expectedRevision: snapshot.project.revision,
              name,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            setNewCallableName("");
            setCallableFormOpen(false);
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateProjectMutation({ kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the callable", error, {
                reportFailure: updateProjectMutation,
                restore: restoreCanonicalProject,
              });
            }
          }
        });
      },
      deleteCallable: (callableId) => {
        cancelParameterMutation(callableId);
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          updateCallableMutation(callableId, {
            description: "Deleting the callable.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await deleteCallable(callableId, {
              expectedRevision: snapshot.project.revision,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateCallableMutation(callableId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the callable", error, {
                reportFailure: (next) =>
                  updateCallableMutation(callableId, next),
                restore: restoreCanonicalProject,
              });
            }
          }
        });
      },
      renameCallable: (callableId, name) => {
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          updateCallableMutation(callableId, {
            description: "Renaming the callable.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await renameCallable(callableId, {
              expectedRevision: snapshot.project.revision,
              name,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateCallableMutation(callableId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the callable", error, {
                reportFailure: (next) =>
                  updateCallableMutation(callableId, next),
                restore: restoreCanonicalProject,
                revisionConflictDraft: {
                  callableId,
                  kind: "callable-rename",
                  name,
                },
              });
            }
          }
        });
      },
      renameProject: (name) => {
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          updateProjectMutation({
            description: "Renaming the project.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await renameProject({
              expectedRevision: snapshot.project.revision,
              name,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateProjectMutation({ kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the project", error, {
                reportFailure: updateProjectMutation,
                restore: restoreCanonicalProject,
                revisionConflictDraft: {
                  kind: "project-rename",
                  name,
                },
              });
            }
          }
        });
      },
      revertCallableDraft: (callableId) => {
        if (!active || snapshot === null) {
          return;
        }
        const callable = snapshot.callables.find(
          (candidate) => candidate.id === callableId,
        );
        if (callable !== undefined) {
          setCallableDrafts((current) => ({
            ...current,
            [callableId]: callable.authoredExpression,
          }));
        }
        clearCallableError(callableId);
      },
      setCallableDraft: (callableId, value) => {
        if (!active) {
          return;
        }
        setCallableDrafts((current) => ({ ...current, [callableId]: value }));
        setCompletionErrors((current) => {
          const { [callableId]: _cleared, ...remaining } = current;
          return remaining;
        });
        clearCallableError(callableId);
      },
      setCallableNameDraft: (callableId, name) => {
        if (!active) {
          return;
        }
        setCallableNameDrafts((current) => ({
          ...current,
          [callableId]: name,
        }));
        clearCallableError(callableId);
      },
      setParameterExpression: (callableId, parameterId, value) => {
        if (active) {
          clearCallableError(callableId);
          setParameterItemExpression(host, callableId, parameterId, value);
        }
      },
      setParameterName: (callableId, parameterId, name) => {
        if (active) {
          clearCallableError(callableId);
          setParameterItemName(host, callableId, parameterId, name);
        }
      },
    };

    const unsubscribe = host.subscribe((document) => {
      if (isProjectingRef.current || snapshot === null || !active) {
        return;
      }
      for (const callable of snapshot.callables) {
        const proposal = proposedParameterList(document, callable.id);
        if (proposal !== null && !sameParameterList(proposal, callable)) {
          scheduleParameterListMutation(callable.id);
        }
      }
      try {
        if (
          !sameCanonicalPythonTarget(readGeneratedPythonTarget(host), snapshot)
        ) {
          schedulePythonTargetMutation();
        }
      } catch {
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
        const pythonTargetCompletionProvider =
          createPythonTargetCompletionProvider({
            onFailure: (message) => {
              if (active) {
                setPythonTargetCompletionError(message);
              }
            },
            onSuccess: () => {
              if (active) {
                setPythonTargetCompletionError(null);
              }
            },
            projectId: initialSnapshot.project.id,
          });
        registerPythonCanvasSectionKinds(host, pythonTargetCompletionProvider);
        isProjectingRef.current = true;
        try {
          host.loadDocument(projectWorkspaceDocument(initialSnapshot));
        } finally {
          isProjectingRef.current = false;
        }
        synchronizeReactProjection(initialSnapshot, null);
        setState({ kind: "ready", host });
      } catch {
        if (active) {
          disposeHost();
          setState({ kind: "error" });
        }
      }
    };

    void load();
    return () => {
      active = false;
      cancelTargetMutation();
      cancelAllParameterMutations();
      controllerRef.current = null;
      unsubscribe();
      disposeHost();
    };
  }, []);

  const clearProjectError = () => {
    setProjectMutation((current) =>
      current.kind === "error" ? { kind: "idle" } : current,
    );
    setAnnouncement((current) =>
      current.kind === "error" ? { kind: "idle" } : current,
    );
  };

  const mutationContext = useMemo<PythonCanvasMutationContextValue>(
    () => ({
      callableCompletionError: (callableId) =>
        completionErrors[callableId] ?? null,
      callableCompletionProvider: (callableId) =>
        completionProviders[callableId],
      callableMutationError: (callableId) => {
        const mutation = callableMutations[callableId];
        return mutation?.kind === "error" ? mutation.message : null;
      },
      callablePending: (callableId) =>
        callableMutations[callableId]?.kind === "pending",
      callableDraft: (callableId) => callableDrafts[callableId] ?? "",
      callableNameDraft: (callableId) => callableNameDrafts[callableId] ?? null,
      onCallableCommit: (callableId, value) =>
        controllerRef.current?.commitCallable(callableId, value),
      onCallableDelete: (callableId) =>
        controllerRef.current?.deleteCallable(callableId),
      onCallableDraftChange: (callableId, value) =>
        controllerRef.current?.setCallableDraft(callableId, value),
      onCallableNameDraftChange: (callableId, name) =>
        controllerRef.current?.setCallableNameDraft(callableId, name),
      onCallableRename: (callableId, name) =>
        controllerRef.current?.renameCallable(callableId, name),
      onCallableRevert: (callableId) =>
        controllerRef.current?.revertCallableDraft(callableId),
      onParameterExpressionChange: (callableId, parameterId, value) =>
        controllerRef.current?.setParameterExpression(
          callableId,
          parameterId,
          value,
        ),
      onParameterNameChange: (callableId, parameterId, name) =>
        controllerRef.current?.setParameterName(callableId, parameterId, name),
    }),
    [
      callableDrafts,
      callableNameDrafts,
      callableMutations,
      completionErrors,
      completionProviders,
    ],
  );

  return (
    <PythonCanvasView
      announcement={announcement}
      callableFormOpen={callableFormOpen}
      mutationContext={mutationContext}
      newCallableName={newCallableName}
      onCloseCallableForm={() => {
        setCallableFormOpen(false);
        setNewCallableName("");
      }}
      onCreateCallable={(name) => controllerRef.current?.createCallable(name)}
      onNewCallableNameChange={(name) => {
        clearProjectError();
        setNewCallableName(name);
      }}
      onOpenCallableForm={() => {
        clearProjectError();
        setCallableFormOpen(true);
      }}
      onProjectNameChange={(name) => {
        clearProjectError();
        setProjectNameDraft(name);
      }}
      onRenameProject={(name) => controllerRef.current?.renameProject(name)}
      project={project}
      projectNameDraft={projectNameDraft}
      projectMutation={projectMutation}
      pythonTargetCompletionError={pythonTargetCompletionError}
      state={state}
    />
  );
}

function documentParameterList(
  document: WorkspaceDocument,
  callableId: string,
): ParameterProposalV2[] {
  return readCallableParameterItems(document, callableId).map((item) => ({
    authoredExpression: item.data.authoredExpression,
    id: item.id,
    name: item.data.name,
  }));
}

function parameterListDraft(
  document: WorkspaceDocument,
  callableId: string,
): ParameterProposalV2[] | null {
  try {
    return documentParameterList(document, callableId);
  } catch {
    return null;
  }
}

function proposedParameterList(
  document: WorkspaceDocument,
  callableId: string,
): ParameterProposalV2[] | null {
  let items: ReturnType<typeof readCallableParameterItems>;
  try {
    items = readCallableParameterItems(document, callableId);
  } catch {
    return null;
  }
  if (hasBlockingParameterName(items)) {
    return null;
  }
  return items.map((item) => ({
    authoredExpression: item.data.authoredExpression,
    id: item.id,
    name: item.data.name,
  }));
}

function sameProposedList(
  left: ReadonlyArray<ParameterProposalV2>,
  right: ReadonlyArray<ParameterProposalV2>,
): boolean {
  return (
    left.length === right.length &&
    left.every((parameter, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        other.id === parameter.id &&
        other.name === parameter.name &&
        other.authoredExpression === parameter.authoredExpression
      );
    })
  );
}

function sameParameterList(
  proposal: ReadonlyArray<ParameterProposalV2>,
  callable: CallableV2,
): boolean {
  return (
    proposal.length === callable.parameters.length &&
    proposal.every((parameter, index) => {
      const canonical = callable.parameters[index];
      return (
        canonical !== undefined &&
        canonical.id === parameter.id &&
        canonical.name === parameter.name &&
        canonical.authoredExpression === parameter.authoredExpression
      );
    })
  );
}

function sameCanonicalPythonTarget(
  authored: { prefix: string; suffix: string },
  snapshot: ProjectSnapshotV2,
): boolean {
  return (
    authored.prefix === snapshot.pythonTarget.prefix &&
    authored.suffix === snapshot.pythonTarget.suffix
  );
}

function mutationErrorMessage(target: string, error: unknown): string {
  if (error instanceof ProjectClientError) {
    return `Unable to update ${target}. ${error.message}`;
  }
  return `Unable to update ${target}. Try again.`;
}
