import type {
  ApprovalAnswer,
  WorkflowEvent,
  WorkflowGraphProjection,
  WorkflowPendingApproval,
} from "@generated/backend";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";

import { ApprovalCard, type SubmitApproval } from "../../components/chat-transcript-approvals";
import { createSyntheticPixiWorkspaceGraph } from "./pixi-workspace-synthetic-graph";
import { pixiGraphFromWorkflowProjection } from "./workflow-graph-projection";

export function PixiWorkspaceSurface({
  debugEnabled,
  surfaceId,
}: {
  debugEnabled: boolean;
  surfaceId: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workflowTargetRef = useRef<WorkflowProjectionTarget | null>(null);
  const reactRenderCount = useRef(0);
  reactRenderCount.current += 1;
  const [workflowProjection, setWorkflowProjection] = useState<WorkflowGraphProjection | null>(
    null,
  );
  const [workflowProjectionReady, setWorkflowProjectionReady] = useState(false);
  const syntheticGraph = window.setta.app.flags.pixiWorkspaceSyntheticGraph;
  useWorkflowProjection(workflowTargetRef, setWorkflowProjection, setWorkflowProjectionReady);
  const workflowGraph = useMemo(
    () =>
      workflowProjection === null ? undefined : pixiGraphFromWorkflowProjection(workflowProjection),
    [workflowProjection],
  );
  const graph = useMemo(
    () => (syntheticGraph ? createSyntheticPixiWorkspaceGraph(syntheticGraph) : workflowGraph),
    [syntheticGraph, workflowGraph],
  );
  const pendingApproval = useMemo(
    () => (workflowProjection === null ? null : pendingWorkflowApproval(workflowProjection)),
    [workflowProjection],
  );
  const loadingProjection = syntheticGraph === null && !workflowProjectionReady;

  useEffect(() => {
    if (!graph) {
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.replaceChildren();
    let disposed = false;
    let destroyRenderer: (() => void) | null = null;

    void import("./pixi-workspace-renderer")
      .then(async ({ createPixiWorkspaceRenderer }) => {
        const renderer = await createPixiWorkspaceRenderer({
          debugEnabled,
          debugSurfaceId: surfaceId,
          graph,
          host,
          reactRenderCount: () => reactRenderCount.current,
        });
        if (disposed) {
          renderer.destroy();
          return;
        }
        destroyRenderer = () => renderer.destroy();
      })
      .catch((error: unknown) => {
        console.error("Failed to initialize Pixi workspace surface", error);
      });

    return () => {
      disposed = true;
      destroyRenderer?.();
      host.replaceChildren();
    };
  }, [debugEnabled, graph, surfaceId]);

  return (
    <section className="niri-pixi-workspace-surface" data-testid="niri-pixi-workspace-surface">
      <div
        ref={hostRef}
        className="niri-pixi-workspace-host"
        data-surface-id={surfaceId}
        data-testid="pixi-workspace"
      />
      {loadingProjection ? <PixiWorkspaceState label="Loading workflow graph" /> : null}
      {!loadingProjection && !graph ? <PixiWorkspaceState label="No workflow graph" /> : null}
      <WorkflowApprovalOverlay
        pendingApproval={pendingApproval}
        projection={workflowProjection}
        setWorkflowProjection={setWorkflowProjection}
      />
    </section>
  );
}

interface WorkflowProjectionTarget {
  definitionId: string;
  executionId: string;
  versionId: string;
  workspaceId: string;
}

function useWorkflowProjection(
  workflowTargetRef: MutableRefObject<WorkflowProjectionTarget | null>,
  setWorkflowProjection: (projection: WorkflowGraphProjection | null) => void,
  setWorkflowProjectionReady: (ready: boolean) => void,
) {
  useEffect(() => {
    let disposed = false;

    const storeProjection = (projection: WorkflowGraphProjection | null, workspaceId: string) => {
      if (disposed) {
        return;
      }
      workflowTargetRef.current = projection
        ? workflowProjectionTarget(projection)
        : {
            definitionId: "",
            executionId: "",
            versionId: "",
            workspaceId,
          };
      setWorkflowProjection(projection);
    };
    const markProjectionReady = () => {
      if (!disposed) {
        setWorkflowProjectionReady(true);
      }
    };

    const loadWorkspaceProjection = async () => {
      const session = await window.setta.workspace.session();
      if (session.selectedWorkspaceId === "") {
        storeProjection(null, "");
        markProjectionReady();
        return;
      }
      const response = await window.setta.workflow.graphProjection(session.selectedWorkspaceId);
      storeProjection(response.projection, session.selectedWorkspaceId);
      markProjectionReady();
    };

    const loadEventProjection = async (event: WorkflowEvent) => {
      const current = workflowTargetRef.current;
      if (
        current !== null &&
        current.workspaceId !== "" &&
        current.workspaceId !== event.workspaceId
      ) {
        return;
      }
      const response = await window.setta.workflow.graphProjection(
        event.workspaceId,
        event.definitionId,
        event.definitionVersionId,
        event.executionId,
      );
      storeProjection(response.projection, event.workspaceId);
    };

    void loadWorkspaceProjection().catch((error: unknown) => {
      console.error("Failed to load workflow graph projection", error);
      markProjectionReady();
    });
    const unsubscribe = window.setta.workflow.onEvent((event) => {
      void loadEventProjection(event).catch((error: unknown) => {
        console.error("Failed to refresh workflow graph projection", error);
      });
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [setWorkflowProjection, setWorkflowProjectionReady, workflowTargetRef]);
}

function workflowProjectionTarget(projection: WorkflowGraphProjection): WorkflowProjectionTarget {
  return {
    definitionId: projection.definitionId,
    executionId: projection.executionId,
    versionId: projection.definitionVersionId,
    workspaceId: projection.workspaceId,
  };
}

function pendingWorkflowApproval(
  projection: WorkflowGraphProjection,
): WorkflowPendingApproval | null {
  for (const node of projection.nodes) {
    if (node.pendingApproval !== null) {
      return node.pendingApproval;
    }
  }
  return null;
}

function PixiWorkspaceState({ label }: { label: string }) {
  return <div className="niri-pixi-workspace-state">{label}</div>;
}

function WorkflowApprovalOverlay({
  pendingApproval,
  projection,
  setWorkflowProjection,
}: {
  pendingApproval: WorkflowPendingApproval | null;
  projection: WorkflowGraphProjection | null;
  setWorkflowProjection: (projection: WorkflowGraphProjection | null) => void;
}) {
  const [error, setError] = useState("");
  if (pendingApproval === null || projection === null) {
    return null;
  }
  const submitApproval: SubmitApproval = async (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => {
    setError("");
    try {
      await window.setta.workflow.submitApproval({
        answers,
        approvalId,
        approved,
        cancelled,
        executionId: pendingApproval.executionId,
        nodeExecutionId: pendingApproval.nodeExecutionId,
        response,
        workspaceId: pendingApproval.workspaceId,
      });
      const refreshed = await window.setta.workflow.graphProjection(
        pendingApproval.workspaceId,
        projection.definitionId,
        projection.definitionVersionId,
        pendingApproval.executionId,
      );
      setWorkflowProjection(refreshed.projection);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Workflow approval failed");
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-end sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-auto">
      <div className="pointer-events-auto w-full max-w-md shadow-xl">
        <ApprovalCard approval={pendingApproval.approval} submitApproval={submitApproval} />
        {error ? (
          <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
