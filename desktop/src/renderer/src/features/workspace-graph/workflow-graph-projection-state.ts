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

// The projection currently shown on the canvas, plus the target and update source it was
// resolved for. Preserved across loading and error transitions so selecting a new target
// never blanks the previously displayed graph.
interface WorkflowDisplayedProjection {
  projection: WorkflowGraphProjection | null;
  target: WorkflowProjectionTarget;
  updateSource: WorkflowGraphUpdateSource | null;
}

type WorkflowProjectionStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { error: string; kind: "error" };

export interface WorkflowProjectionState {
  // What the canvas is currently showing. Survives loading/error of a newly selected target.
  displayed: WorkflowDisplayedProjection;
  // Status of the selected/pending target load.
  status: WorkflowProjectionStatus;
  // Selected/pending target being loaded; equals displayed.target once status is "ready".
  target: WorkflowProjectionTarget;
}

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

export const initialWorkflowProjectionState: WorkflowProjectionState = {
  displayed: {
    projection: null,
    target: emptyWorkflowProjectionTarget,
    updateSource: null,
  },
  status: { kind: "loading" },
  target: emptyWorkflowProjectionTarget,
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
        });
        throw error;
      }
    },
    [dispatch],
  );

  return {
    ...workflowProjectionStateView(state),
    loadWorkflowGraphTarget,
    replaceWorkflowProjection,
    state,
    stateRef,
  };
}

interface WorkflowProjectionStateView {
  error: string;
  graphTarget: WorkflowGraphTarget | null;
  loading: boolean;
  noWorkspace: boolean;
  projection: WorkflowGraphProjection | null;
  ready: boolean;
  updateSource: WorkflowGraphUpdateSource | null;
  workspaceId: string;
}

// workflowProjectionStateView derives the renderer-facing values from the reducer state. The
// displayed projection (and its target/update source) is what the canvas should render, even
// while a newly selected target is still loading. `ready` is content-based: it stays true
// whenever a projection is displayed so a warm target switch neither disables the toolbar nor
// forces a redundant scene replacement; it is only false on a cold load with nothing to show.
export function workflowProjectionStateView(
  state: WorkflowProjectionState,
): WorkflowProjectionStateView {
  const statusReady = state.status.kind === "ready";
  const workspaceId = workflowProjectionTargetWorkspaceId(state.target);
  return {
    error: state.status.kind === "error" ? state.status.error : "",
    graphTarget: workflowGraphTargetOrNull(state.displayed.target),
    loading: state.status.kind === "loading",
    noWorkspace: statusReady && workspaceId === "",
    projection: state.displayed.projection,
    ready: statusReady || state.displayed.projection !== null,
    updateSource: state.displayed.updateSource,
    workspaceId,
  };
}

export function workflowProjectionReducer(
  state: WorkflowProjectionState,
  action: WorkflowProjectionAction,
): WorkflowProjectionState {
  switch (action.type) {
    case "loading":
      // Preserve the displayed projection so the canvas keeps rendering the previous graph
      // while the newly selected target loads.
      return {
        displayed: state.displayed,
        status: { kind: "loading" },
        target: action.target,
      };
    case "ready":
      if (!workflowProjectionTargetsEqual(state.target, action.expectedTarget)) {
        return state;
      }
      return {
        displayed: {
          projection: action.projection,
          target: action.target,
          updateSource: action.updateSource,
        },
        status: { kind: "ready" },
        target: action.target,
      };
    case "failed":
      if (!workflowProjectionTargetsEqual(state.target, action.expectedTarget)) {
        return state;
      }
      // Keep the previously displayed projection visible behind the error so a failed load
      // does not blank the canvas.
      return {
        displayed: state.displayed,
        status: { error: action.error, kind: "error" },
        target: action.target,
      };
    case "replace":
      return {
        displayed: {
          projection: action.projection,
          target: action.target,
          updateSource: action.updateSource,
        },
        status: { kind: "ready" },
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
      // Refreshing the already-selected run is a live update, not a target switch. Skip the
      // loading transition and swap the displayed projection only once the refresh resolves so
      // a streaming run never flickers a loading state over its own graph.
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
    const workflowDefinitionChanged = (event: Event) => {
      void loadDefinitionChangeProjection(event).catch((error: unknown) => {
        console.error("Failed to refresh workflow definition graph projection", error);
        dispatchIfMounted({
          error: workflowProjectionErrorMessage(error),
          expectedTarget: projectionStateRef.current.target,
          target: projectionStateRef.current.target,
          type: "failed",
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
