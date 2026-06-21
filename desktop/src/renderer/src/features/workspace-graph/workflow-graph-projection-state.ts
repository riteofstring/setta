import type { WorkflowEvent, WorkflowGraphProjection } from "@generated/backend";
import { type MutableRefObject, useCallback, useEffect, useReducer, useRef } from "react";

import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";

interface WorkflowProjectionTarget {
  definitionId: string;
  executionId: string;
  versionId: string;
  workspaceId: string;
}

type WorkflowProjectionState =
  | {
      error: "";
      projection: null;
      status: "loading";
      target: WorkflowProjectionTarget;
    }
  | {
      error: "";
      projection: WorkflowGraphProjection | null;
      status: "ready";
      target: WorkflowProjectionTarget;
    }
  | {
      error: string;
      projection: null;
      status: "error";
      target: WorkflowProjectionTarget;
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
    }
  | {
      error: string;
      expectedTarget: WorkflowProjectionTarget;
      target: WorkflowProjectionTarget;
      type: "failed";
    }
  | {
      projection: WorkflowGraphProjection | null;
      target: WorkflowProjectionTarget;
      type: "replace";
    };

const emptyWorkflowProjectionTarget: WorkflowProjectionTarget = {
  definitionId: "",
  executionId: "",
  versionId: "",
  workspaceId: "",
};

const initialWorkflowProjectionState: WorkflowProjectionState = {
  error: "",
  projection: null,
  status: "loading",
  target: emptyWorkflowProjectionTarget,
};

export function useWorkflowProjectionState({
  definitionChangeSequence,
  selectedDefinitionIdsByWorkspaceId,
}: {
  definitionChangeSequence: number;
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
    definitionChangeSequence,
    dispatchWorkflowProjectionState: dispatch,
    projectionStateRef: stateRef,
    selectedDefinitionIdsByWorkspaceId,
  });

  const replaceWorkflowProjection = useCallback(
    (projection: WorkflowGraphProjection | null) => {
      dispatch({
        projection,
        target:
          projection === null ? stateRef.current.target : workflowProjectionTarget(projection),
        type: "replace",
      });
    },
    [dispatch],
  );

  const ready = state.status === "ready";
  return {
    error: state.status === "error" ? state.error : "",
    loading: state.status === "loading",
    noWorkspace: ready && state.target.workspaceId === "",
    projection: ready ? state.projection : null,
    ready,
    replaceWorkflowProjection,
    state,
    stateRef,
    workspaceId: state.target.workspaceId,
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
      };
    case "replace":
      return {
        error: "",
        projection: action.projection,
        status: "ready",
        target: action.target,
      };
    default:
      return assertNever(action);
  }
}

function workflowProjectionTargetsEqual(
  left: WorkflowProjectionTarget,
  right: WorkflowProjectionTarget,
) {
  return (
    left.workspaceId === right.workspaceId &&
    left.definitionId === right.definitionId &&
    left.versionId === right.versionId &&
    left.executionId === right.executionId
  );
}

function workflowProjectionTargetForWorkspace(workspaceId: string): WorkflowProjectionTarget {
  return {
    definitionId: "",
    executionId: "",
    versionId: "",
    workspaceId,
  };
}

function workflowProjectionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Workflow graph projection failed";
}

interface WorkflowProjectionLoader {
  definitionChangeSequence: number;
  dispatchWorkflowProjectionState: (action: WorkflowProjectionAction) => void;
  projectionStateRef: MutableRefObject<WorkflowProjectionState>;
  selectedDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
}

function useWorkflowProjection({
  definitionChangeSequence,
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
        });
        return;
      }
      const definitionTarget = {
        ...workspaceTarget,
        definitionId,
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
        target: response.projection
          ? workflowProjectionTarget(response.projection)
          : definitionTarget,
        type: "ready",
      });
    };

    const loadEventProjection = async (event: WorkflowEvent) => {
      const current = projectionStateRef.current.target;
      if (
        current.workspaceId === "" ||
        current.workspaceId !== event.workspaceId ||
        current.executionId === "" ||
        current.executionId !== event.executionId
      ) {
        return;
      }
      const eventTarget = {
        definitionId: event.definitionId,
        executionId: event.executionId,
        versionId: event.definitionVersionId,
        workspaceId: event.workspaceId,
      };
      dispatchIfMounted({
        target: eventTarget,
        type: "loading",
      });
      const response = await window.setta.workflow.graphProjection(
        event.workspaceId,
        event.definitionId,
        event.definitionVersionId,
        event.executionId,
      );
      dispatchIfMounted({
        expectedTarget: eventTarget,
        projection: response.projection,
        target: response.projection ? workflowProjectionTarget(response.projection) : eventTarget,
        type: "ready",
      });
    };

    void loadWorkspaceProjection().catch((error: unknown) => {
      console.error("Failed to load workflow graph projection", error);
      dispatchIfMounted({
        error: workflowProjectionErrorMessage(error),
        expectedTarget: projectionStateRef.current.target,
        target: projectionStateRef.current.target,
        type: "failed",
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
        });
      });
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [
    selectedDefinitionIdsByWorkspaceId,
    definitionChangeSequence,
    dispatchWorkflowProjectionState,
    projectionStateRef,
  ]);
}

function workflowProjectionTarget(projection: WorkflowGraphProjection): WorkflowProjectionTarget {
  return {
    definitionId: projection.definitionId,
    executionId: projection.executionId,
    versionId: projection.definitionVersionId,
    workspaceId: projection.workspaceId,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workflow projection action ${String(value)}`);
}
