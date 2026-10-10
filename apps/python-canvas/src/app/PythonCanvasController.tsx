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
  connectProjectSnapshotStream,
  fetchProjectSnapshot,
  refreshCallableParameters,
} from "../api/client";
import type { ProjectSnapshotV2 } from "../api/generatedContract";
import { createCallableCompletionProvider } from "../sections/callableCompletion";
import { createPythonTargetCompletionProvider } from "../sections/pythonTargetCompletion";
import {
  applyProjectSnapshotToWorkspace,
  createPendingCallableSection,
  createPendingListSection,
  createPendingParameterDictionarySection,
  projectWorkspaceDocument,
  type ProjectSnapshotProjectionOptions,
} from "./workspaceProjection";
import { registerPythonCanvasWorkspaceClipboardAuthority } from "./workspaceClipboardAuthority";
import type { PythonCanvasMutationContextValue } from "./PythonCanvasMutationContext";
import {
  changedParameterCallableIds,
  changedDictionaryIds,
  forestMutationProposal,
  hasPythonTargetChange,
  isCallableResolutionFailure,
  isNewerProjectSnapshot,
  mutationErrorMessage,
  sameProposedList,
  sectionStructureMutations,
  type AppController,
  type AppState,
  type CanonicalSnapshotAcceptanceOptions,
  type MutationAnswer,
  type MutationState,
  type RevisionConflictDraft,
} from "./pythonCanvasAppSupport";
import {
  collectRetainedDictionaryEntries,
  collectRetainedParameterLists,
  shouldKeepAuthoredPython,
} from "./pythonCanvasProjectionRetention";
import { createDictionaryEntryParentPromotionScheduler } from "./dictionaryEntryParentPromotion";
import {
  bootstrapPythonCanvasSavedViews,
  createPythonCanvasSavedViewsPersistence,
} from "./pythonCanvasSavedViews";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import { createPythonCanvasMutations } from "./pythonCanvasMutations";
import {
  dispatchSectionStructureMutation,
  nextCreatedSectionName,
} from "./pythonCanvasMutationSupport";
import type { GeneratedPythonTerminalContextValue } from "./generatedPythonTerminalContext";
import {
  createGeneratedPythonTerminalRuntime,
  initialGeneratedPythonTerminalState,
  type GeneratedPythonTerminalRuntime,
} from "./generatedPythonTerminalController";
import { PythonCanvasView } from "./PythonCanvasView";
import { createDisplayRuntime, initialDisplayState } from "./displayRuntime";
import { getPlayground } from "./playgroundCatalog";

type CallableMutationStates = Record<string, MutationState>;
type DictionaryMutationStates = Record<string, MutationState>;
type ListMutationStates = Record<string, MutationState>;
type CallableDrafts = Record<string, string>;
type CompletionProviders = Record<string, TextValueCompletionProvider>;
type CompletionErrors = Record<string, string>;
export function PythonCanvasController() {
  const [state, setState] = useState<AppState>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
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
  const [terminalState, setTerminalState] = useState(
    initialGeneratedPythonTerminalState,
  );
  const [displayState, setDisplayState] = useState(initialDisplayState);
  const displayRuntimeRef = useRef<ReturnType<
    typeof createDisplayRuntime
  > | null>(null);
  const controllerRef = useRef<AppController | null>(null);
  const terminalRuntimeRef = useRef<GeneratedPythonTerminalRuntime | null>(
    null,
  );
  const isProjectingRef = useRef(false);

  useEffect(() => {
    setState({ kind: "loading" });
    const host = createWorkspaceHost();
    setWorkspaceColorMode(host, "system");
    let active = true;
    let disposed = false;
    let snapshot: ProjectSnapshotV2 | null = null;
    let disconnectProjectSnapshotStream: (() => void) | null = null;
    const pendingCallableCommits = new Set<string>();
    const unresolvedPendingSectionIds = new Set<string>();
    let mutationChain = Promise.resolve();
    const dictionaryEntryParentPromotion =
      createDictionaryEntryParentPromotionScheduler({
        host,
        isActive: () => active,
        currentSnapshot: () => snapshot,
      });

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
    const savedViewsPersistence = createPythonCanvasSavedViewsPersistence({
      projectId: () => snapshot?.project.id ?? null,
      reportFailure: () =>
        updateAnnouncement({
          kind: "error",
          message:
            "Python Canvas could not save saved views in this browser. Your current views remain open.",
        }),
    });
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
    const enqueue = (operation: () => Promise<void>): Promise<void> => {
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
      return mutationChain;
    };
    const enqueueClipboardOperation = <Result,>(
      operation: () => Promise<Result>,
    ): Promise<Result> => {
      const queued = mutationChain.then(operation, operation);
      mutationChain = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
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
      publicationBaseline: ProjectSnapshotV2 | null,
    ) => {
      setCallableDrafts((current) => {
        const next: CallableDrafts = {};
        for (const callable of nextSnapshot.callables) {
          const currentDraft = current[callable.id];
          const publishedPrevious = publicationBaseline?.callables.find(
            (candidate) => candidate.id === callable.id,
          );
          next[callable.id] =
            resetCallableId === callable.id ||
            currentDraft === undefined ||
            (publishedPrevious !== undefined &&
              currentDraft === publishedPrevious.authoredExpression)
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
    const acceptCanonicalSnapshot = (
      nextSnapshot: ProjectSnapshotV2,
      answer: MutationAnswer,
      options: CanonicalSnapshotAcceptanceOptions = {},
    ) => {
      const {
        activeSectionIds,
        canonicalRootLayoutOverrides,
        canonicalSectionPresentationOverrides,
        pendingSectionIds = new Map(),
        revisionConflictDraft = null,
      } = options;
      snapshot = nextSnapshot;
      displayRuntimeRef.current?.setRevision(nextSnapshot.project.revision);
      const document = host.getSnapshot();
      applyProjection(nextSnapshot, {
        keepAuthoredPython: shouldKeepAuthoredPython(
          host,
          nextSnapshot,
          answer,
        ),
        keepParameterLists: collectRetainedParameterLists(
          document,
          nextSnapshot,
          answer,
          revisionConflictDraft,
        ),
        keepDictionaryEntries: collectRetainedDictionaryEntries(
          document,
          nextSnapshot,
          answer,
          revisionConflictDraft,
        ),
        canonicalRootLayoutOverrides,
        canonicalSectionPresentationOverrides,
        activeSectionIds,
        pendingSectionIds,
        unresolvedPendingSectionIds,
      });
      synchronizeReactProjection(
        nextSnapshot,
        answer.kind === "commit" ? answer.callableId : null,
        answer.kind === "publication" ? answer.previousSnapshot : null,
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
        unresolvedPendingSectionIds,
      });
      synchronizeReactProjection(snapshot, null, null);
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
      acceptCanonicalSnapshot(
        latest,
        { kind: "other" },
        {
          revisionConflictDraft,
        },
      );
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
    const handleClipboardFailure = async (error: unknown) => {
      await handleMutationFailure("the clipboard", error, {
        reportFailure: updateAnnouncement,
        restore: () => restoreCanonicalProject(),
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
    const setCallableDraft = (callableId: string, value: string) => {
      setCallableDrafts((current) =>
        current[callableId] === value
          ? current
          : { ...current, [callableId]: value },
      );
    };
    const clearCallableCompletionError = (callableId: string) => {
      setCompletionErrors((current) => {
        if (current[callableId] === undefined) {
          return current;
        }
        const { [callableId]: _cleared, ...remaining } = current;
        return remaining;
      });
    };
    const acceptMutationCanonicalSnapshot = (
      nextSnapshot: ProjectSnapshotV2,
      answer: MutationAnswer,
      revisionConflictDraft: RevisionConflictDraft = null,
      pendingSectionIds: ReadonlyMap<string, string> = new Map(),
    ) => {
      acceptCanonicalSnapshot(nextSnapshot, answer, {
        pendingSectionIds,
        revisionConflictDraft,
      });
    };
    const mutations = createPythonCanvasMutations({
      acceptCanonicalSnapshot: acceptMutationCanonicalSnapshot,
      clearCallableCompletionError,
      clearCallableError,
      clearDictionaryError,
      currentSnapshot: () => snapshot,
      enqueue,
      finishCallableMutation,
      handleMutationFailure,
      host,
      isActive: () => active,
      isParameterAuthoringPending: (callableId) =>
        pendingCallableCommits.has(callableId),
      persistCallableExpression,
      publishSnapshot: (nextSnapshot) => {
        snapshot = nextSnapshot;
      },
      restoreCanonicalProject,
      retrieveCallableParameters,
      registerPendingSection: (pendingSectionId) => {
        unresolvedPendingSectionIds.add(pendingSectionId);
      },
      setCallableDraft,
      setParameterAuthoringPending,
      settlePendingSection: (pendingSectionId) => {
        unresolvedPendingSectionIds.delete(pendingSectionId);
      },
      updateAnnouncement,
      updateCallableMutation,
      updateDictionaryMutation,
      updateListMutation,
    });
    controllerRef.current = mutations.controller;
    const terminalRuntime = createGeneratedPythonTerminalRuntime({
      currentSnapshot: () => snapshot,
      isActive: () => active,
      runAfterTargetFlush: mutations.runWithPythonTargetFlushed,
      updateState: setTerminalState,
    });
    terminalRuntimeRef.current = terminalRuntime;
    const displayRuntime = createDisplayRuntime({
      runAfterTargetFlush: mutations.runWithPythonTargetFlushed,
      updateState: setDisplayState,
    });
    displayRuntimeRef.current = displayRuntime;

    const currentWorkspaceSnapshot = () =>
      active && !isProjectingRef.current ? snapshot : null;
    const scheduleChangedParameterLists = (
      document: WorkspaceDocument,
      current: ProjectSnapshotV2,
    ) => {
      for (const callableId of changedParameterCallableIds(document, current)) {
        if (pendingCallableCommits.has(callableId)) {
          continue;
        }
        mutations.scheduleParameterListMutation(callableId);
      }
    };
    const scheduleChangedDictionaryEntries = (
      document: WorkspaceDocument,
      current: ProjectSnapshotV2,
      valueEditedDictionaries: ReadonlySet<string>,
    ) => {
      for (const dictionaryId of changedDictionaryIds(document, current)) {
        mutations.scheduleDictionaryEntriesMutation(
          dictionaryId,
          !valueEditedDictionaries.has(dictionaryId),
        );
      }
    };
    const dispatchChangedSectionStructures = (
      document: WorkspaceDocument,
      current: ProjectSnapshotV2,
    ) => {
      for (const mutation of sectionStructureMutations(document, current)) {
        dispatchSectionStructureMutation(controllerRef.current, mutation);
      }
    };
    const scheduleChangedWorkspaceForest = (
      document: WorkspaceDocument,
      current: ProjectSnapshotV2,
    ) => {
      if (forestMutationProposal(document, current) !== null) {
        mutations.queueForestMutation();
      }
    };
    const scheduleChangedPythonTarget = (current: ProjectSnapshotV2) => {
      if (hasPythonTargetChange(host, current)) {
        mutations.schedulePythonTargetMutation();
      }
    };
    const handleWorkspaceDocumentChange = (document: WorkspaceDocument) => {
      savedViewsPersistence.persist(document);
      const current = currentWorkspaceSnapshot();
      if (current === null) {
        return;
      }
      if (dictionaryEntryParentPromotion.required(document, current)) {
        dictionaryEntryParentPromotion.schedule();
        return;
      }
      const valueEditedDictionaries = mutations.consumeDictionaryValueEdits();
      scheduleChangedParameterLists(document, current);
      scheduleChangedDictionaryEntries(
        document,
        current,
        valueEditedDictionaries,
      );
      dispatchChangedSectionStructures(document, current);
      scheduleChangedWorkspaceForest(document, current);
      scheduleChangedPythonTarget(current);
    };
    const unsubscribe = host.subscribe(handleWorkspaceDocumentChange);

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
              const name = nextCreatedSectionName(snapshot, "New callable");
              const sectionId = `python-canvas:pending-callable:${crypto.randomUUID()}`;
              const section = createPendingCallableSection(
                snapshot,
                sectionId,
                name,
              );
              mutations.createCallableFromPane(sectionId, name);
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
              const name = nextCreatedSectionName(snapshot, "New Param Dict");
              const sectionId = `python-canvas:pending-parameter-dictionary:${crypto.randomUUID()}`;
              const section = createPendingParameterDictionarySection(
                sectionId,
                name,
              );
              mutations.createParameterDictionaryFromPane(sectionId, name);
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
              const name = nextCreatedSectionName(
                snapshot,
                "New List of Objects",
              );
              const sectionId = `python-canvas:pending-list:${crypto.randomUUID()}`;
              const section = createPendingListSection(sectionId, name);
              mutations.createListFromPane(sectionId, name);
              return section;
            },
          },
        ]);
        const initialSavedViews = bootstrapPythonCanvasSavedViews(
          projectWorkspaceDocument(initialSnapshot),
          initialSnapshot.project.id,
        );
        displayRuntime.setRevision(initialSnapshot.project.revision);
        if (initialSavedViews.storageIssue !== null) {
          updateAnnouncement({
            kind: "error",
            message:
              initialSavedViews.storageIssue === "malformed"
                ? "Saved views for this project could not be loaded. Python Canvas started with Overview."
                : "Saved views are unavailable in this browser. Python Canvas will keep them for this session.",
          });
        }
        isProjectingRef.current = true;
        savedViewsPersistence.beginInitialLoad(initialSavedViews.document);
        try {
          host.loadDocument(initialSavedViews.document);
        } finally {
          isProjectingRef.current = false;
        }
        savedViewsPersistence.completeInitialLoad(host.getSnapshot());
        registerPythonCanvasWorkspaceClipboardAuthority({
          acceptCanonicalSnapshot: (
            nextSnapshot,
            canonicalRootLayoutOverrides,
            canonicalSectionPresentationOverrides,
            activeSectionIds,
          ) =>
            acceptCanonicalSnapshot(
              nextSnapshot,
              { kind: "other" },
              {
                activeSectionIds,
                canonicalRootLayoutOverrides,
                canonicalSectionPresentationOverrides,
              },
            ),
          currentSnapshot: () => snapshot,
          enqueue: enqueueClipboardOperation,
          handleCopyFailure: handleClipboardFailure,
          handlePasteFailure: handleClipboardFailure,
          host,
          isActive: () => active,
          updateAnnouncement,
        });
        synchronizeReactProjection(initialSnapshot, null, null);
        setState({
          kind: "ready",
          host,
          projectId: initialSnapshot.project.id,
        });
        disconnectProjectSnapshotStream = connectProjectSnapshotStream({
          onProtocolError: () => {
            updateAnnouncement({
              kind: "error",
              message:
                "Python Canvas received an invalid project update from the server.",
            });
          },
          onSnapshot: (nextSnapshot) => {
            void enqueue(async () => {
              const current = snapshot;
              if (!active || current === null) {
                return;
              }
              if (nextSnapshot.project.id !== current.project.id) {
                updateAnnouncement({
                  kind: "error",
                  message:
                    "Python Canvas received an update for a different project.",
                });
                return;
              }
              if (!isNewerProjectSnapshot(nextSnapshot, current)) {
                return;
              }
              acceptCanonicalSnapshot(nextSnapshot, {
                kind: "publication",
                previousSnapshot: current,
              });
            });
          },
        });
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
      mutations.cancelTargetMutation();
      mutations.cancelAllParameterMutations();
      mutations.cancelAllDictionaryMutations();
      disconnectProjectSnapshotStream?.();
      controllerRef.current = null;
      terminalRuntime.dispose();
      terminalRuntimeRef.current = null;
      displayRuntime.dispose();
      displayRuntimeRef.current = null;
      unsubscribe();
      disposeHost();
    };
  }, [loadAttempt]);

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

  const terminalActions = useMemo(
    () => ({
      close: () => terminalRuntimeRef.current?.close(),
      create: () => terminalRuntimeRef.current?.create(),
      hide: () => terminalRuntimeRef.current?.hide(),
      reportStreamError: (message: string) =>
        terminalRuntimeRef.current?.reportStreamError(message),
      resize: (height: number) => terminalRuntimeRef.current?.resize(height),
      run: () => terminalRuntimeRef.current?.run(),
      show: () => terminalRuntimeRef.current?.show(),
    }),
    [],
  );
  const terminalContext = useMemo<GeneratedPythonTerminalContextValue>(
    () => ({ actions: terminalActions, state: terminalState }),
    [terminalActions, terminalState],
  );

  return (
    <PythonCanvasView
      announcement={announcement}
      mutationContext={mutationContext}
      onRetry={() => setLoadAttempt((value) => value + 1)}
      pythonTargetCompletionError={pythonTargetCompletionError}
      state={state}
      terminalContext={terminalContext}
      displayContext={{
        enabled:
          state.kind === "ready" &&
          getPlayground(state.projectId) !== undefined,
        state: displayState,
        run: () => displayRuntimeRef.current?.run(),
      }}
    />
  );
}
