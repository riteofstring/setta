import type { WorkflowEvent, WorkflowGraphProjection } from "@generated/backend";
import { type MutableRefObject, useCallback, useEffect, useReducer, useRef } from "react";

import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import {
  readWorkflowGraphProjectionFocusTarget,
  workflowProjectionTargetForFocusTarget,
} from "./workflow-graph-projection-target-store";

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
      allowDraftTargetSwitch: boolean;
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
  surfaceId,
}: {
  definitionChangeSequence: number;
  selectedDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
  surfaceId: string;
}) {
  const [state, dispatchBase] = useReducer(
    workflowProjectionReducer,
    initialWorkflowProjectionState,
  );
  const stateRef = useRef(state);
  const dispatch = useCallback((action: WorkflowProjectionAction) => {
    const previousState = stateRef.current;
    const nextState = workflowProjectionReducer(stateRef.current, action);
    if (nextState === previousState) {
      return nextState;
    }
    stateRef.current = nextState;
    dispatchBase(action);
    return nextState;
  }, []);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useWorkflowProjection({
    definitionChangeSequence,
    dispatchWorkflowProjectionState: dispatch,
    projectionStateRef: stateRef,
    selectedDefinitionIdsByWorkspaceId,
    surfaceId,
  });

  const replaceWorkflowProjection = useCallback(
    (
      projection: WorkflowGraphProjection | null,
      options: { allowDraftTargetSwitch?: boolean } = {},
    ) => {
      const previousState = stateRef.current;
      const nextState = dispatch({
        allowDraftTargetSwitch: options.allowDraftTargetSwitch ?? false,
        projection,
        target:
          projection === null ? stateRef.current.target : workflowProjectionTarget(projection),
        type: "replace",
      });
      return nextState !== previousState;
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
      return reduceWorkflowProjectionLoading(state, action);
    case "ready":
      return reduceWorkflowProjectionReady(state, action);
    case "failed":
      return reduceWorkflowProjectionFailed(state, action);
    case "replace":
      return reduceWorkflowProjectionReplace(state, action);
    default:
      return assertNever(action);
  }
}

function reduceWorkflowProjectionLoading(
  state: WorkflowProjectionState,
  action: Extract<WorkflowProjectionAction, { type: "loading" }>,
): WorkflowProjectionState {
  if (workflowProjectionDefaultLoadShouldPreserveFocusedTarget(state.target, action.target)) {
    return state;
  }
  return {
    error: "",
    projection: null,
    status: "loading",
    target: action.target,
  };
}

function reduceWorkflowProjectionReady(
  state: WorkflowProjectionState,
  action: Extract<WorkflowProjectionAction, { type: "ready" }>,
): WorkflowProjectionState {
  if (!workflowProjectionTargetsEqual(state.target, action.expectedTarget)) {
    return state;
  }
  if (workflowProjectionReadyActionIsStale(state, action)) {
    return state;
  }
  return {
    error: "",
    projection: action.projection,
    status: "ready",
    target: action.target,
  };
}

function reduceWorkflowProjectionFailed(
  state: WorkflowProjectionState,
  action: Extract<WorkflowProjectionAction, { type: "failed" }>,
): WorkflowProjectionState {
  if (!workflowProjectionTargetsEqual(state.target, action.expectedTarget)) {
    return state;
  }
  return {
    error: action.error,
    projection: null,
    status: "error",
    target: action.target,
  };
}

function reduceWorkflowProjectionReplace(
  state: WorkflowProjectionState,
  action: Extract<WorkflowProjectionAction, { type: "replace" }>,
): WorkflowProjectionState {
  if (
    !action.allowDraftTargetSwitch &&
    action.projection?.viewMode === "draft" &&
    workflowProjectionDefaultLoadShouldPreserveFocusedTarget(state.target, action.target)
  ) {
    return state;
  }
  return {
    error: "",
    projection: action.projection,
    status: "ready",
    target: action.target,
  };
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

function workflowProjectionReadyActionIsStale(
  state: WorkflowProjectionState,
  action: Extract<WorkflowProjectionAction, { type: "ready" }>,
) {
  if (
    state.status !== "ready" ||
    state.projection === null ||
    action.projection === null ||
    state.projection.viewMode !== "draft" ||
    action.projection.viewMode !== "draft"
  ) {
    return false;
  }
  return (
    workflowProjectionTargetsEqual(
      workflowProjectionTarget(state.projection),
      workflowProjectionTarget(action.projection),
    ) &&
    state.projection.draftRevision !== action.projection.draftRevision &&
    state.projection.draftUpdatedAt > action.projection.draftUpdatedAt
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

function storedWorkflowProjectionTargetForDefinition({
  definitionId,
  surfaceId,
  workspaceId,
}: {
  definitionId: string;
  surfaceId: string;
  workspaceId: string;
}): WorkflowProjectionTarget | null {
  const storedTarget = readWorkflowGraphProjectionFocusTarget(surfaceId);
  if (
    storedTarget === null ||
    storedTarget.workspaceId !== workspaceId ||
    storedTarget.definitionId !== definitionId
  ) {
    return null;
  }
  return workflowProjectionTargetForFocusTarget(storedTarget);
}

interface WorkflowProjectionLoader {
  definitionChangeSequence: number;
  dispatchWorkflowProjectionState: (action: WorkflowProjectionAction) => void;
  projectionStateRef: MutableRefObject<WorkflowProjectionState>;
  selectedDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
  surfaceId: string;
}

function useWorkflowProjection({
  definitionChangeSequence,
  dispatchWorkflowProjectionState,
  projectionStateRef,
  selectedDefinitionIdsByWorkspaceId,
  surfaceId,
}: WorkflowProjectionLoader) {
  useEffect(() => {
    let disposed = false;

    const dispatchIfMounted = (action: WorkflowProjectionAction) => {
      if (disposed) {
        return;
      }
      dispatchWorkflowProjectionState(action);
    };
    const dispatchEmptyProjectionReady = (target: WorkflowProjectionTarget) => {
      dispatchIfMounted({
        target,
        type: "loading",
      });
      dispatchIfMounted({
        expectedTarget: target,
        projection: null,
        target,
        type: "ready",
      });
    };
    const loadProjectionTarget = async (target: WorkflowProjectionTarget) => {
      dispatchIfMounted({
        target,
        type: "loading",
      });
      const response = await window.setta.workflow.graphProjection(
        target.workspaceId,
        target.definitionId,
        target.versionId,
        target.executionId,
      );
      dispatchIfMounted({
        expectedTarget: target,
        projection: response.projection,
        target: response.projection ? workflowProjectionTarget(response.projection) : target,
        type: "ready",
      });
    };

    const loadWorkspaceProjection = async () => {
      const session = await window.setta.workspace.session();
      if (session.selectedWorkspaceId === "") {
        dispatchEmptyProjectionReady(emptyWorkflowProjectionTarget);
        return;
      }
      const workspaceTarget = workflowProjectionTargetForWorkspace(session.selectedWorkspaceId);
      await useWorkflowDefinitionStore
        .getState()
        .ensureWorkspaceWorkflowDefinitions(session.selectedWorkspaceId);
      const definitionId =
        useWorkflowDefinitionStore.getState().selectedDefinitionIdsByWorkspaceId[
          session.selectedWorkspaceId
        ] ?? "";
      if (definitionId === "") {
        dispatchEmptyProjectionReady(workspaceTarget);
        return;
      }
      const definitionTarget = {
        ...workspaceTarget,
        definitionId,
      };
      const focusTarget = storedWorkflowProjectionTargetForDefinition({
        definitionId,
        surfaceId,
        workspaceId: session.selectedWorkspaceId,
      });
      if (focusTarget !== null) {
        await loadProjectionTarget(focusTarget);
        return;
      }
      if (
        workflowProjectionDefaultLoadShouldPreserveFocusedTarget(
          projectionStateRef.current.target,
          definitionTarget,
        )
      ) {
        return;
      }
      await loadProjectionTarget(definitionTarget);
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
    surfaceId,
  ]);
}

function workflowProjectionDefaultLoadShouldPreserveFocusedTarget(
  current: WorkflowProjectionTarget,
  draftTarget: WorkflowProjectionTarget,
) {
  return (
    current.workspaceId === draftTarget.workspaceId &&
    current.definitionId === draftTarget.definitionId &&
    draftTarget.versionId === "" &&
    draftTarget.executionId === "" &&
    (current.versionId !== "" || current.executionId !== "")
  );
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
