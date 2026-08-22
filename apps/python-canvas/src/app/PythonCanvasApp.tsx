import { useEffect, useMemo, useRef, useState } from "react";
import {
  createWorkspaceHost,
  registerWorkspaceCreationCommands,
  setWorkspaceColorMode,
  type TextValueCompletionProvider,
  type WorkspaceDocument,
} from "@setta/workspace";

import {
  ProjectClientError,
  commitCallable,
  createCallable,
  createList,
  createParameterDictionary,
  decrementListChildren,
  deleteCallable,
  deleteList,
  deleteParameterDictionary,
  fetchProjectSnapshot,
  incrementListChildren,
  refreshCallableParameters,
  renameCallable,
  renameList,
  renameParameterDictionary,
  replaceSectionForest,
  setCallableParameters,
  setParameterDictionaryEntries,
  setPythonTarget,
} from "../backend/client";
import type { ProjectSnapshotV2 } from "../backend/generatedContract";
import { createCallableCompletionProvider } from "../sections/callableCompletion";
import { createPythonTargetCompletionProvider } from "../sections/pythonTargetCompletion";
import {
  applyProjectSnapshotToWorkspace,
  createPendingCallableSection,
  createPendingListSection,
  createPendingParameterDictionarySection,
  promoteDictionaryEntryParents,
  projectWorkspaceDocument,
  readGeneratedPythonTarget,
  setDictionaryEntryExpression,
  setDictionaryEntryName,
  setParameterItemExpression,
  setParameterItemName,
  type ProjectSnapshotProjectionOptions,
} from "./workspaceProjection";
import type { PythonCanvasMutationContextValue } from "./PythonCanvasMutationContext";
import {
  changedParameterCallableIds,
  callableParameterRefreshRequired,
  changedDictionaryIds,
  dictionaryEntryDraft,
  dictionaryEntryMutationProposal,
  forestMutationProposal,
  hasPythonTargetChange,
  isCallableResolutionFailure,
  mutationErrorMessage,
  parameterListDraft,
  parameterMutationProposal,
  sameCanonicalPythonTarget,
  sameDictionaryEntries,
  sameParameterList,
  sameProposedList,
  sectionStructureMutations,
  type AppController,
  type AppState,
  type MutationAnswer,
  type MutationState,
  type RevisionConflictDraft,
} from "./pythonCanvasAppSupport";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import { PythonCanvasView } from "./PythonCanvasView";

const mutationDebounceMs = 300;
const defaultCallableName = "New callable";
const defaultParameterDictionaryName = "New Param Dict";
const defaultListName = "New List of Objects";

type CallableMutationStates = Record<string, MutationState>;
type DictionaryMutationStates = Record<string, MutationState>;
type ListMutationStates = Record<string, MutationState>;
type CallableDrafts = Record<string, string>;
type CompletionProviders = Record<string, TextValueCompletionProvider>;
type CompletionErrors = Record<string, string>;

export function PythonCanvasApp() {
  const [state, setState] = useState<AppState>({ kind: "loading" });
  const [callableDrafts, setCallableDrafts] = useState<CallableDrafts>({});
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
  const [callableMutations, setCallableMutations] =
    useState<CallableMutationStates>({});
  const [dictionaryMutations, setDictionaryMutations] =
    useState<DictionaryMutationStates>({});
  const [listMutations, setListMutations] = useState<ListMutationStates>({});
  const controllerRef = useRef<AppController | null>(null);
  const isProjectingRef = useRef(false);

  useEffect(() => {
    const host = createWorkspaceHost();
    setWorkspaceColorMode(host, "system");
    let active = true;
    let disposed = false;
    let snapshot: ProjectSnapshotV2 | null = null;
    const requestedCallableDeletes = new Set<string>();
    const requestedCallableRenames = new Map<string, string>();
    const requestedDictionaryDeletes = new Set<string>();
    const requestedDictionaryRenames = new Map<string, string>();
    const requestedListDeletes = new Set<string>();
    const requestedListRenames = new Map<string, string>();
    let targetTimer: ReturnType<typeof setTimeout> | null = null;
    const parameterTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const dictionaryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const pendingDictionaryValueEdits = new Set<string>();
    const pendingCallableCommits = new Set<string>();
    let mutationChain = Promise.resolve();

    const disposeHost = () => {
      if (!disposed) {
        disposed = true;
        host.dispose();
      }
    };
    const updateAnnouncement = (next: MutationState) => {
      if (active) {
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
      if (next.kind !== "pending" && pendingCallableCommits.has(callableId)) {
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
    const updateDictionaryMutation = (
      dictionaryId: string,
      next: MutationState,
    ) => {
      if (!active) {
        return;
      }
      setDictionaryMutations((current) => {
        if (next.kind === "idle") {
          const { [dictionaryId]: _cleared, ...remaining } = current;
          return remaining;
        }
        return { ...current, [dictionaryId]: next };
      });
      setAnnouncement(next);
    };
    const updateListMutation = (listId: string, next: MutationState) => {
      if (!active) {
        return;
      }
      setListMutations((current) => {
        if (next.kind === "idle") {
          const { [listId]: _cleared, ...remaining } = current;
          return remaining;
        }
        return { ...current, [listId]: next };
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
    const clearDictionaryError = (dictionaryId: string) => {
      if (!active) {
        return;
      }
      setDictionaryMutations((current) => {
        if (current[dictionaryId]?.kind !== "error") {
          return current;
        }
        const { [dictionaryId]: _cleared, ...remaining } = current;
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
        for (const callableId of [...pendingCallableCommits]) {
          if (
            !nextSnapshot.callables.some(
              (callable) => callable.id === callableId,
            )
          ) {
            pendingCallableCommits.delete(callableId);
          }
        }
      } finally {
        isProjectingRef.current = false;
      }
    };
    const setParameterAuthoringPending = (
      callableId: string,
      pending: boolean,
    ) => {
      if (pending) {
        pendingCallableCommits.add(callableId);
      } else {
        pendingCallableCommits.delete(callableId);
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
    const cancelDictionaryMutation = (dictionaryId: string) => {
      const timer = dictionaryTimers.get(dictionaryId);
      if (timer !== undefined) {
        clearTimeout(timer);
        dictionaryTimers.delete(dictionaryId);
      }
    };
    const cancelAllDictionaryMutations = () => {
      for (const timer of dictionaryTimers.values()) {
        clearTimeout(timer);
      }
      dictionaryTimers.clear();
    };
    const enqueue = (operation: () => Promise<void>) => {
      const run = async () => {
        try {
          await operation();
        } catch (error) {
          updateAnnouncement({
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
            setCompletionErrors((current) =>
              current[callableId] === message
                ? current
                : { ...current, [callableId]: message },
            );
          }
        },
        onSuccess: () => {
          if (active) {
            setCompletionErrors((current) => {
              if (current[callableId] === undefined) {
                return current;
              }
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
    ) => {
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
      setDictionaryMutations((current) => {
        const next: DictionaryMutationStates = {};
        for (const dictionary of nextSnapshot.parameterDictionaries) {
          const mutation = current[dictionary.id];
          if (mutation !== undefined && mutation.kind !== "idle") {
            next[dictionary.id] = mutation;
          }
        }
        return next;
      });
      setListMutations((current) => {
        const next: ListMutationStates = {};
        for (const list of nextSnapshot.lists) {
          const mutation = current[list.id];
          if (mutation !== undefined && mutation.kind !== "idle") {
            next[list.id] = mutation;
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
        if (answer.kind === "refresh" && answer.callableId === callable.id) {
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
    const collectRetainedDictionaryEntries = (
      document: WorkspaceDocument,
      nextSnapshot: ProjectSnapshotV2,
      answer: MutationAnswer,
    ) => {
      const retained = new Set<string>();
      for (const dictionary of nextSnapshot.parameterDictionaries) {
        const draft = dictionaryEntryDraft(document, dictionary.id);
        if (draft === null) {
          continue;
        }
        if (
          answer.kind === "dictionary" &&
          answer.dictionaryId === dictionary.id
        ) {
          if (!sameDictionaryEntries(answer.sent, { entries: draft })) {
            retained.add(dictionary.id);
          }
          continue;
        }
        if (!sameDictionaryEntries(draft, dictionary)) {
          retained.add(dictionary.id);
        }
      }
      return retained;
    };
    const acceptCanonicalSnapshot = (
      nextSnapshot: ProjectSnapshotV2,
      answer: MutationAnswer,
      revisionConflictDraft: RevisionConflictDraft = null,
      pendingSectionIds: ReadonlyMap<string, string> = new Map(),
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
        keepDictionaryEntries: new Set([
          ...collectRetainedDictionaryEntries(document, nextSnapshot, answer),
          ...(revisionConflictDraft?.kind === "dictionary"
            ? [revisionConflictDraft.dictionaryId]
            : []),
        ]),
        pendingSectionIds,
      });
      synchronizeReactProjection(
        nextSnapshot,
        answer.kind === "commit" ? answer.callableId : null,
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
        keepDictionaryEntries: collectRetainedDictionaryEntries(
          host.getSnapshot(),
          snapshot,
          answer,
        ),
        pendingSectionIds: new Map(),
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
              : "The project changed before this update could be saved. The latest project has been loaded, and your dictionary draft is still available to retry.",
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
    const finishCallableMutation = (callableId: string) => {
      setParameterAuthoringPending(callableId, false);
      updateCallableMutation(callableId, { kind: "idle" });
    };
    const persistCallableExpression = async (
      callableId: string,
      value: string,
      current: ProjectSnapshotV2,
    ): Promise<ProjectSnapshotV2 | null> => {
      try {
        const committedSnapshot = await commitCallable(callableId, {
          authoredExpression: value,
          expectedRevision: current.project.revision,
          projectId: current.project.id,
        });
        if (!active) {
          return null;
        }
        snapshot = committedSnapshot;
        acceptCanonicalSnapshot(committedSnapshot, {
          callableId,
          kind: "commit",
        });
        return committedSnapshot;
      } catch (error) {
        if (active) {
          setParameterAuthoringPending(callableId, false);
          await handleMutationFailure("the callable", error, {
            reportFailure: (next) => updateCallableMutation(callableId, next),
            restore: () =>
              restoreCanonicalProject({ callableId, kind: "commit" }),
          });
        }
        return null;
      }
    };
    const retrieveCallableParameters = async (
      callableId: string,
      committedSnapshot: ProjectSnapshotV2,
    ) => {
      try {
        const refreshedSnapshot = await refreshCallableParameters(callableId, {
          expectedRevision: committedSnapshot.project.revision,
          projectId: committedSnapshot.project.id,
        });
        if (!active) {
          return;
        }
        snapshot = refreshedSnapshot;
        acceptCanonicalSnapshot(refreshedSnapshot, {
          callableId,
          kind: "refresh",
        });
        finishCallableMutation(callableId);
      } catch (error) {
        if (!active) {
          return;
        }
        setParameterAuthoringPending(callableId, false);
        if (isCallableResolutionFailure(error)) {
          // The expression commit is already durable and its Basedpyright
          // diagnostics are canonical. A missing symbol can prevent signature
          // help, but it must not turn that successful commit into a mutation
          // failure or restore the preceding expression.
          updateCallableMutation(callableId, { kind: "idle" });
          return;
        }
        await handleMutationFailure("the callable parameters", error, {
          reportFailure: (next) => updateCallableMutation(callableId, next),
          restore: () =>
            restoreCanonicalProject({ callableId, kind: "refresh" }),
        });
      }
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
            updateAnnouncement({
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
            updateAnnouncement({
              kind: "error",
              message: "The generated Python body cannot be edited.",
            });
            return;
          }
          const current = snapshot;
          updateAnnouncement({
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
            updateAnnouncement({ kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the Python target", error, {
                reportFailure: updateAnnouncement,
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
          const proposal = parameterMutationProposal(
            host.getSnapshot(),
            snapshot,
            callableId,
          );
          if (proposal === null) {
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
    const persistDictionaryEntries = async (dictionaryId: string) => {
      if (!active || snapshot === null) {
        return;
      }
      const proposal = dictionaryEntryMutationProposal(
        host.getSnapshot(),
        snapshot,
        dictionaryId,
      );
      if (proposal === null) {
        return;
      }
      const current = snapshot;
      updateDictionaryMutation(dictionaryId, {
        description: "Checking the dictionary with Basedpyright.",
        kind: "pending",
      });
      try {
        const nextSnapshot = await setParameterDictionaryEntries(dictionaryId, {
          entries: proposal,
          expectedRevision: current.project.revision,
          projectId: current.project.id,
        });
        if (!active) {
          return;
        }
        snapshot = nextSnapshot;
        acceptCanonicalSnapshot(nextSnapshot, {
          dictionaryId,
          kind: "dictionary",
          sent: proposal,
        });
        updateDictionaryMutation(dictionaryId, { kind: "idle" });
      } catch (error) {
        if (active) {
          await handleMutationFailure("the dictionary", error, {
            reportFailure: (next) => updateDictionaryMutation(dictionaryId, next),
            restore: () =>
              restoreCanonicalProject({
                dictionaryId,
                kind: "dictionary",
                sent: proposal,
              }),
            revisionConflictDraft: { dictionaryId, kind: "dictionary" },
          });
        }
      }
    };
    const scheduleDictionaryEntriesMutation = (
      dictionaryId: string,
      immediate: boolean,
    ) => {
      cancelDictionaryMutation(dictionaryId);
      if (immediate) {
        enqueue(() => persistDictionaryEntries(dictionaryId));
        return;
      }
      const timer = setTimeout(() => {
        dictionaryTimers.delete(dictionaryId);
        enqueue(() => persistDictionaryEntries(dictionaryId));
      }, mutationDebounceMs);
      dictionaryTimers.set(dictionaryId, timer);
    };
    const queueForestMutation = () => {
      enqueue(async () => {
        if (!active || snapshot === null) {
          return;
        }
        const proposal = forestMutationProposal(host.getSnapshot(), snapshot);
        if (proposal === null) {
          return;
        }
        const current = snapshot;
        updateAnnouncement({
          description: "Saving the section order.",
          kind: "pending",
        });
        try {
          const nextSnapshot = await replaceSectionForest({
            expectedRevision: current.project.revision,
            listChildren: proposal.listChildren,
            projectId: current.project.id,
            topLevelSectionIds: proposal.topLevelSectionIds,
          });
          if (!active) {
            return;
          }
          snapshot = nextSnapshot;
          acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
          updateAnnouncement({ kind: "idle" });
        } catch (error) {
          if (active) {
            await handleMutationFailure("the section order", error, {
              reportFailure: updateAnnouncement,
              restore: restoreCanonicalProject,
            });
          }
        }
      });
    };

    const nextCreatedSectionName = (
      current: ProjectSnapshotV2,
      preferredName: string,
    ) => {
      const existing = new Set(
        [
          ...current.callables.map((callable) => callable.name),
          ...current.parameterDictionaries.map((dictionary) => dictionary.name),
          ...current.lists.map((list) => list.name),
        ].map((name) => name.trim().toLocaleLowerCase()),
      );
      if (!existing.has(preferredName.toLocaleLowerCase())) {
        return preferredName;
      }
      for (let suffix = 2; ; suffix += 1) {
        const candidate = `${preferredName} ${String(suffix)}`;
        if (!existing.has(candidate.toLocaleLowerCase())) {
          return candidate;
        }
      }
    };
    const createCallableFromPane = (
      pendingSectionId: string,
      name: string,
    ) => {
      if (!active || snapshot === null) {
        throw new Error(
          "Python Canvas cannot create a callable before loading.",
        );
      }
      updateCallableMutation(pendingSectionId, {
        description: "Creating the callable.",
        kind: "pending",
      });
      enqueue(async () => {
        if (!active || snapshot === null) {
          return;
        }
        const current = snapshot;
        const existingCallableIds = new Set(
          current.callables.map((callable) => callable.id),
        );
        try {
          const nextSnapshot = await createCallable({
            expectedRevision: current.project.revision,
            name,
            projectId: current.project.id,
          });
          if (!active) {
            return;
          }
          snapshot = nextSnapshot;
          const created = nextSnapshot.callables.filter(
            (callable) => !existingCallableIds.has(callable.id),
          );
          const createdCallable = created[0];
          if (created.length !== 1 || createdCallable === undefined) {
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateCallableMutation(pendingSectionId, {
              kind: "error",
              message:
                "The created callable could not be identified. The latest project has been loaded.",
            });
            return;
          }
          acceptCanonicalSnapshot(
            nextSnapshot,
            { kind: "other" },
            null,
            new Map([[createdCallable.id, pendingSectionId]]),
          );
          updateCallableMutation(pendingSectionId, { kind: "idle" });
        } catch (error) {
          if (active) {
            await handleMutationFailure("the callable", error, {
              reportFailure: (next) =>
                updateCallableMutation(pendingSectionId, next),
              restore: restoreCanonicalProject,
            });
          }
        }
      });
    };
    const createParameterDictionaryFromPane = (
      pendingSectionId: string,
      name: string,
    ) => {
      if (!active || snapshot === null) {
        throw new Error(
          "Python Canvas cannot create a Parameter Dictionary before loading.",
        );
      }
      updateDictionaryMutation(pendingSectionId, {
        description: "Creating the Param Dict.",
        kind: "pending",
      });
      enqueue(async () => {
        if (!active || snapshot === null) {
          return;
        }
        const current = snapshot;
        const existingDictionaryIds = new Set(
          current.parameterDictionaries.map((dictionary) => dictionary.id),
        );
        try {
          const nextSnapshot = await createParameterDictionary({
            expectedRevision: current.project.revision,
            name,
            projectId: current.project.id,
          });
          if (!active) {
            return;
          }
          snapshot = nextSnapshot;
          const created = nextSnapshot.parameterDictionaries.filter(
            (dictionary) => !existingDictionaryIds.has(dictionary.id),
          );
          const dictionary = created[0];
          if (created.length !== 1 || dictionary === undefined) {
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateDictionaryMutation(pendingSectionId, {
              kind: "error",
              message:
                "The created Param Dict could not be identified. The latest project has been loaded.",
            });
            return;
          }
          acceptCanonicalSnapshot(
            nextSnapshot,
            { kind: "other" },
            null,
            new Map([[dictionary.id, pendingSectionId]]),
          );
          updateDictionaryMutation(pendingSectionId, { kind: "idle" });
        } catch (error) {
          if (active) {
            await handleMutationFailure("the Param Dict", error, {
              reportFailure: (next) =>
                updateDictionaryMutation(pendingSectionId, next),
              restore: restoreCanonicalProject,
            });
          }
        }
      });
    };
    const createListFromPane = (pendingSectionId: string, name: string) => {
      if (!active || snapshot === null) {
        throw new Error(
          "Python Canvas cannot create a List of Objects before loading.",
        );
      }
      updateListMutation(pendingSectionId, {
        description: "Creating the List of Objects.",
        kind: "pending",
      });
      enqueue(async () => {
        if (!active || snapshot === null) {
          return;
        }
        const current = snapshot;
        const existingListIds = new Set(current.lists.map((list) => list.id));
        try {
          const nextSnapshot = await createList({
            expectedRevision: current.project.revision,
            name,
            projectId: current.project.id,
          });
          if (!active) {
            return;
          }
          snapshot = nextSnapshot;
          const created = nextSnapshot.lists.filter(
            (list) => !existingListIds.has(list.id),
          );
          const list = created[0];
          if (created.length !== 1 || list === undefined) {
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateListMutation(pendingSectionId, {
              kind: "error",
              message:
                "The created List of Objects could not be identified. The latest project has been loaded.",
            });
            return;
          }
          acceptCanonicalSnapshot(
            nextSnapshot,
            { kind: "other" },
            null,
            new Map([[list.id, pendingSectionId]]),
          );
          updateListMutation(pendingSectionId, { kind: "idle" });
        } catch (error) {
          if (active) {
            await handleMutationFailure("the List of Objects", error, {
              reportFailure: (next) =>
                updateListMutation(pendingSectionId, next),
              restore: restoreCanonicalProject,
            });
          }
        }
      });
    };

    const queueCallableCommit = (
      callableId: string,
      value: string,
      forceParameterRefresh: boolean,
    ) => {
      if (
        !active ||
        snapshot === null ||
        !snapshot.callables.some((callable) => callable.id === callableId)
      ) {
        return;
      }
      cancelParameterMutation(callableId);
      setCallableDrafts((current) =>
        current[callableId] === value
          ? current
          : { ...current, [callableId]: value },
      );
      setCompletionErrors((current) => {
        if (current[callableId] === undefined) {
          return current;
        }
        const { [callableId]: _cleared, ...remaining } = current;
        return remaining;
      });
      setParameterAuthoringPending(callableId, true);
      updateCallableMutation(callableId, {
        description: "Checking the callable with Basedpyright.",
        kind: "pending",
        parameterAuthoringPending: true,
      });
      enqueue(async () => {
        const current = snapshot;
        if (!active || current === null) {
          return;
        }
        const callable = current.callables.find(
          (candidate) => candidate.id === callableId,
        );
        if (callable === undefined) {
          finishCallableMutation(callableId);
          return;
        }
        const committedSnapshot = await persistCallableExpression(
          callableId,
          value,
          current,
        );
        if (committedSnapshot === null) {
          return;
        }
        if (
          !callableParameterRefreshRequired(
            callable,
            committedSnapshot,
            forceParameterRefresh,
          )
        ) {
          finishCallableMutation(callableId);
          return;
        }
        await retrieveCallableParameters(callableId, committedSnapshot);
      });
    };

    controllerRef.current = {
      commitCallable: (callableId, value) => {
        queueCallableCommit(callableId, value, false);
      },
      commitCallableAndRefreshParameters: (callableId, value) => {
        queueCallableCommit(callableId, value, true);
      },
      deleteCallable: (callableId) => {
        if (requestedCallableDeletes.has(callableId)) {
          return;
        }
        requestedCallableDeletes.add(callableId);
        cancelParameterMutation(callableId);
        enqueue(async () => {
          try {
            if (!active || snapshot === null) {
              return;
            }
            updateCallableMutation(callableId, {
              description: "Deleting the callable.",
              kind: "pending",
            });
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
          } finally {
            requestedCallableDeletes.delete(callableId);
          }
        });
      },
      renameCallable: (callableId, name) => {
        if (requestedCallableRenames.get(callableId) === name) {
          return;
        }
        requestedCallableRenames.set(callableId, name);
        enqueue(async () => {
          try {
            if (!active || snapshot === null) {
              return;
            }
            updateCallableMutation(callableId, {
              description: "Renaming the callable.",
              kind: "pending",
            });
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
              });
            }
          } finally {
            if (requestedCallableRenames.get(callableId) === name) {
              requestedCallableRenames.delete(callableId);
            }
          }
        });
      },
      deleteDictionary: (dictionaryId) => {
        if (requestedDictionaryDeletes.has(dictionaryId)) {
          return;
        }
        requestedDictionaryDeletes.add(dictionaryId);
        cancelDictionaryMutation(dictionaryId);
        enqueue(async () => {
          try {
            if (!active || snapshot === null) {
              return;
            }
            updateDictionaryMutation(dictionaryId, {
              description: "Deleting the Param Dict.",
              kind: "pending",
            });
            const nextSnapshot = await deleteParameterDictionary(dictionaryId, {
              expectedRevision: snapshot.project.revision,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateDictionaryMutation(dictionaryId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the Param Dict", error, {
                reportFailure: (next) =>
                  updateDictionaryMutation(dictionaryId, next),
                restore: restoreCanonicalProject,
              });
            }
          } finally {
            requestedDictionaryDeletes.delete(dictionaryId);
          }
        });
      },
      renameDictionary: (dictionaryId, name) => {
        if (requestedDictionaryRenames.get(dictionaryId) === name) {
          return;
        }
        requestedDictionaryRenames.set(dictionaryId, name);
        enqueue(async () => {
          try {
            if (!active || snapshot === null) {
              return;
            }
            updateDictionaryMutation(dictionaryId, {
              description: "Renaming the Param Dict.",
              kind: "pending",
            });
            const nextSnapshot = await renameParameterDictionary(dictionaryId, {
              expectedRevision: snapshot.project.revision,
              name,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateDictionaryMutation(dictionaryId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the Param Dict", error, {
                reportFailure: (next) =>
                  updateDictionaryMutation(dictionaryId, next),
                restore: restoreCanonicalProject,
              });
            }
          } finally {
            if (requestedDictionaryRenames.get(dictionaryId) === name) {
              requestedDictionaryRenames.delete(dictionaryId);
            }
          }
        });
      },
      deleteList: (listId) => {
        if (requestedListDeletes.has(listId)) {
          return;
        }
        requestedListDeletes.add(listId);
        enqueue(async () => {
          try {
            if (!active || snapshot === null) {
              return;
            }
            updateListMutation(listId, {
              description: "Deleting the List of Objects.",
              kind: "pending",
            });
            const nextSnapshot = await deleteList(listId, {
              expectedRevision: snapshot.project.revision,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateListMutation(listId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the List of Objects", error, {
                reportFailure: (next) => updateListMutation(listId, next),
                restore: restoreCanonicalProject,
              });
            }
          } finally {
            requestedListDeletes.delete(listId);
          }
        });
      },
      renameList: (listId, name) => {
        if (requestedListRenames.get(listId) === name) {
          return;
        }
        requestedListRenames.set(listId, name);
        enqueue(async () => {
          try {
            if (!active || snapshot === null) {
              return;
            }
            updateListMutation(listId, {
              description: "Renaming the List of Objects.",
              kind: "pending",
            });
            const nextSnapshot = await renameList(listId, {
              expectedRevision: snapshot.project.revision,
              name,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateListMutation(listId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the List of Objects", error, {
                reportFailure: (next) => updateListMutation(listId, next),
                restore: restoreCanonicalProject,
              });
            }
          } finally {
            if (requestedListRenames.get(listId) === name) {
              requestedListRenames.delete(listId);
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
        setCallableDrafts((current) =>
          current[callableId] === value
            ? current
            : { ...current, [callableId]: value },
        );
        setCompletionErrors((current) => {
          if (current[callableId] === undefined) {
            return current;
          }
          const { [callableId]: _cleared, ...remaining } = current;
          return remaining;
        });
        clearCallableError(callableId);
      },
      setParameterExpression: (callableId, parameterId, value) => {
        if (active && !pendingCallableCommits.has(callableId)) {
          clearCallableError(callableId);
          setParameterItemExpression(host, callableId, parameterId, value);
        }
      },
      setParameterName: (callableId, parameterId, name) => {
        if (active && !pendingCallableCommits.has(callableId)) {
          clearCallableError(callableId);
          setParameterItemName(host, callableId, parameterId, name);
        }
      },
      setDictionaryEntryExpression: (dictionaryId, entryId, value) => {
        if (
          active &&
          snapshot?.parameterDictionaries.some(
            (dictionary) => dictionary.id === dictionaryId,
          )
        ) {
          clearDictionaryError(dictionaryId);
          pendingDictionaryValueEdits.add(dictionaryId);
          setDictionaryEntryExpression(host, dictionaryId, entryId, value);
        }
      },
      setDictionaryEntryName: (dictionaryId, entryId, name) => {
        if (
          active &&
          snapshot?.parameterDictionaries.some(
            (dictionary) => dictionary.id === dictionaryId,
          )
        ) {
          clearDictionaryError(dictionaryId);
          setDictionaryEntryName(host, dictionaryId, entryId, name);
        }
      },
      decrementListChildren: (listId, count) => {
        if (
          !active ||
          snapshot === null ||
          count <= 0 ||
          !snapshot.lists.some((list) => list.id === listId)
        ) {
          return;
        }
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          const current = snapshot;
          updateListMutation(listId, {
            description: "Removing list children.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await decrementListChildren(listId, {
              count,
              expectedRevision: current.project.revision,
              projectId: current.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateListMutation(listId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the list children", error, {
                reportFailure: (next) => updateListMutation(listId, next),
                restore: restoreCanonicalProject,
              });
            }
          }
        });
      },
      incrementListChildren: (listId, count) => {
        if (
          !active ||
          snapshot === null ||
          count <= 0 ||
          !snapshot.lists.some((list) => list.id === listId)
        ) {
          return;
        }
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          const current = snapshot;
          updateListMutation(listId, {
            description: "Adding list children.",
            kind: "pending",
          });
          try {
            const nextSnapshot = await incrementListChildren(listId, {
              count,
              expectedRevision: current.project.revision,
              projectId: current.project.id,
            });
            if (!active) {
              return;
            }
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, { kind: "other" });
            updateListMutation(listId, { kind: "idle" });
          } catch (error) {
            if (active) {
              await handleMutationFailure("the list children", error, {
                reportFailure: (next) => updateListMutation(listId, next),
                restore: restoreCanonicalProject,
              });
            }
          }
        });
      },
    };

    const requestSectionStructureMutation = (
      mutation: ReturnType<typeof sectionStructureMutations>[number],
    ) => {
      if (mutation.kind === "delete") {
        if (mutation.sectionKind === "callable") {
          controllerRef.current?.deleteCallable(mutation.sectionId);
        } else if (mutation.sectionKind === "dictionary") {
          controllerRef.current?.deleteDictionary(mutation.sectionId);
        } else {
          controllerRef.current?.deleteList(mutation.sectionId);
        }
        return;
      }
      if (mutation.sectionKind === "callable") {
        controllerRef.current?.renameCallable(mutation.sectionId, mutation.name);
      } else if (mutation.sectionKind === "dictionary") {
        controllerRef.current?.renameDictionary(
          mutation.sectionId,
          mutation.name,
        );
      } else {
        controllerRef.current?.renameList(mutation.sectionId, mutation.name);
      }
    };

    const unsubscribe = host.subscribe((document) => {
      if (isProjectingRef.current || snapshot === null || !active) {
        return;
      }
      if (
        snapshot.parameterDictionaries.some((dictionary) =>
          promoteDictionaryEntryParents(host, dictionary.id),
        )
      ) {
        return;
      }
      const valueEditedDictionaries = new Set(pendingDictionaryValueEdits);
      pendingDictionaryValueEdits.clear();
      for (const callableId of changedParameterCallableIds(
        document,
        snapshot,
      )) {
        if (!pendingCallableCommits.has(callableId)) {
          scheduleParameterListMutation(callableId);
        }
      }
      for (const dictionaryId of changedDictionaryIds(document, snapshot)) {
        scheduleDictionaryEntriesMutation(
          dictionaryId,
          !valueEditedDictionaries.has(dictionaryId),
        );
      }
      for (const mutation of sectionStructureMutations(document, snapshot)) {
        requestSectionStructureMutation(mutation);
      }
      if (forestMutationProposal(document, snapshot) !== null) {
        queueForestMutation();
      }
      if (hasPythonTargetChange(host, snapshot)) {
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
        registerWorkspaceCreationCommands(host, [
          {
            id: "python-callable",
            label: "Python callable",
            group: "Python",
            createSection: () => {
              if (snapshot === null) {
                throw new Error(
                  "Python Canvas cannot create a callable before loading.",
                );
              }
              const name = nextCreatedSectionName(
                snapshot,
                defaultCallableName,
              );
              const sectionId = `python-canvas:pending-callable:${crypto.randomUUID()}`;
              const section = createPendingCallableSection(
                snapshot,
                sectionId,
                name,
              );
              createCallableFromPane(sectionId, name);
              return section;
            },
          },
          {
            id: "parameter-dictionary",
            label: "Param Dict",
            group: "Python",
            createSection: () => {
              if (snapshot === null) {
                throw new Error(
                  "Python Canvas cannot create a Param Dict before loading.",
                );
              }
              const name = nextCreatedSectionName(
                snapshot,
                defaultParameterDictionaryName,
              );
              const sectionId = `python-canvas:pending-parameter-dictionary:${crypto.randomUUID()}`;
              const section = createPendingParameterDictionarySection(
                sectionId,
                name,
              );
              createParameterDictionaryFromPane(sectionId, name);
              return section;
            },
          },
          {
            id: "list-of-objects",
            label: "List of Objects",
            group: "Python",
            createSection: () => {
              if (snapshot === null) {
                throw new Error(
                  "Python Canvas cannot create a List of Objects before loading.",
                );
              }
              const name = nextCreatedSectionName(snapshot, defaultListName);
              const sectionId = `python-canvas:pending-list:${crypto.randomUUID()}`;
              const section = createPendingListSection(sectionId, name);
              createListFromPane(sectionId, name);
              return section;
            },
          },
        ]);
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
      cancelAllDictionaryMutations();
      controllerRef.current = null;
      unsubscribe();
      disposeHost();
    };
  }, []);

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
      dictionaryMutationError: (dictionaryId) => {
        const mutation = dictionaryMutations[dictionaryId];
        return mutation?.kind === "error" ? mutation.message : null;
      },
      listMutationError: (listId) => {
        const mutation = listMutations[listId];
        return mutation?.kind === "error" ? mutation.message : null;
      },
      callableDraft: (callableId) => callableDrafts[callableId] ?? "",
      onCallableCommit: (callableId, value) =>
        controllerRef.current?.commitCallable(callableId, value),
      onCallableAlternateCommit: (callableId, value) =>
        controllerRef.current?.commitCallableAndRefreshParameters(
          callableId,
          value,
        ),
      onCallableDraftChange: (callableId, value) =>
        controllerRef.current?.setCallableDraft(callableId, value),
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
      onDictionaryEntryExpressionChange: (dictionaryId, entryId, value) =>
        controllerRef.current?.setDictionaryEntryExpression(
          dictionaryId,
          entryId,
          value,
        ),
      onDictionaryEntryNameChange: (dictionaryId, entryId, name) =>
        controllerRef.current?.setDictionaryEntryName(
          dictionaryId,
          entryId,
          name,
        ),
      onListDecrement: (listId, count) =>
        controllerRef.current?.decrementListChildren(listId, count),
      onListIncrement: (listId, count) =>
        controllerRef.current?.incrementListChildren(listId, count),
      parameterAuthoringPending: (callableId) => {
        const mutation = callableMutations[callableId];
        return (
          mutation?.kind === "pending" &&
          mutation.parameterAuthoringPending === true
        );
      },
    }),
    [
      callableDrafts,
      callableMutations,
      completionErrors,
      completionProviders,
      dictionaryMutations,
      listMutations,
    ],
  );

  return (
    <PythonCanvasView
      announcement={announcement}
      mutationContext={mutationContext}
      pythonTargetCompletionError={pythonTargetCompletionError}
      state={state}
    />
  );
}
