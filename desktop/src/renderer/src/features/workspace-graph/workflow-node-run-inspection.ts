import type {
  ChatEvent,
  WorkflowEvent,
  WorkflowExecution,
  WorkflowNodeExecution,
} from "@generated/backend";
import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import type {
  WorkflowRunInspectionState,
  WorkflowRunTrajectoryActions,
} from "./workflow-node-details-components";
import {
  applyWorkflowNodeTrajectoryChatEvents,
  workflowNodeTrajectoryStateFromPage,
  workflowNodeTrajectoryWithLoadedOutput,
  workflowNodeTrajectoryWithOlderPage,
  workflowNodeTrajectoryWithOutputError,
  workflowNodeTrajectoryWithOutputLoading,
  type WorkflowNodeTrajectoryState,
} from "./workflow-node-agent-trajectory-adapter";
import {
  createChatStreamEventBatcher,
  isBufferedStreamEvent,
} from "../../stores/chat-store-stream-event-batcher";
import { workflowNodeExecutionForDetailsTarget } from "./workflow-node-details-helpers";

const workflowRunEventLimit = 80;
const workflowNodeTrajectoryTranscriptLimit = 80;
const workflowNodeTrajectoryItemLimit = 80;
const workflowNodeTrajectoryOutputLimit = 40;

type WorkflowRunSnapshotReloadReason = "action" | "resync";

interface WorkflowRunSnapshotReloadWaiter {
  reject: (error: unknown) => void;
  resolve: () => void;
}

export function useWorkflowRunInspection(target: WorkflowNodeDetailsTarget | null) {
  const [state, setState] = useState<WorkflowRunInspectionState>(() =>
    emptyWorkflowRunInspection(false),
  );
  const reloadCurrentInspectionRef = useRef<(() => Promise<void>) | null>(null);

  const loadRunInspection = useCallback(async (target: WorkflowNodeDetailsTarget) => {
    const initialExecution = await window.setta.workflow.readExecution(
      target.workspaceId,
      target.executionId,
    );
    const initialNodeExecution = workflowNodeExecutionForDetailsTarget(initialExecution, target);
    const [eventPage, initialTrajectory] = await Promise.all([
      window.setta.workflow.executionEvents(
        target.workspaceId,
        target.executionId,
        0,
        workflowRunEventLimit,
      ),
      loadWorkflowNodeTrajectory(target, initialNodeExecution),
    ]);
    const execution = await window.setta.workflow.readExecution(
      target.workspaceId,
      target.executionId,
    );
    const trajectoryResult = await workflowRunInspectionTrajectoryForFinalExecution(
      target,
      execution,
      initialTrajectory,
    );
    const lastWorkflowEventOrdinal = workflowInspectionEventOrdinal(eventPage.events);
    return {
      events: eventPage.events,
      execution,
      lastWorkflowEventOrdinal,
      loadError: "",
      loading: false,
      operation: null,
      trajectory:
        trajectoryResult.trajectory === null
          ? null
          : workflowNodeTrajectoryWithLocalWorkflowEventOrdinal(
              trajectoryResult.trajectory,
              lastWorkflowEventOrdinal,
            ),
      trajectoryError: trajectoryResult.trajectoryError,
    } satisfies WorkflowRunInspectionState;
  }, []);

  useEffect(() => {
    let disposed = false;
    let ready = false;
    let snapshotReloadInFlight = false;
    let snapshotReloadQueued = false;
    let executionRefreshInFlight = false;
    let executionRefreshQueued = false;
    let snapshotReloadWaiters: WorkflowRunSnapshotReloadWaiter[] = [];
    const bufferedChatEvents: ChatEvent[] = [];
    const bufferedWorkflowEvents: WorkflowEvent[] = [];
    const streamEventBatcher = createChatStreamEventBatcher((events) => {
      applyLiveChatEvents(events);
    });

    setState(emptyWorkflowRunInspection(target !== null && target.executionId !== ""));
    if (target === null || target.executionId === "") {
      return;
    }
    const runTarget = target;
    const reloadCurrentInspectionFromSnapshot = () => reloadFromSnapshot("action");
    reloadCurrentInspectionRef.current = reloadCurrentInspectionFromSnapshot;

    const unsubscribeChatEvents = window.setta.chat.onEvent((event) => {
      if (disposed) {
        return;
      }
      if (!ready) {
        bufferedChatEvents.push(event);
        return;
      }
      handleLiveChatEvent(event);
    });
    const unsubscribeWorkflowEvents = window.setta.workflow.onEvent((event) => {
      if (disposed) {
        return;
      }
      if (!ready) {
        bufferedWorkflowEvents.push(event);
        return;
      }
      handleLiveWorkflowEvent(event);
    });

    function reloadFromSnapshot(reason: WorkflowRunSnapshotReloadReason = "resync") {
      if (disposed) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        snapshotReloadWaiters.push({ reject, resolve });
        startSnapshotReload(reason);
      });
    }

    function startSnapshotReload(reason: WorkflowRunSnapshotReloadReason) {
      if (disposed) {
        resolveSnapshotReloadWaiters();
        return;
      }
      if (snapshotReloadInFlight) {
        snapshotReloadQueued = true;
        return;
      }
      snapshotReloadInFlight = true;
      beginSnapshotReloadBuffering(reason);
      void loadRunInspection(runTarget)
        .then((nextState) => {
          if (!disposed) {
            installSnapshotWithBufferedEvents(nextState);
          }
        })
        .catch((error: unknown) => {
          if (!disposed) {
            setState((previous) => ({
              ...previous,
              loadError: errorMessage(error),
              loading: false,
              operation: null,
            }));
          }
          rejectSnapshotReloadWaiters(error);
        })
        .finally(() => {
          snapshotReloadInFlight = false;
          if (snapshotReloadQueued && !disposed) {
            snapshotReloadQueued = false;
            startSnapshotReload("resync");
            return;
          }
          resolveSnapshotReloadWaiters();
        });
    }

    function beginSnapshotReloadBuffering(reason: WorkflowRunSnapshotReloadReason) {
      if (reason === "action") {
        streamEventBatcher.flush();
      } else {
        streamEventBatcher.clear();
      }
      ready = false;
      bufferedChatEvents.length = 0;
      bufferedWorkflowEvents.length = 0;
    }

    function resolveSnapshotReloadWaiters() {
      const waiters = snapshotReloadWaiters;
      snapshotReloadWaiters = [];
      for (const waiter of waiters) {
        waiter.resolve();
      }
    }

    function rejectSnapshotReloadWaiters(error: unknown) {
      const waiters = snapshotReloadWaiters;
      snapshotReloadWaiters = [];
      for (const waiter of waiters) {
        waiter.reject(error);
      }
    }

    function installSnapshotWithBufferedEvents(snapshot: WorkflowRunInspectionState) {
      let nextState = snapshot;
      const chatReplay = workflowRunInspectionWithChatEvents(nextState, bufferedChatEvents);
      nextState = chatReplay.state;
      let needsResync = chatReplay.resync;
      let needsExecutionRefresh = false;
      for (const event of bufferedWorkflowEvents) {
        const workflowReplay = workflowRunInspectionWithWorkflowEvent(nextState, runTarget, event);
        nextState = workflowReplay.state;
        needsResync = needsResync || workflowReplay.resync;
        needsExecutionRefresh = needsExecutionRefresh || workflowReplay.refreshExecution;
        if (needsResync) {
          break;
        }
      }
      bufferedChatEvents.length = 0;
      bufferedWorkflowEvents.length = 0;
      setState(nextState);
      ready = true;
      if (needsResync) {
        void reloadFromSnapshot();
      } else if (needsExecutionRefresh) {
        refreshExecution();
      }
    }

    function refreshExecution() {
      if (disposed || executionRefreshInFlight) {
        executionRefreshQueued = true;
        return;
      }
      executionRefreshInFlight = true;
      void window.setta.workflow
        .readExecution(runTarget.workspaceId, runTarget.executionId)
        .then((execution) => {
          if (!disposed) {
            setState((previous) =>
              workflowRunInspectionWithRefreshedExecution(previous, runTarget, execution),
            );
          }
        })
        .catch((error: unknown) => {
          if (!disposed) {
            setState((previous) => ({ ...previous, loadError: errorMessage(error) }));
          }
        })
        .finally(() => {
          executionRefreshInFlight = false;
          if (executionRefreshQueued) {
            executionRefreshQueued = false;
            refreshExecution();
          }
        });
    }

    function applyLiveChatEvents(events: ChatEvent[]) {
      let needsResync = false;
      setState((previous) => {
        const result = workflowRunInspectionWithChatEvents(previous, events);
        needsResync = result.resync;
        return result.state;
      });
      if (needsResync) {
        void reloadFromSnapshot();
      }
    }

    function handleLiveChatEvent(event: ChatEvent) {
      if (isBufferedStreamEvent(event)) {
        streamEventBatcher.queue(event);
        return;
      }
      streamEventBatcher.flush();
      applyLiveChatEvents([event]);
    }

    function handleLiveWorkflowEvent(event: WorkflowEvent) {
      streamEventBatcher.flush();
      let needsResync = false;
      let needsExecutionRefresh = false;
      setState((previous) => {
        const result = workflowRunInspectionWithWorkflowEvent(previous, runTarget, event);
        needsResync = result.resync;
        needsExecutionRefresh = result.refreshExecution;
        return result.state;
      });
      if (needsResync) {
        void reloadFromSnapshot();
        return;
      }
      if (needsExecutionRefresh) {
        refreshExecution();
      }
    }

    const runLoad = async () => {
      try {
        const nextState = await loadRunInspection(runTarget);
        if (!disposed) {
          installSnapshotWithBufferedEvents(nextState);
        }
      } catch (error: unknown) {
        if (!disposed) {
          setState({
            events: [],
            execution: null,
            lastWorkflowEventOrdinal: 0,
            loadError: errorMessage(error),
            loading: false,
            operation: null,
            trajectory: null,
            trajectoryError: "",
          });
        }
      }
    };

    void runLoad();
    return () => {
      disposed = true;
      if (reloadCurrentInspectionRef.current === reloadCurrentInspectionFromSnapshot) {
        reloadCurrentInspectionRef.current = null;
      }
      resolveSnapshotReloadWaiters();
      streamEventBatcher.clear();
      unsubscribeChatEvents();
      unsubscribeWorkflowEvents();
    };
  }, [loadRunInspection, target]);

  const reloadCurrentInspection = useCallback(async () => {
    await reloadCurrentInspectionRef.current?.();
  }, []);

  const loadOlder = useCallback(async () => {
    if (target === null || target.executionId === "") {
      return;
    }
    const current = state.trajectory;
    if (current === null || !current.page.hasMoreOlder) {
      return;
    }
    setState((previous) => ({ ...previous, operation: "loadingOlder" }));
    try {
      const page = await window.setta.workflow.readNodeTrajectory({
        afterItemId: "",
        beforeBlockOrdinal: current.page.olderBeforeBlockOrdinal,
        executionId: current.page.scope.executionId,
        itemLimit: workflowNodeTrajectoryItemLimit,
        nodeExecutionId: current.page.scope.nodeExecutionId,
        outputLimit: workflowNodeTrajectoryOutputLimit,
        transcriptLimit: workflowNodeTrajectoryTranscriptLimit,
        workspaceId: current.page.scope.workspaceId,
      });
      setState((previous) => ({
        ...previous,
        operation: null,
        trajectory:
          previous.trajectory === current
            ? workflowNodeTrajectoryWithLocalWorkflowEventOrdinal(
                workflowNodeTrajectoryWithOlderPage(current, page),
                previous.lastWorkflowEventOrdinal,
              )
            : previous.trajectory,
      }));
    } catch (error: unknown) {
      setState((previous) => ({
        ...previous,
        operation: null,
        trajectoryError: errorMessage(error),
      }));
    }
  }, [state.trajectory, target]);

  const loadRunItemOutput = useCallback<WorkflowRunTrajectoryActions["loadRunItemOutput"]>(
    async (runId, runItemId, afterOrdinal = 0, limit = 200) => {
      if (target === null || target.executionId === "" || runId === "" || runItemId === "") {
        return;
      }
      setState((previous) => ({
        ...previous,
        trajectory:
          previous.trajectory === null
            ? null
            : workflowNodeTrajectoryWithOutputLoading(previous.trajectory, runItemId),
      }));
      try {
        const page = await window.setta.chat.runItemOutput(
          target.workspaceId,
          runId,
          runItemId,
          afterOrdinal,
          limit,
        );
        setState((previous) => ({
          ...previous,
          trajectory:
            previous.trajectory === null
              ? null
              : workflowNodeTrajectoryWithLoadedOutput(previous.trajectory, page, afterOrdinal),
        }));
      } catch (error: unknown) {
        setState((previous) => ({
          ...previous,
          trajectory:
            previous.trajectory === null
              ? null
              : workflowNodeTrajectoryWithOutputError(
                  previous.trajectory,
                  runItemId,
                  errorMessage(error),
                ),
        }));
      }
    },
    [target],
  );

  const submitApproval = useCallback<WorkflowRunTrajectoryActions["submitApproval"]>(
    async (approvalId, approved, response, answers, cancelled) => {
      const current = state.trajectory;
      if (current === null) {
        return;
      }
      setState((previous) => ({ ...previous, operation: "approving" }));
      try {
        await window.setta.workflow.submitApproval({
          answers,
          approvalId,
          approved,
          cancelled,
          executionId: current.page.scope.executionId,
          nodeExecutionId: current.page.scope.nodeExecutionId,
          response,
          workspaceId: current.page.scope.workspaceId,
        });
        await reloadCurrentInspection();
      } catch (error: unknown) {
        setState((previous) => ({
          ...previous,
          loadError: errorMessage(error),
          operation: null,
        }));
      }
    },
    [reloadCurrentInspection, state.trajectory],
  );

  const steerMessage = useCallback<WorkflowRunTrajectoryActions["steerMessage"]>(
    async (input) => {
      const current = state.trajectory;
      if (current === null) {
        return null;
      }
      setState((previous) => ({ ...previous, operation: "steering" }));
      try {
        const result = await window.setta.workflow.steerNodeRun({
          executionId: current.page.scope.executionId,
          input,
          nodeExecutionId: current.page.scope.nodeExecutionId,
          workspaceId: current.page.scope.workspaceId,
        });
        await reloadCurrentInspection();
        return result;
      } catch (error: unknown) {
        setState((previous) => ({
          ...previous,
          loadError: errorMessage(error),
          operation: null,
        }));
        return null;
      }
    },
    [reloadCurrentInspection, state.trajectory],
  );

  const retryLiveness = useCallback<WorkflowRunTrajectoryActions["retryLiveness"]>(async () => {
    const current = state.trajectory;
    if (current === null) {
      return;
    }
    setState((previous) => ({ ...previous, operation: "refreshing" }));
    try {
      await window.setta.workflow.retryNodeRunLiveness({
        executionId: current.page.scope.executionId,
        nodeExecutionId: current.page.scope.nodeExecutionId,
        workspaceId: current.page.scope.workspaceId,
      });
      await reloadCurrentInspection();
    } catch (error: unknown) {
      setState((previous) => ({
        ...previous,
        loadError: errorMessage(error),
        operation: null,
      }));
    }
  }, [reloadCurrentInspection, state.trajectory]);

  const stopRun = useCallback<WorkflowRunTrajectoryActions["stopRun"]>(async () => {
    const current = state.trajectory;
    if (current === null) {
      return;
    }
    setState((previous) => ({ ...previous, operation: "cancelling" }));
    try {
      await window.setta.workflow.stopNodeRun({
        executionId: current.page.scope.executionId,
        nodeExecutionId: current.page.scope.nodeExecutionId,
        workspaceId: current.page.scope.workspaceId,
      });
      await reloadCurrentInspection();
    } catch (error: unknown) {
      setState((previous) => ({
        ...previous,
        loadError: errorMessage(error),
        operation: null,
      }));
    }
  }, [reloadCurrentInspection, state.trajectory]);

  return {
    actions: {
      loadOlder,
      loadRunItemOutput,
      retryLiveness,
      steerMessage,
      stopRun,
      submitApproval,
    },
    state,
  };
}

function emptyWorkflowRunInspection(loading: boolean): WorkflowRunInspectionState {
  return {
    events: [],
    execution: null,
    lastWorkflowEventOrdinal: 0,
    loadError: "",
    loading,
    operation: null,
    trajectory: null,
    trajectoryError: "",
  };
}

async function workflowRunInspectionTrajectoryForFinalExecution(
  target: WorkflowNodeDetailsTarget,
  execution: WorkflowExecution,
  initial: Awaited<ReturnType<typeof loadWorkflowNodeTrajectory>>,
) {
  if (initial.trajectory !== null || initial.trajectoryError !== "") {
    return initial;
  }
  return loadWorkflowNodeTrajectory(
    target,
    workflowNodeExecutionForDetailsTarget(execution, target),
  );
}

async function loadWorkflowNodeTrajectory(
  target: WorkflowNodeDetailsTarget,
  nodeExecution: WorkflowNodeExecution | null,
) {
  if (!workflowNodeExecutionHasAgentTrajectory(nodeExecution)) {
    return { trajectory: null, trajectoryError: "" };
  }
  try {
    const page = await window.setta.workflow.readNodeTrajectory({
      afterItemId: "",
      beforeBlockOrdinal: 0,
      executionId: target.executionId,
      itemLimit: workflowNodeTrajectoryItemLimit,
      nodeExecutionId: nodeExecution.id,
      outputLimit: workflowNodeTrajectoryOutputLimit,
      transcriptLimit: workflowNodeTrajectoryTranscriptLimit,
      workspaceId: target.workspaceId,
    });
    return { trajectory: workflowNodeTrajectoryStateFromPage(page), trajectoryError: "" };
  } catch (error: unknown) {
    return { trajectory: null, trajectoryError: errorMessage(error) };
  }
}

function workflowInspectionEventOrdinal(events: WorkflowEvent[]) {
  return events.reduce((ordinal, event) => Math.max(ordinal, event.ordinal), 0);
}

function workflowNodeTrajectoryWithLocalWorkflowEventOrdinal(
  trajectory: WorkflowNodeTrajectoryState,
  ordinal: number,
): WorkflowNodeTrajectoryState {
  return {
    ...trajectory,
    page: {
      ...trajectory.page,
      lastWorkflowEventOrdinal: ordinal,
    },
  };
}

interface WorkflowRunInspectionChatEventResult {
  resync: boolean;
  state: WorkflowRunInspectionState;
}

interface WorkflowRunInspectionWorkflowEventResult {
  refreshExecution: boolean;
  resync: boolean;
  state: WorkflowRunInspectionState;
}

const workflowExecutionRefreshEventTypes = new Set<WorkflowEvent["type"]>([
  "workflow.execution.started",
  "workflow.node.scheduled",
  "workflow.action.started",
  "workflow.action.completed",
  "workflow.action.failed",
  "workflow.action.cancelled",
  "workflow.action.waiting_approval",
  "workflow.gateway.resolved",
  "workflow.loop.advanced",
  "workflow.execution.completed",
  "workflow.execution.failed",
  "workflow.execution.stopped",
  "workflow.execution.cancelled",
  "workflow.runner_refs.attached",
  "workflow.action.recovered",
  "workflow.action.recovery_required",
  "runner.attempt.started",
  "runner.approval.requested",
  "runner.approval.resolved",
  "runner.attempt.completed",
  "runner.attempt.failed",
  "runner.attempt.cancelled",
  "runner.attempt.recovery_required",
]);

function workflowRunInspectionWithChatEvents(
  inspection: WorkflowRunInspectionState,
  events: ChatEvent[],
): WorkflowRunInspectionChatEventResult {
  if (inspection.trajectory === null || events.length === 0) {
    return { resync: false, state: inspection };
  }
  const result = applyWorkflowNodeTrajectoryChatEvents(inspection.trajectory, events);
  return {
    resync: result.resync,
    state:
      result.state === inspection.trajectory
        ? inspection
        : { ...inspection, trajectory: result.state },
  };
}

export function workflowRunInspectionWithWorkflowEvent(
  inspection: WorkflowRunInspectionState,
  target: WorkflowNodeDetailsTarget,
  event: WorkflowEvent,
): WorkflowRunInspectionWorkflowEventResult {
  if (!workflowEventMatchesRunDetailsTarget(target, event)) {
    return { refreshExecution: false, resync: false, state: inspection };
  }
  const cursor = workflowEventCursorStatus(inspection, event);
  if (cursor === "duplicate") {
    return { refreshExecution: false, resync: false, state: inspection };
  }
  if (cursor === "gap") {
    return { refreshExecution: false, resync: true, state: inspection };
  }

  const nodeMatched = workflowEventMatchesNodeDetailsTarget(inspection, target, event);
  const stateWithCursor = workflowRunInspectionWithWorkflowCursor(inspection, event.ordinal);
  const stateWithEvent = nodeMatched
    ? {
        ...stateWithCursor,
        events: appendWorkflowInspectionEvent(stateWithCursor.events, event),
      }
    : stateWithCursor;
  return {
    refreshExecution: workflowEventRefreshesRunInspection(event, nodeMatched),
    resync: nodeMatched && event.type === "workflow.runner_refs.attached",
    state: stateWithEvent,
  };
}

export function workflowRunInspectionWithRefreshedExecution(
  inspection: WorkflowRunInspectionState,
  target: WorkflowNodeDetailsTarget,
  execution: WorkflowExecution,
): WorkflowRunInspectionState {
  if (inspection.trajectory === null) {
    return { ...inspection, execution };
  }
  return {
    ...inspection,
    execution,
    trajectory: workflowNodeTrajectoryWithWorkflowExecution(
      inspection.trajectory,
      target,
      execution,
    ),
  };
}

function workflowNodeTrajectoryWithWorkflowExecution(
  trajectory: WorkflowNodeTrajectoryState,
  target: WorkflowNodeDetailsTarget,
  execution: WorkflowExecution,
): WorkflowNodeTrajectoryState {
  const nodeExecution = workflowNodeExecutionForDetailsTarget(execution, target);
  const pendingApproval = nodeExecution?.result?.pendingApproval ?? null;
  return {
    ...trajectory,
    page: {
      ...trajectory.page,
      capabilities: {
        ...trajectory.page.capabilities,
        canSubmitApproval: pendingApproval !== null,
      },
      pendingApproval,
    },
  };
}

function workflowRunInspectionWithWorkflowCursor(
  inspection: WorkflowRunInspectionState,
  ordinal: number,
): WorkflowRunInspectionState {
  return {
    ...inspection,
    lastWorkflowEventOrdinal: Math.max(inspection.lastWorkflowEventOrdinal, ordinal),
    execution:
      inspection.execution === null || ordinal <= inspection.execution.lastEventOrdinal
        ? inspection.execution
        : { ...inspection.execution, lastEventOrdinal: ordinal },
    trajectory:
      inspection.trajectory === null
        ? null
        : workflowNodeTrajectoryWithLocalWorkflowEventOrdinal(
            inspection.trajectory,
            Math.max(inspection.lastWorkflowEventOrdinal, ordinal),
          ),
  };
}

function workflowEventCursorStatus(
  inspection: WorkflowRunInspectionState,
  event: WorkflowEvent,
): "current" | "duplicate" | "gap" {
  const cursor = workflowInspectionWorkflowEventOrdinal(inspection);
  if (event.ordinal <= cursor) {
    return "duplicate";
  }
  if (cursor > 0 && event.ordinal !== cursor + 1) {
    return "gap";
  }
  return "current";
}

function workflowInspectionWorkflowEventOrdinal(inspection: WorkflowRunInspectionState) {
  return inspection.lastWorkflowEventOrdinal;
}

function workflowEventMatchesRunDetailsTarget(
  target: WorkflowNodeDetailsTarget,
  event: WorkflowEvent,
) {
  return event.workspaceId === target.workspaceId && event.executionId === target.executionId;
}

function workflowEventMatchesNodeDetailsTarget(
  inspection: WorkflowRunInspectionState,
  target: WorkflowNodeDetailsTarget,
  event: WorkflowEvent,
) {
  const nodeExecutionId =
    inspection.trajectory?.page.scope.nodeExecutionId ??
    (inspection.execution === null
      ? null
      : workflowNodeExecutionForDetailsTarget(inspection.execution, target)?.id) ??
    target.nodeExecutionId;
  if (event.nodeExecutionId !== "") {
    return event.nodeExecutionId === nodeExecutionId;
  }
  return event.nodeId !== "" && event.nodeId === target.nodeId;
}

function workflowEventRefreshesRunInspection(event: WorkflowEvent, nodeMatched: boolean) {
  const executionLevel = event.nodeId === "" && event.nodeExecutionId === "";
  return (nodeMatched || executionLevel) && workflowExecutionRefreshEventTypes.has(event.type);
}

function appendWorkflowInspectionEvent(events: WorkflowEvent[], event: WorkflowEvent) {
  if (events.some((candidate) => candidate.id === event.id)) {
    return events;
  }
  return [...events, event]
    .toSorted((left, right) => left.ordinal - right.ordinal)
    .slice(-workflowRunEventLimit);
}

function workflowNodeExecutionHasAgentTrajectory(
  nodeExecution: WorkflowNodeExecution | null,
): nodeExecution is WorkflowNodeExecution {
  return (
    nodeExecution !== null &&
    (nodeExecution.runnerKind === "agent.codex" || nodeExecution.actionKind === "agent.codex")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workflow node operation failed";
}
