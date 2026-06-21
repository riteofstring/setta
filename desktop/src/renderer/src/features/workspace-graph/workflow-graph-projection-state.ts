import type { WorkflowEvent, WorkflowGraphProjection } from "@generated/backend";
import { type MutableRefObject, useCallback, useEffect, useReducer, useRef } from "react";

import {
  workflowDefinitionChangedDetail,
  workflowDefinitionChangedEventName,
} from "../../stores/workflow-definition-invalidation";
import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import type { WorkflowGraphUpdateSource } from "./pixi-renderer";

export type WorkflowGraphTarget =
  | { kind: "draft"; definitionId: string; workspaceId: string }
  | {
      kind: "run";
      definitionId: string;
      executionId: string;
      versionId: string;
      workspaceId: string;
    };

type WorkflowProjectionTarget =
  | WorkflowGraphTarget
  | { kind: "empty"; workspaceId: string }
  | { kind: "version"; definitionId: string; versionId: string; workspaceId: string };

type WorkflowProjectionState =
  | {
      error: "";
      projection: null;
      status: "loading";
      target: WorkflowProjectionTarget;
      updateSource: WorkflowGraphUpdateSource | null;
    }
  | {
      error: "";
      projection: WorkflowGraphProjection | null;
      status: "ready";
      target: WorkflowProjectionTarget;
      updateSource: WorkflowGraphUpdateSource | null;
    }
  | {
      error: string;
      projection: null;
      status: "error";
      target: WorkflowProjectionTarget;
      updateSource: WorkflowGraphUpdateSource | null;
    };

type WorkflowProjectionAction =
  | {
      target: WorkflowProjectionTarget;
      type: "loading";
    }
  | {
      expectedTarget: WorkflowProjectionTarget;
      projection: WorkflowGraphProjection | null;
      target: WorkflowProjectionTarget;
      type: "ready";
      updateSource: WorkflowGraphUpdateSource;
    }
  | {
      error: string;
      expectedTarget: WorkflowProjectionTarget;
      target: WorkflowProjectionTarget;
      type: "failed";
      updateSource?: WorkflowGraphUpdateSource;
    }
  | {
      projection: WorkflowGraphProjection | null;
      target: WorkflowProjectionTarget;
      type: "replace";
      updateSource: WorkflowGraphUpdateSource;
    };

const emptyWorkflowProjectionTarget: WorkflowProjectionTarget = {
  kind: "empty",
  workspaceId: "",
};

const initialWorkflowProjectionState: WorkflowProjectionState = {
  error: "",
  projection: null,
  status: "loading",
  target: emptyWorkflowProjectionTarget,
  updateSource: null,
};

export function useWorkflowProjectionState({
  selectedDefinitionIdsByWorkspaceId,
}: {
  selectedDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
}) {
  const [state, dispatchBase] = useReducer(
    workflowProjectionReducer,
    initialWorkflowProjectionState,
  );
  const stateRef = useRef(state);
  const dispatch = useCallback((action: WorkflowProjectionAction) => {
    stateRef.current = workflowProjectionReducer(stateRef.current, action);
    dispatchBase(action);
  }, []);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useWorkflowProjection({
    dispatchWorkflowProjectionState: dispatch,
    projectionStateRef: stateRef,
    selectedDefinitionIdsByWorkspaceId,
  });

  const replaceWorkflowProjection = useCallback(
    (
      projection: WorkflowGraphProjection | null,
      updateSource: WorkflowGraphUpdateSource = "draft-validation-local",
    ) => {
      dispatch({
        projection,
        target:
          projection === null ? stateRef.current.target : workflowProjectionTarget(projection),
        type: "replace",
        updateSource,
      });
    },
    [dispatch],
  );
  const loadWorkflowGraphTarget = useCallback(
    async (
      target: WorkflowGraphTarget,
      updateSource: WorkflowGraphUpdateSource = "workflow-projection",
    ) => {
      dispatch({
        target,
        type: "loading",
      });
      try {
        const response = await readWorkflowGraphProjectionForTarget(target);
        dispatch({
          expectedTarget: target,
          projection: response.projection,
          target,
          type: "ready",
          updateSource,
        });
      } catch (error: unknown) {
        dispatch({
          error: workflowProjectionErrorMessage(error),
          expectedTarget: target,
          target,
          type: "failed",
          updateSource,
        });
        throw error;
      }
    },
    [dispatch],
  );

  const ready = state.status === "ready";
  return {
    error: state.status === "error" ? state.error : "",
    graphTarget: workflowGraphTargetOrNull(state.target),
    loadWorkflowGraphTarget,
    loading: state.status === "loading",
    noWorkspace: ready && workflowProjectionTargetWorkspaceId(state.target) === "",
    projection: ready ? state.projection : null,
    ready,
    replaceWorkflowProjection,
    state,
    stateRef,
    updateSource: state.updateSource,
    workspaceId: workflowProjectionTargetWorkspaceId(state.target),
  };
}

function workflowProjectionReducer(
  state: WorkflowProjectionState,
  action: WorkflowProjectionAction,
): WorkflowProjectionState {
  switch (action.type) {
    case "loading":
      return {
        error: "",
        projection: null,
        status: "loading",
        target: action.target,
        updateSource: null,
      };
    case "ready":
      if (!workflowProjectionTargetsEqual(state.target, action.expectedTarget)) {
        return state;
      }
      return {
        error: "",
        projection: action.projection,
        status: "ready",
        target: action.target,
        updateSource: action.updateSource,
      };
    case "failed":
      if (!workflowProjectionTargetsEqual(state.target, action.expectedTarget)) {
        return state;
      }
      return {
        error: action.error,
        projection: null,
        status: "error",
        target: action.target,
        updateSource: action.updateSource ?? state.updateSource,
      };
    case "replace":
      return {
        error: "",
        projection: action.projection,
        status: "ready",
        target: action.target,
        updateSource: action.updateSource,
      };
    default:
      return assertNever(action);
  }
}

function workflowProjectionTargetsEqual(
  left: WorkflowProjectionTarget,
  right: WorkflowProjectionTarget,
) {
  return workflowProjectionTargetKey(left) === workflowProjectionTargetKey(right);
}

function workflowProjectionTargetKey(target: WorkflowProjectionTarget) {
  switch (target.kind) {
    case "empty":
      return `${target.kind}:${target.workspaceId}`;
    case "draft":
      return `${target.kind}:${target.workspaceId}:${target.definitionId}`;
    case "run":
      return `${target.kind}:${target.workspaceId}:${target.definitionId}:${target.versionId}:${target.executionId}`;
    case "version":
      return `${target.kind}:${target.workspaceId}:${target.definitionId}:${target.versionId}`;
    default:
      return assertNever(target);
  }
}

function workflowProjectionTargetForWorkspace(workspaceId: string): WorkflowProjectionTarget {
  return {
    kind: "empty",
    workspaceId,
  };
}

export function workflowGraphDraftTarget(
  workspaceId: string,
  definitionId: string,
): WorkflowGraphTarget {
  return {
    definitionId,
    kind: "draft",
    workspaceId,
  };
}

export function workflowGraphRunTarget({
  definitionId,
  executionId,
  versionId,
  workspaceId,
}: {
  definitionId: string;
  executionId: string;
  versionId: string;
  workspaceId: string;
}): WorkflowGraphTarget {
  return {
    definitionId,
    executionId,
    kind: "run",
    versionId,
    workspaceId,
  };
}

function workflowProjectionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Workflow graph projection failed";
}

interface WorkflowProjectionLoader {
  dispatchWorkflowProjectionState: (action: WorkflowProjectionAction) => void;
  projectionStateRef: MutableRefObject<WorkflowProjectionState>;
  selectedDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
}

function useWorkflowProjection({
  dispatchWorkflowProjectionState,
  projectionStateRef,
  selectedDefinitionIdsByWorkspaceId,
}: WorkflowProjectionLoader) {
  useEffect(() => {
    let disposed = false;

    const dispatchIfMounted = (action: WorkflowProjectionAction) => {
      if (disposed) {
        return;
      }
      dispatchWorkflowProjectionState(action);
    };

    const loadWorkspaceProjection = async () => {
      dispatchIfMounted({
        target: emptyWorkflowProjectionTarget,
        type: "loading",
      });
      const session = await window.setta.workspace.session();
      if (session.selectedWorkspaceId === "") {
        dispatchIfMounted({
          expectedTarget: emptyWorkflowProjectionTarget,
          projection: null,
          target: emptyWorkflowProjectionTarget,
          type: "ready",
          updateSource: "workflow-projection",
        });
        return;
      }
      const workspaceTarget = workflowProjectionTargetForWorkspace(session.selectedWorkspaceId);
      dispatchIfMounted({
        target: workspaceTarget,
        type: "loading",
      });
      await useWorkflowDefinitionStore
        .getState()
        .ensureWorkspaceWorkflowDefinitions(session.selectedWorkspaceId);
      const definitionId =
        useWorkflowDefinitionStore.getState().selectedDefinitionIdsByWorkspaceId[
          session.selectedWorkspaceId
        ] ?? "";
      if (definitionId === "") {
        dispatchIfMounted({
          expectedTarget: workspaceTarget,
          projection: null,
          target: workspaceTarget,
          type: "ready",
          updateSource: "workflow-projection",
        });
        return;
      }
      const definitionTarget = {
        definitionId,
        kind: "draft" as const,
        workspaceId: session.selectedWorkspaceId,
      };
      dispatchIfMounted({
        target: definitionTarget,
        type: "loading",
      });
      const response = await window.setta.workflow.graphProjection(
        session.selectedWorkspaceId,
        definitionId,
      );
      dispatchIfMounted({
        expectedTarget: definitionTarget,
        projection: response.projection,
        target: definitionTarget,
        type: "ready",
        updateSource: "workflow-projection",
      });
    };

    const loadEventProjection = async (event: WorkflowEvent) => {
      const current = projectionStateRef.current.target;
      if (!workflowEventRefreshesProjectionTarget(current, event)) {
        return;
      }
      dispatchIfMounted({
        target: current,
        type: "loading",
      });
      const response = await readWorkflowGraphProjectionForTarget(current);
      dispatchIfMounted({
        expectedTarget: current,
        projection: response.projection,
        target: current,
        type: "ready",
        updateSource: "workflow-projection",
      });
    };

    const loadDefinitionChangeProjection = async (event: Event) => {
      const detail = workflowDefinitionChangedDetail(event);
      if (detail === null) {
        return;
      }
      const current = projectionStateRef.current.target;
      if (
        current.kind !== "draft" ||
        current.workspaceId !== detail.workspaceId ||
        current.definitionId !== detail.definitionId
      ) {
        return;
      }
      const response = await window.setta.workflow.graphProjection(
        current.workspaceId,
        current.definitionId,
      );
      dispatchIfMounted({
        expectedTarget: current,
        projection: response.projection,
        target: current,
        type: "ready",
        updateSource: "workflow-projection",
      });
    };

    void loadWorkspaceProjection().catch((error: unknown) => {
      console.error("Failed to load workflow graph projection", error);
      dispatchIfMounted({
        error: workflowProjectionErrorMessage(error),
        expectedTarget: projectionStateRef.current.target,
        target: projectionStateRef.current.target,
        type: "failed",
        updateSource: "workflow-projection",
      });
    });
    const unsubscribe = window.setta.workflow.onEvent((event) => {
      void loadEventProjection(event).catch((error: unknown) => {
        console.error("Failed to refresh workflow graph projection", error);
        dispatchIfMounted({
          error: workflowProjectionErrorMessage(error),
          expectedTarget: projectionStateRef.current.target,
          target: projectionStateRef.current.target,
          type: "failed",
          updateSource: "workflow-projection",
        });
      });
    });
    const workflowDefinitionChanged = (event: Event) => {
      void loadDefinitionChangeProjection(event).catch((error: unknown) => {
        console.error("Failed to refresh workflow definition graph projection", error);
        dispatchIfMounted({
          error: workflowProjectionErrorMessage(error),
          expectedTarget: projectionStateRef.current.target,
          target: projectionStateRef.current.target,
          type: "failed",
          updateSource: "workflow-projection",
        });
      });
    };
    window.addEventListener(workflowDefinitionChangedEventName, workflowDefinitionChanged);

    return () => {
      disposed = true;
      window.removeEventListener(workflowDefinitionChangedEventName, workflowDefinitionChanged);
      unsubscribe();
    };
  }, [selectedDefinitionIdsByWorkspaceId, dispatchWorkflowProjectionState, projectionStateRef]);
}

function workflowProjectionTarget(projection: WorkflowGraphProjection): WorkflowProjectionTarget {
  if (projection.viewMode === "draft") {
    return workflowGraphDraftTarget(projection.workspaceId, projection.definitionId);
  }
  if (projection.viewMode === "run" && projection.executionId !== "") {
    return workflowGraphRunTarget({
      definitionId: projection.definitionId,
      executionId: projection.executionId,
      versionId: projection.definitionVersionId,
      workspaceId: projection.workspaceId,
    });
  }
  return {
    definitionId: projection.definitionId,
    kind: "version",
    versionId: projection.definitionVersionId,
    workspaceId: projection.workspaceId,
  };
}

export function workflowEventMatchesProjectionTarget(
  current: WorkflowProjectionTarget,
  event: WorkflowEvent,
) {
  if (
    current.kind === "empty" ||
    current.workspaceId === "" ||
    current.workspaceId !== event.workspaceId ||
    current.definitionId !== event.definitionId
  ) {
    return false;
  }
  switch (current.kind) {
    case "draft":
      return true;
    case "run":
      return current.executionId === event.executionId;
    case "version":
      return current.versionId === event.definitionVersionId;
    default:
      return assertNever(current);
  }
}

export function workflowEventRefreshesProjectionTarget(
  current: WorkflowProjectionTarget,
  event: WorkflowEvent,
) {
  return current.kind === "run" && workflowEventMatchesProjectionTarget(current, event);
}

function workflowGraphTargetOrNull(target: WorkflowProjectionTarget): WorkflowGraphTarget | null {
  switch (target.kind) {
    case "draft":
    case "run":
      return target;
    case "empty":
    case "version":
      return null;
    default:
      return assertNever(target);
  }
}

function workflowProjectionTargetWorkspaceId(target: WorkflowProjectionTarget) {
  return target.workspaceId;
}

async function readWorkflowGraphProjectionForTarget(target: WorkflowProjectionTarget) {
  switch (target.kind) {
    case "draft":
      return window.setta.workflow.graphProjection(target.workspaceId, target.definitionId);
    case "run":
      return window.setta.workflow.graphProjection(
        target.workspaceId,
        target.definitionId,
        target.versionId,
        target.executionId,
      );
    case "version":
      return window.setta.workflow.graphProjection(
        target.workspaceId,
        target.definitionId,
        target.versionId,
      );
    case "empty":
      return window.setta.workflow.graphProjection(target.workspaceId);
    default:
      return assertNever(target);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workflow projection action ${String(value)}`);
}
