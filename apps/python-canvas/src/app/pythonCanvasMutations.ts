import type { WorkspaceHost } from "@setta/workspace";

import {
  createCallable,
  createList,
  createParameterDictionary,
  decrementListChildren,
  deleteCallable,
  deleteList,
  deleteParameterDictionary,
  incrementListChildren,
  renameCallable,
  renameList,
  renameParameterDictionary,
  replaceSectionForest,
  setCallableParameters,
  setParameterDictionaryEntries,
} from "../api/client";
import type { ProjectSnapshotV2 } from "../api/generatedContract";
import {
  setDictionaryEntryExpression,
  setDictionaryEntryName,
  setParameterItemExpression,
  setParameterItemName,
} from "./workspaceProjection";
import {
  callableParameterRefreshRequired,
  dictionaryEntryMutationProposal,
  forestMutationProposal,
  isCallableResolutionFailure,
  parameterMutationProposal,
  type AppController,
  type MutationAnswer,
  type MutationState,
  type RevisionConflictDraft,
} from "./pythonCanvasAppSupport";
import {
  cancelTimer,
  cancelTimers,
  requireCurrentSnapshot,
} from "./pythonCanvasMutationSupport";
import { createPythonTargetMutations } from "./pythonTargetMutations";

const mutationDebounceMs = 300;

type MutationFailureOptions = {
  reportFailure: (next: MutationState) => void;
  restore: () => void;
  revisionConflictDraft?: RevisionConflictDraft;
};

export type PythonCanvasMutationEnvironment = {
  acceptCanonicalSnapshot: (
    snapshot: ProjectSnapshotV2,
    answer: MutationAnswer,
    revisionConflictDraft?: RevisionConflictDraft,
    pendingSectionIds?: ReadonlyMap<string, string>,
  ) => void;
  clearCallableCompletionError: (callableId: string) => void;
  clearCallableError: (callableId: string) => void;
  clearDictionaryError: (dictionaryId: string) => void;
  currentSnapshot: () => ProjectSnapshotV2 | null;
  enqueue: (operation: () => Promise<void>) => Promise<void>;
  finishCallableMutation: (callableId: string) => void;
  handleMutationFailure: (
    target: string,
    error: unknown,
    options: MutationFailureOptions,
  ) => Promise<void>;
  host: WorkspaceHost;
  isActive: () => boolean;
  isParameterAuthoringPending: (callableId: string) => boolean;
  persistCallableExpression: (
    callableId: string,
    value: string,
    current: ProjectSnapshotV2,
  ) => Promise<ProjectSnapshotV2 | null>;
  publishSnapshot: (snapshot: ProjectSnapshotV2) => void;
  restoreCanonicalProject: (answer?: MutationAnswer) => void;
  retrieveCallableParameters: (
    callableId: string,
    snapshot: ProjectSnapshotV2,
  ) => Promise<void>;
  registerPendingSection: (pendingSectionId: string) => void;
  setCallableDraft: (callableId: string, value: string) => void;
  setParameterAuthoringPending: (callableId: string, pending: boolean) => void;
  settlePendingSection: (pendingSectionId: string) => void;
  updateAnnouncement: (next: MutationState) => void;
  updateCallableMutation: (callableId: string, next: MutationState) => void;
  updateDictionaryMutation: (dictionaryId: string, next: MutationState) => void;
  updateListMutation: (listId: string, next: MutationState) => void;
};

export function createPythonCanvasMutations(
  environment: PythonCanvasMutationEnvironment,
) {
  const parameterTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const dictionaryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingDictionaryValueEdits = new Set<string>();
  const requestedCallableDeletes = new Set<string>();
  const requestedCallableRenames = new Map<string, string>();
  const requestedDictionaryDeletes = new Set<string>();
  const requestedDictionaryRenames = new Map<string, string>();
  const requestedListDeletes = new Set<string>();
  const requestedListRenames = new Map<string, string>();
  const pythonTargetMutations = createPythonTargetMutations(environment);

  function cancelParameterMutation(callableId: string) {
    cancelTimer(parameterTimers, callableId);
  }

  function cancelDictionaryMutation(dictionaryId: string) {
    cancelTimer(dictionaryTimers, dictionaryId);
  }

  function scheduleParameterListMutation(callableId: string) {
    cancelParameterMutation(callableId);
    const timer = setTimeout(() => {
      parameterTimers.delete(callableId);
      environment.enqueue(async () => {
        const current = requireCurrentSnapshot(environment);
        if (current === null) {
          return;
        }
        const proposal = parameterMutationProposal(
          environment.host.getSnapshot(),
          current,
          callableId,
        );
        if (proposal === null) {
          return;
        }
        environment.updateCallableMutation(callableId, {
          description: "Checking the parameters with Basedpyright.",
          kind: "pending",
        });
        try {
          const next = await setCallableParameters(callableId, {
            expectedRevision: current.project.revision,
            parameters: proposal,
            projectId: current.project.id,
          });
          if (!environment.isActive()) {
            return;
          }
          environment.publishSnapshot(next);
          environment.acceptCanonicalSnapshot(next, {
            callableId,
            kind: "parameters",
            sent: proposal,
          });
          environment.updateCallableMutation(callableId, { kind: "idle" });
        } catch (error) {
          if (environment.isActive()) {
            await environment.handleMutationFailure("the parameters", error, {
              reportFailure: (next) =>
                environment.updateCallableMutation(callableId, next),
              restore: () =>
                environment.restoreCanonicalProject({
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
  }

  function scheduleDictionaryEntriesMutation(
    dictionaryId: string,
    immediate: boolean,
  ) {
    cancelDictionaryMutation(dictionaryId);
    if (immediate) {
      environment.enqueue(() => persistDictionaryEntries(dictionaryId));
      return;
    }
    const timer = setTimeout(() => {
      dictionaryTimers.delete(dictionaryId);
      environment.enqueue(() => persistDictionaryEntries(dictionaryId));
    }, mutationDebounceMs);
    dictionaryTimers.set(dictionaryId, timer);
  }

  async function persistDictionaryEntries(dictionaryId: string) {
    const current = requireCurrentSnapshot(environment);
    if (current === null) {
      return;
    }
    const proposal = dictionaryEntryMutationProposal(
      environment.host.getSnapshot(),
      current,
      dictionaryId,
    );
    if (proposal === null) {
      return;
    }
    environment.updateDictionaryMutation(dictionaryId, {
      description: "Checking the dictionary with Basedpyright.",
      kind: "pending",
    });
    try {
      const next = await setParameterDictionaryEntries(dictionaryId, {
        entries: proposal,
        expectedRevision: current.project.revision,
        projectId: current.project.id,
      });
      if (!environment.isActive()) {
        return;
      }
      environment.publishSnapshot(next);
      environment.acceptCanonicalSnapshot(next, {
        dictionaryId,
        kind: "dictionary",
        sent: proposal,
      });
      environment.updateDictionaryMutation(dictionaryId, { kind: "idle" });
    } catch (error) {
      if (environment.isActive()) {
        await environment.handleMutationFailure("the dictionary", error, {
          reportFailure: (next) =>
            environment.updateDictionaryMutation(dictionaryId, next),
          restore: () =>
            environment.restoreCanonicalProject({
              dictionaryId,
              kind: "dictionary",
              sent: proposal,
            }),
          revisionConflictDraft: { dictionaryId, kind: "dictionary" },
        });
      }
    }
  }

  function queueForestMutation() {
    environment.enqueue(async () => {
      const current = requireCurrentSnapshot(environment);
      if (current === null) {
        return;
      }
      const proposal = forestMutationProposal(
        environment.host.getSnapshot(),
        current,
      );
      if (proposal === null) {
        return;
      }
      environment.updateAnnouncement({
        description: "Saving the section order.",
        kind: "pending",
      });
      try {
        const next = await replaceSectionForest({
          expectedRevision: current.project.revision,
          listChildren: proposal.listChildren,
          projectId: current.project.id,
          topLevelSectionIds: proposal.topLevelSectionIds,
        });
        if (!environment.isActive()) {
          return;
        }
        const laterForestProposal = forestMutationProposal(
          environment.host.getSnapshot(),
          next,
        );
        environment.publishSnapshot(next);
        if (laterForestProposal === null) {
          environment.acceptCanonicalSnapshot(next, { kind: "other" });
        }
        environment.updateAnnouncement({ kind: "idle" });
      } catch (error) {
        if (environment.isActive()) {
          await environment.handleMutationFailure("the section order", error, {
            reportFailure: environment.updateAnnouncement,
            restore: environment.restoreCanonicalProject,
          });
        }
      }
    });
  }

  function createCallableFromPane(pendingSectionId: string, name: string) {
    queueCreatedCallable(pendingSectionId, name);
  }

  function createParameterDictionaryFromPane(
    pendingSectionId: string,
    name: string,
  ) {
    queueCreatedDictionary(pendingSectionId, name);
  }

  function createListFromPane(pendingSectionId: string, name: string) {
    queueCreatedList(pendingSectionId, name);
  }

  function queueCreatedCallable(pendingSectionId: string, name: string) {
    const current = requireCurrentSnapshot(environment);
    if (current === null) {
      throw new Error("Python Canvas cannot create a callable before loading.");
    }
    environment.updateCallableMutation(pendingSectionId, {
      description: "Creating the callable.",
      kind: "pending",
    });
    environment.registerPendingSection(pendingSectionId);
    environment.enqueue(async () => {
      const currentSnapshot = requireCurrentSnapshot(environment);
      if (currentSnapshot === null) {
        return;
      }
      const existing = new Set(
        currentSnapshot.callables.map((item) => item.id),
      );
      try {
        const next = await createCallable({
          expectedRevision: currentSnapshot.project.revision,
          name,
          projectId: currentSnapshot.project.id,
        });
        if (!environment.isActive()) {
          return;
        }
        environment.publishSnapshot(next);
        const created = next.callables.filter((item) => !existing.has(item.id));
        if (created.length !== 1 || created[0] === undefined) {
          environment.settlePendingSection(pendingSectionId);
          reportUnidentifiedCreatedSection(
            environment,
            pendingSectionId,
            "The created callable could not be identified. The latest project has been loaded.",
            environment.updateCallableMutation,
            next,
          );
          return;
        }
        environment.settlePendingSection(pendingSectionId);
        environment.acceptCanonicalSnapshot(
          next,
          { kind: "other" },
          null,
          new Map([[created[0].id, pendingSectionId]]),
        );
        environment.updateCallableMutation(pendingSectionId, { kind: "idle" });
      } catch (error) {
        environment.settlePendingSection(pendingSectionId);
        await reportCreateFailure(environment, "the callable", error, (next) =>
          environment.updateCallableMutation(pendingSectionId, next),
        );
      }
    });
  }

  function queueCreatedDictionary(pendingSectionId: string, name: string) {
    const current = requireCurrentSnapshot(environment);
    if (current === null) {
      throw new Error(
        "Python Canvas cannot create a Parameter Dictionary before loading.",
      );
    }
    environment.updateDictionaryMutation(pendingSectionId, {
      description: "Creating the Param Dict.",
      kind: "pending",
    });
    environment.registerPendingSection(pendingSectionId);
    environment.enqueue(async () => {
      const currentSnapshot = requireCurrentSnapshot(environment);
      if (currentSnapshot === null) {
        return;
      }
      const existing = new Set(
        currentSnapshot.parameterDictionaries.map((item) => item.id),
      );
      try {
        const next = await createParameterDictionary({
          expectedRevision: currentSnapshot.project.revision,
          name,
          projectId: currentSnapshot.project.id,
        });
        if (!environment.isActive()) {
          return;
        }
        environment.publishSnapshot(next);
        const created = next.parameterDictionaries.filter(
          (item) => !existing.has(item.id),
        );
        if (created.length !== 1 || created[0] === undefined) {
          environment.settlePendingSection(pendingSectionId);
          reportUnidentifiedCreatedSection(
            environment,
            pendingSectionId,
            "The created Param Dict could not be identified. The latest project has been loaded.",
            environment.updateDictionaryMutation,
            next,
          );
          return;
        }
        environment.settlePendingSection(pendingSectionId);
        environment.acceptCanonicalSnapshot(
          next,
          { kind: "other" },
          null,
          new Map([[created[0].id, pendingSectionId]]),
        );
        environment.updateDictionaryMutation(pendingSectionId, {
          kind: "idle",
        });
      } catch (error) {
        environment.settlePendingSection(pendingSectionId);
        await reportCreateFailure(
          environment,
          "the Param Dict",
          error,
          (next) =>
            environment.updateDictionaryMutation(pendingSectionId, next),
        );
      }
    });
  }

  function queueCreatedList(pendingSectionId: string, name: string) {
    const current = requireCurrentSnapshot(environment);
    if (current === null) {
      throw new Error(
        "Python Canvas cannot create a List of Objects before loading.",
      );
    }
    environment.updateListMutation(pendingSectionId, {
      description: "Creating the List of Objects.",
      kind: "pending",
    });
    environment.registerPendingSection(pendingSectionId);
    environment.enqueue(async () => {
      const currentSnapshot = requireCurrentSnapshot(environment);
      if (currentSnapshot === null) {
        return;
      }
      const existing = new Set(currentSnapshot.lists.map((item) => item.id));
      try {
        const next = await createList({
          expectedRevision: currentSnapshot.project.revision,
          name,
          projectId: currentSnapshot.project.id,
        });
        if (!environment.isActive()) {
          return;
        }
        environment.publishSnapshot(next);
        const created = next.lists.filter((item) => !existing.has(item.id));
        if (created.length !== 1 || created[0] === undefined) {
          environment.settlePendingSection(pendingSectionId);
          reportUnidentifiedCreatedSection(
            environment,
            pendingSectionId,
            "The created List of Objects could not be identified. The latest project has been loaded.",
            environment.updateListMutation,
            next,
          );
          return;
        }
        environment.settlePendingSection(pendingSectionId);
        environment.acceptCanonicalSnapshot(
          next,
          { kind: "other" },
          null,
          new Map([[created[0].id, pendingSectionId]]),
        );
        environment.updateListMutation(pendingSectionId, { kind: "idle" });
      } catch (error) {
        environment.settlePendingSection(pendingSectionId);
        await reportCreateFailure(
          environment,
          "the List of Objects",
          error,
          (next) => environment.updateListMutation(pendingSectionId, next),
        );
      }
    });
  }

  function queueCallableCommit(
    callableId: string,
    value: string,
    forceParameterRefresh: boolean,
  ) {
    const current = requireCurrentSnapshot(environment);
    if (
      current === null ||
      !current.callables.some((callable) => callable.id === callableId)
    ) {
      return;
    }
    cancelParameterMutation(callableId);
    environment.setCallableDraft(callableId, value);
    environment.clearCallableCompletionError(callableId);
    environment.setParameterAuthoringPending(callableId, true);
    environment.updateCallableMutation(callableId, {
      description: "Checking the callable with Basedpyright.",
      kind: "pending",
      parameterAuthoringPending: true,
    });
    environment.enqueue(async () => {
      const currentSnapshot = requireCurrentSnapshot(environment);
      if (currentSnapshot === null) {
        return;
      }
      const callable = currentSnapshot.callables.find(
        (candidate) => candidate.id === callableId,
      );
      if (callable === undefined) {
        environment.finishCallableMutation(callableId);
        return;
      }
      const committed = await environment.persistCallableExpression(
        callableId,
        value,
        currentSnapshot,
      );
      if (committed === null) {
        return;
      }
      if (
        !callableParameterRefreshRequired(
          callable,
          committed,
          forceParameterRefresh,
        )
      ) {
        environment.finishCallableMutation(callableId);
        return;
      }
      await environment.retrieveCallableParameters(callableId, committed);
    });
  }

  const controller: AppController = {
    commitCallable: (callableId, value) => {
      queueCallableCommit(callableId, value, false);
    },
    commitCallableAndRefreshParameters: (callableId, value) => {
      queueCallableCommit(callableId, value, true);
    },
    deleteCallable: (callableId) =>
      queueSectionDelete({
        context: environment,
        deleteRequest: deleteCallable,
        description: "Deleting the callable.",
        errorTarget: "the callable",
        id: callableId,
        requested: requestedCallableDeletes,
        update: environment.updateCallableMutation,
        beforeQueue: () => cancelParameterMutation(callableId),
      }),
    deleteDictionary: (dictionaryId) =>
      queueSectionDelete({
        context: environment,
        deleteRequest: deleteParameterDictionary,
        description: "Deleting the Param Dict.",
        errorTarget: "the Param Dict",
        id: dictionaryId,
        requested: requestedDictionaryDeletes,
        update: environment.updateDictionaryMutation,
        beforeQueue: () => cancelDictionaryMutation(dictionaryId),
      }),
    deleteList: (listId) =>
      queueSectionDelete({
        context: environment,
        deleteRequest: deleteList,
        description: "Deleting the List of Objects.",
        errorTarget: "the List of Objects",
        id: listId,
        requested: requestedListDeletes,
        update: environment.updateListMutation,
      }),
    renameCallable: (callableId, name) =>
      queueSectionRename({
        context: environment,
        description: "Renaming the callable.",
        errorTarget: "the callable",
        id: callableId,
        name,
        renameRequest: renameCallable,
        requested: requestedCallableRenames,
        update: environment.updateCallableMutation,
      }),
    renameDictionary: (dictionaryId, name) =>
      queueSectionRename({
        context: environment,
        description: "Renaming the Param Dict.",
        errorTarget: "the Param Dict",
        id: dictionaryId,
        name,
        renameRequest: renameParameterDictionary,
        requested: requestedDictionaryRenames,
        update: environment.updateDictionaryMutation,
      }),
    renameList: (listId, name) =>
      queueSectionRename({
        context: environment,
        description: "Renaming the List of Objects.",
        errorTarget: "the List of Objects",
        id: listId,
        name,
        renameRequest: renameList,
        requested: requestedListRenames,
        update: environment.updateListMutation,
      }),
    revertCallableDraft: (callableId) => {
      const current = requireCurrentSnapshot(environment);
      const callable = current?.callables.find(
        (candidate) => candidate.id === callableId,
      );
      if (callable !== undefined) {
        environment.setCallableDraft(callableId, callable.authoredExpression);
      }
      environment.clearCallableError(callableId);
    },
    setCallableDraft: (callableId, value) => {
      if (!environment.isActive()) {
        return;
      }
      environment.setCallableDraft(callableId, value);
      environment.clearCallableCompletionError(callableId);
      environment.clearCallableError(callableId);
    },
    setDictionaryEntryExpression: (dictionaryId, entryId, value) => {
      if (!hasDictionary(environment, dictionaryId)) {
        return;
      }
      environment.clearDictionaryError(dictionaryId);
      pendingDictionaryValueEdits.add(dictionaryId);
      setDictionaryEntryExpression(
        environment.host,
        dictionaryId,
        entryId,
        value,
      );
    },
    setDictionaryEntryName: (dictionaryId, entryId, name) => {
      if (!hasDictionary(environment, dictionaryId)) {
        return;
      }
      environment.clearDictionaryError(dictionaryId);
      setDictionaryEntryName(environment.host, dictionaryId, entryId, name);
    },
    setParameterExpression: (callableId, parameterId, value) => {
      if (!canEditParameters(environment, callableId)) {
        return;
      }
      environment.clearCallableError(callableId);
      setParameterItemExpression(
        environment.host,
        callableId,
        parameterId,
        value,
      );
    },
    setParameterName: (callableId, parameterId, name) => {
      if (!canEditParameters(environment, callableId)) {
        return;
      }
      environment.clearCallableError(callableId);
      setParameterItemName(environment.host, callableId, parameterId, name);
    },
    decrementListChildren: (listId, count) =>
      queueListChildMutation(
        environment,
        listId,
        count,
        "Removing list children.",
        decrementListChildren,
      ),
    incrementListChildren: (listId, count) =>
      queueListChildMutation(
        environment,
        listId,
        count,
        "Adding list children.",
        incrementListChildren,
      ),
  };

  return {
    cancelAllDictionaryMutations: () => cancelTimers(dictionaryTimers),
    cancelAllParameterMutations: () => cancelTimers(parameterTimers),
    cancelTargetMutation: pythonTargetMutations.cancel,
    consumeDictionaryValueEdits: () => {
      const edits = new Set(pendingDictionaryValueEdits);
      pendingDictionaryValueEdits.clear();
      return edits;
    },
    controller,
    createCallableFromPane,
    createListFromPane,
    createParameterDictionaryFromPane,
    queueForestMutation,
    runWithPythonTargetFlushed: pythonTargetMutations.runAfterFlush,
    scheduleDictionaryEntriesMutation,
    scheduleParameterListMutation,
    schedulePythonTargetMutation: pythonTargetMutations.schedule,
  };
}

function reportUnidentifiedCreatedSection(
  environment: PythonCanvasMutationEnvironment,
  pendingSectionId: string,
  message: string,
  update: (id: string, next: MutationState) => void,
  snapshot: ProjectSnapshotV2,
) {
  environment.acceptCanonicalSnapshot(snapshot, { kind: "other" });
  update(pendingSectionId, { kind: "error", message });
}

async function reportCreateFailure(
  environment: PythonCanvasMutationEnvironment,
  target: string,
  error: unknown,
  reportFailure: (next: MutationState) => void,
) {
  if (environment.isActive()) {
    await environment.handleMutationFailure(target, error, {
      reportFailure,
      restore: environment.restoreCanonicalProject,
    });
  }
}

function canEditParameters(
  environment: PythonCanvasMutationEnvironment,
  callableId: string,
) {
  return (
    environment.isActive() &&
    !environment.isParameterAuthoringPending(callableId)
  );
}

function hasDictionary(
  environment: PythonCanvasMutationEnvironment,
  dictionaryId: string,
) {
  return (
    environment.isActive() &&
    environment
      .currentSnapshot()
      ?.parameterDictionaries.some(
        (dictionary) => dictionary.id === dictionaryId,
      ) === true
  );
}

type SectionDeleteRequest = (
  id: string,
  request: { expectedRevision: number; projectId: string },
) => Promise<ProjectSnapshotV2>;

type SectionRenameRequest = (
  id: string,
  request: { expectedRevision: number; name: string; projectId: string },
) => Promise<ProjectSnapshotV2>;

function queueSectionDelete({
  beforeQueue,
  context,
  deleteRequest,
  description,
  errorTarget,
  id,
  requested,
  update,
}: {
  beforeQueue?: () => void;
  context: PythonCanvasMutationEnvironment;
  deleteRequest: SectionDeleteRequest;
  description: string;
  errorTarget: string;
  id: string;
  requested: Set<string>;
  update: (id: string, next: MutationState) => void;
}) {
  if (requested.has(id)) {
    return;
  }
  requested.add(id);
  beforeQueue?.();
  context.enqueue(async () => {
    try {
      const current = requireCurrentSnapshot(context);
      if (current === null) {
        return;
      }
      update(id, { description, kind: "pending" });
      const next = await deleteRequest(id, {
        expectedRevision: current.project.revision,
        projectId: current.project.id,
      });
      if (!context.isActive()) {
        return;
      }
      context.publishSnapshot(next);
      context.acceptCanonicalSnapshot(next, { kind: "other" });
      update(id, { kind: "idle" });
    } catch (error) {
      if (context.isActive()) {
        await context.handleMutationFailure(errorTarget, error, {
          reportFailure: (next) => update(id, next),
          restore: context.restoreCanonicalProject,
        });
      }
    } finally {
      requested.delete(id);
    }
  });
}

function queueSectionRename({
  context,
  description,
  errorTarget,
  id,
  name,
  renameRequest,
  requested,
  update,
}: {
  context: PythonCanvasMutationEnvironment;
  description: string;
  errorTarget: string;
  id: string;
  name: string;
  renameRequest: SectionRenameRequest;
  requested: Map<string, string>;
  update: (id: string, next: MutationState) => void;
}) {
  if (requested.get(id) === name) {
    return;
  }
  requested.set(id, name);
  context.enqueue(async () => {
    try {
      const current = requireCurrentSnapshot(context);
      if (current === null) {
        return;
      }
      update(id, { description, kind: "pending" });
      const next = await renameRequest(id, {
        expectedRevision: current.project.revision,
        name,
        projectId: current.project.id,
      });
      if (!context.isActive()) {
        return;
      }
      context.publishSnapshot(next);
      context.acceptCanonicalSnapshot(next, { kind: "other" });
      update(id, { kind: "idle" });
    } catch (error) {
      if (context.isActive()) {
        await context.handleMutationFailure(errorTarget, error, {
          reportFailure: (next) => update(id, next),
          restore: context.restoreCanonicalProject,
        });
      }
    } finally {
      if (requested.get(id) === name) {
        requested.delete(id);
      }
    }
  });
}

function queueListChildMutation(
  context: PythonCanvasMutationEnvironment,
  listId: string,
  count: number,
  description: string,
  request: (
    listId: string,
    request: { count: number; expectedRevision: number; projectId: string },
  ) => Promise<ProjectSnapshotV2>,
) {
  const snapshot = context.currentSnapshot();
  if (
    !context.isActive() ||
    snapshot === null ||
    count <= 0 ||
    !snapshot.lists.some((list) => list.id === listId)
  ) {
    return;
  }
  context.enqueue(async () => {
    const current = requireCurrentSnapshot(context);
    if (current === null) {
      return;
    }
    context.updateListMutation(listId, { description, kind: "pending" });
    try {
      const next = await request(listId, {
        count,
        expectedRevision: current.project.revision,
        projectId: current.project.id,
      });
      if (!context.isActive()) {
        return;
      }
      context.publishSnapshot(next);
      context.acceptCanonicalSnapshot(next, { kind: "other" });
      context.updateListMutation(listId, { kind: "idle" });
    } catch (error) {
      if (context.isActive()) {
        await context.handleMutationFailure("the list children", error, {
          reportFailure: (next) => context.updateListMutation(listId, next),
          restore: context.restoreCanonicalProject,
        });
      }
    }
  });
}
