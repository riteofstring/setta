import { useEffect, useMemo, useRef, useState } from "react";
import {
  createWorkspaceHost,
  registerWorkspaceCreationCommands,
  setWorkspaceColorMode,
  type TextValueCompletionProvider,
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
  setCallableParameters,
  setPythonTarget,
} from "../backend/client";
import type { ProjectSnapshotV2 } from "../backend/generatedContract";
import { createCallableCompletionProvider } from "../sections/callableCompletion";
import { createPythonTargetCompletionProvider } from "../sections/pythonTargetCompletion";
import {
  applyProjectSnapshotToWorkspace,
  createPendingCallableSection,
  isCallableParameterAuthoringPending,
  projectWorkspaceDocument,
  readGeneratedPythonTarget,
  setCallableParameterAuthoringPending,
  setParameterItemExpression,
  setParameterItemName,
  type ProjectSnapshotProjectionOptions,
} from "./workspaceProjection";
import type { PythonCanvasMutationContextValue } from "./PythonCanvasMutationContext";
import {
  changedParameterCallableIds,
  hasPythonTargetChange,
  mutationErrorMessage,
  parameterListDraft,
  parameterMutationProposal,
  sameCanonicalPythonTarget,
  sameParameterList,
  sameProposedList,
  type AppController,
  type MutationAnswer,
  type RevisionConflictDraft,
} from "./pythonCanvasAppSupport";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import { PythonCanvasView } from "./PythonCanvasView";

const mutationDebounceMs = 300;
const defaultCallableName = "New callable";

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

export function PythonCanvasApp() {
  const [state, setState] = useState<AppState>({ kind: "loading" });
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
  const [callableMutations, setCallableMutations] =
    useState<CallableMutationStates>({});
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
        for (const callableId of [...pendingCallableCommits]) {
          if (
            nextSnapshot.callables.some(
              (callable) => callable.id === callableId,
            )
          ) {
            setCallableParameterAuthoringPending(host, callableId, true);
          } else {
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
      isProjectingRef.current = true;
      try {
        setCallableParameterAuthoringPending(host, callableId, pending);
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
      pendingCallableSectionIds: ReadonlyMap<string, string> = new Map(),
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
        pendingCallableSectionIds,
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
        pendingCallableSectionIds: new Map(),
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

    const createCallableFromPane = (pendingSectionId: string) => {
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
            name: defaultCallableName,
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

    controllerRef.current = {
      commitCallable: (callableId, value) => {
        if (
          !active ||
          snapshot === null ||
          !snapshot.callables.some((callable) => callable.id === callableId)
        ) {
          return;
        }
        cancelParameterMutation(callableId);
        setCallableDrafts((current) => ({ ...current, [callableId]: value }));
        setCompletionErrors((current) => {
          const { [callableId]: _cleared, ...remaining } = current;
          return remaining;
        });
        setParameterAuthoringPending(callableId, true);
        updateCallableMutation(callableId, {
          description: "Checking the callable with Basedpyright.",
          kind: "pending",
        });
        enqueue(async () => {
          if (!active || snapshot === null) {
            return;
          }
          const callable = snapshot.callables.find(
            (candidate) => candidate.id === callableId,
          );
          if (callable === undefined) {
            setParameterAuthoringPending(callableId, false);
            updateCallableMutation(callableId, { kind: "idle" });
            return;
          }
          try {
            const nextSnapshot = await commitCallable(callableId, {
              authoredExpression: value,
              expectedRevision: snapshot.project.revision,
              projectId: snapshot.project.id,
            });
            if (!active) {
              return;
            }
            pendingCallableCommits.delete(callableId);
            snapshot = nextSnapshot;
            acceptCanonicalSnapshot(nextSnapshot, {
              callableId,
              kind: "commit",
            });
            updateCallableMutation(callableId, { kind: "idle" });
          } catch (error) {
            if (active) {
              setParameterAuthoringPending(callableId, false);
              await handleMutationFailure("the callable", error, {
                reportFailure: (next) =>
                  updateCallableMutation(callableId, next),
                restore: () =>
                  restoreCanonicalProject({
                    callableId,
                    kind: "commit",
                  }),
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
        if (
          active &&
          !isCallableParameterAuthoringPending(host.getSnapshot(), callableId)
        ) {
          clearCallableError(callableId);
          setParameterItemExpression(host, callableId, parameterId, value);
        }
      },
      setParameterName: (callableId, parameterId, name) => {
        if (
          active &&
          !isCallableParameterAuthoringPending(host.getSnapshot(), callableId)
        ) {
          clearCallableError(callableId);
          setParameterItemName(host, callableId, parameterId, name);
        }
      },
    };

    const unsubscribe = host.subscribe((document) => {
      if (isProjectingRef.current || snapshot === null || !active) {
        return;
      }
      for (const callableId of changedParameterCallableIds(
        document,
        snapshot,
      )) {
        scheduleParameterListMutation(callableId);
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
              const sectionId = `python-canvas:pending-callable:${crypto.randomUUID()}`;
              const section = createPendingCallableSection(
                snapshot,
                sectionId,
                defaultCallableName,
              );
              createCallableFromPane(sectionId);
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
      mutationContext={mutationContext}
      pythonTargetCompletionError={pythonTargetCompletionError}
      state={state}
    />
  );
}
