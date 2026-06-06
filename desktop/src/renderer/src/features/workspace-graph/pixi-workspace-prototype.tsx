import type { WorkflowEvent, WorkflowGraphProjection } from "@generated/backend";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";

import { createSyntheticPixiWorkspaceGraph } from "./pixi-workspace-synthetic-graph";
import { pixiGraphFromWorkflowProjection } from "./workflow-graph-projection";

export function PixiWorkspacePrototype({ debugEnabled }: { debugEnabled: boolean }) {
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
  const rendererReady = syntheticGraph !== null || workflowProjectionReady;

  useEffect(() => {
    if (!rendererReady) {
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    let destroyRenderer: (() => void) | null = null;

    void import("./pixi-workspace-renderer")
      .then(async ({ createPixiWorkspaceRenderer }) => {
        const renderer = await createPixiWorkspaceRenderer({
          debugEnabled,
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
        console.error("Failed to initialize Pixi workspace prototype", error);
      });

    return () => {
      disposed = true;
      destroyRenderer?.();
      if (debugEnabled) {
        delete window.__settaPixiWorkspaceDebug;
      }
    };
  }, [debugEnabled, graph, rendererReady]);

  return (
    <div
      ref={hostRef}
      className="h-screen w-screen overflow-hidden bg-zinc-950"
      data-testid="pixi-workspace"
    />
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
