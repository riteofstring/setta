import type {
  ApprovalAnswer,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowGraph,
  WorkflowGraphProjection,
  WorkflowPendingApproval,
} from "@generated/backend";
import { Bot, Circle, GitBranch, GitMerge, Square, Workflow } from "lucide-react";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApprovalCard, type SubmitApproval } from "../../components/chat-transcript-approvals";
import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import {
  emptyWorkflowGraph,
  workflowGraphWithAddedDraftNode,
  type WorkflowDraftNodeType,
} from "./workflow-graph-draft";
import { workflowGraphWithNodeLayout, type WorkflowLayoutPosition } from "./workflow-graph-layout";
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
  const workflowMenuRef = useRef<HTMLDivElement>(null);
  const workflowTargetRef = useRef<WorkflowProjectionTarget | null>(null);
  const reactRenderCount = useRef(0);
  reactRenderCount.current += 1;
  const [workflowProjection, setWorkflowProjection] = useState<WorkflowGraphProjection | null>(
    null,
  );
  const [workflowProjectionReady, setWorkflowProjectionReady] = useState(false);
  const [workflowWorkspaceId, setWorkflowWorkspaceId] = useState("");
  const [workflowEditorError, setWorkflowEditorError] = useState("");
  const [workflowContextMenu, setWorkflowContextMenu] = useState<WorkflowContextMenuState | null>(
    null,
  );
  const syntheticGraph = window.setta.app.flags.pixiWorkspaceSyntheticGraph;
  const selectedDefinitionIdsByWorkspaceId = useWorkflowDefinitionStore(
    (state) => state.selectedDefinitionIdsByWorkspaceId,
  );
  const createWorkflowDefinition = useWorkflowDefinitionStore(
    (state) => state.createWorkflowDefinition,
  );
  useWorkflowProjection(
    workflowTargetRef,
    setWorkflowProjection,
    setWorkflowProjectionReady,
    setWorkflowWorkspaceId,
    selectedDefinitionIdsByWorkspaceId,
  );
  const workflowGraph = useMemo(
    () =>
      workflowProjection === null ? undefined : pixiGraphFromWorkflowProjection(workflowProjection),
    [workflowProjection],
  );
  const graph = useMemo(() => {
    if (syntheticGraph) {
      return createSyntheticPixiWorkspaceGraph(syntheticGraph);
    }
    if (workflowGraph) {
      return workflowGraph;
    }
    if (workflowProjectionReady && workflowWorkspaceId !== "") {
      return emptyPixiWorkflowGraph();
    }
    return undefined;
  }, [syntheticGraph, workflowGraph, workflowProjectionReady, workflowWorkspaceId]);
  const pendingApproval = useMemo(
    () => (workflowProjection === null ? null : pendingWorkflowApproval(workflowProjection)),
    [workflowProjection],
  );
  const loadingProjection = syntheticGraph === null && !workflowProjectionReady;
  const noWorkspace =
    syntheticGraph === null && workflowProjectionReady && workflowWorkspaceId === "";
  const openWorkflowContextMenu = useCallback((menu: WorkflowContextMenuState) => {
    setWorkflowContextMenu(menu);
  }, []);
  const addWorkflowDraftNode = useCallback(
    async (nodeType: WorkflowDraftNodeType) => {
      const menu = workflowContextMenu;
      if (menu === null) {
        return;
      }
      setWorkflowContextMenu(null);
      setWorkflowEditorError("");
      try {
        const refreshed = await materializeWorkflowDraftNode({
          createWorkflowDefinition,
          menu,
          nodeType,
          projection: workflowProjection,
          syntheticGraphEnabled: syntheticGraph !== null,
          workspaceId: workflowWorkspaceId,
        });
        if (refreshed !== null) {
          workflowTargetRef.current = workflowProjectionTarget(refreshed);
          setWorkflowProjection(refreshed);
        }
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow graph edit failed",
        );
      }
    },
    [
      createWorkflowDefinition,
      syntheticGraph,
      workflowContextMenu,
      workflowProjection,
      workflowWorkspaceId,
    ],
  );
  const persistNodePositions = useCallback(
    async (positions: WorkflowLayoutPosition[]) => {
      if (syntheticGraph !== null || workflowProjection === null) {
        return;
      }
      if (workflowProjection.executionId !== "") {
        return;
      }
      if (workflowEditorError !== "") {
        setWorkflowEditorError("");
      }
      try {
        const definition = await window.setta.workflow.readDefinition(
          workflowProjection.workspaceId,
          workflowProjection.definitionId,
        );
        const graph = workflowGraphWithNodeLayout(definition.graph, positions);
        await window.setta.workflow.updateDefinition(
          workflowProjection.workspaceId,
          definition.id,
          definition.name,
          definition.description,
          graph,
        );
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow layout update failed",
        );
      }
    },
    [syntheticGraph, workflowEditorError, workflowProjection],
  );

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
          onCanvasContextMenu: syntheticGraph === null ? openWorkflowContextMenu : undefined,
          onNodePositionsChange: (positions) => {
            void persistNodePositions(positions);
          },
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
  }, [
    debugEnabled,
    graph,
    openWorkflowContextMenu,
    persistNodePositions,
    surfaceId,
    syntheticGraph,
  ]);

  useEffect(() => {
    if (workflowContextMenu === null) {
      return;
    }

    function closeOnClick(event: MouseEvent) {
      if (!workflowMenuRef.current?.contains(event.target as Node)) {
        setWorkflowContextMenu(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkflowContextMenu(null);
      }
    }

    function closeMenu() {
      setWorkflowContextMenu(null);
    }

    window.addEventListener("click", closeOnClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeOnClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [workflowContextMenu]);

  return (
    <section className="niri-pixi-workspace-surface" data-testid="niri-pixi-workspace-surface">
      <div
        ref={hostRef}
        className="niri-pixi-workspace-host"
        data-surface-id={surfaceId}
        data-testid="pixi-workspace"
      />
      {loadingProjection ? <PixiWorkspaceState label="Loading workflow graph" /> : null}
      {noWorkspace ? <PixiWorkspaceState label="Open a workspace to edit workflows" /> : null}
      {workflowContextMenu ? (
        <WorkflowCanvasContextMenu
          menu={workflowContextMenu}
          menuRef={workflowMenuRef}
          onSelectNodeType={(nodeType) => void addWorkflowDraftNode(nodeType)}
        />
      ) : null}
      {workflowEditorError ? <PixiWorkspaceEditorError message={workflowEditorError} /> : null}
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

type CreateWorkflowDefinition = (
  workspaceId: string,
  name?: string,
  graph?: WorkflowGraph,
) => Promise<WorkflowDefinition>;

interface MaterializeWorkflowDraftNodeRequest {
  createWorkflowDefinition: CreateWorkflowDefinition;
  menu: WorkflowContextMenuState;
  nodeType: WorkflowDraftNodeType;
  projection: WorkflowGraphProjection | null;
  syntheticGraphEnabled: boolean;
  workspaceId: string;
}

async function materializeWorkflowDraftNode({
  createWorkflowDefinition,
  menu,
  nodeType,
  projection,
  syntheticGraphEnabled,
  workspaceId,
}: MaterializeWorkflowDraftNodeRequest): Promise<WorkflowGraphProjection | null> {
  const preflight = workflowDraftNodeEditPreflight({
    projection,
    syntheticGraphEnabled,
    workspaceId,
  });
  if (preflight === "skip") {
    return null;
  }
  if (preflight !== null) {
    throw new Error(preflight);
  }
  const graph = await workflowGraphWithDraftNode(projection, workspaceId, nodeType, menu);
  const definition =
    projection === null
      ? await createWorkflowDefinition(workspaceId, "Untitled workflow", graph)
      : await window.setta.workflow.updateDefinition(
          workspaceId,
          projection.definitionId,
          projection.definitionName,
          projection.definitionDescription,
          graph,
        );
  return workflowProjectionForDefinition(workspaceId, definition.id);
}

function workflowDraftNodeEditPreflight({
  projection,
  syntheticGraphEnabled,
  workspaceId,
}: Pick<
  MaterializeWorkflowDraftNodeRequest,
  "projection" | "syntheticGraphEnabled" | "workspaceId"
>): "skip" | string | null {
  if (syntheticGraphEnabled) {
    return "skip";
  }
  if (workspaceId === "") {
    return "Open a workspace before editing a workflow";
  }
  if (projection?.executionId) {
    return "Select the draft workflow before editing the graph";
  }
  return null;
}

async function workflowGraphWithDraftNode(
  projection: WorkflowGraphProjection | null,
  workspaceId: string,
  nodeType: WorkflowDraftNodeType,
  menu: WorkflowContextMenuState,
): Promise<WorkflowGraph> {
  const baseGraph =
    projection === null
      ? emptyWorkflowGraph()
      : (await window.setta.workflow.readDefinition(workspaceId, projection.definitionId)).graph;
  return workflowGraphWithAddedDraftNode(baseGraph, nodeType, {
    x: menu.worldX,
    y: menu.worldY,
  });
}

async function workflowProjectionForDefinition(
  workspaceId: string,
  definitionId: string,
): Promise<WorkflowGraphProjection> {
  const refreshed = await window.setta.workflow.graphProjection(workspaceId, definitionId);
  if (refreshed.projection === null) {
    throw new Error(`workflow graph projection ${definitionId} was not returned`);
  }
  return refreshed.projection;
}

function useWorkflowProjection(
  workflowTargetRef: MutableRefObject<WorkflowProjectionTarget | null>,
  setWorkflowProjection: (projection: WorkflowGraphProjection | null) => void,
  setWorkflowProjectionReady: (ready: boolean) => void,
  setWorkflowWorkspaceId: (workspaceId: string) => void,
  selectedDefinitionIdsByWorkspaceId: Record<string, string | undefined>,
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
      setWorkflowWorkspaceId(workspaceId);
      setWorkflowProjection(projection);
    };
    const markProjectionReady = () => {
      if (!disposed) {
        setWorkflowProjectionReady(true);
      }
    };

    const loadWorkspaceProjection = async () => {
      if (!disposed) {
        setWorkflowProjectionReady(false);
      }
      const session = await window.setta.workspace.session();
      if (session.selectedWorkspaceId === "") {
        storeProjection(null, "");
        markProjectionReady();
        return;
      }
      await useWorkflowDefinitionStore
        .getState()
        .ensureWorkspaceWorkflowDefinitions(session.selectedWorkspaceId);
      const definitionId =
        useWorkflowDefinitionStore.getState().selectedDefinitionIdsByWorkspaceId[
          session.selectedWorkspaceId
        ] ?? "";
      if (definitionId === "") {
        storeProjection(null, session.selectedWorkspaceId);
        markProjectionReady();
        return;
      }
      const response = await window.setta.workflow.graphProjection(
        session.selectedWorkspaceId,
        definitionId,
      );
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
  }, [
    selectedDefinitionIdsByWorkspaceId,
    setWorkflowProjection,
    setWorkflowProjectionReady,
    setWorkflowWorkspaceId,
    workflowTargetRef,
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

function PixiWorkspaceEditorError({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
      <div className="pointer-events-auto max-w-md rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 shadow-lg">
        {message}
      </div>
    </div>
  );
}

interface WorkflowContextMenuState {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
}

const workflowNodeMenuItems = [
  { icon: Bot, label: "Agent Task", type: "agent_task" },
  { icon: GitBranch, label: "Route", type: "route" },
  { icon: GitMerge, label: "Merge", type: "merge" },
  { icon: Workflow, label: "Barrier Join", type: "barrier_join" },
  { icon: Circle, label: "Start", type: "start" },
  { icon: Square, label: "End", type: "end" },
] satisfies {
  icon: typeof Bot;
  label: string;
  type: WorkflowDraftNodeType;
}[];

function WorkflowCanvasContextMenu({
  menu,
  menuRef,
  onSelectNodeType,
}: {
  menu: WorkflowContextMenuState;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  onSelectNodeType: (nodeType: WorkflowDraftNodeType) => void;
}) {
  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-48 rounded-sm border border-zinc-700/80 bg-zinc-900/95 p-1 text-zinc-100 shadow-2xl shadow-zinc-950/50 backdrop-blur"
      data-testid="workflow-node-create-menu"
      role="menu"
      style={{ left: menu.clientX, top: menu.clientY }}
    >
      {workflowNodeMenuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50"
            data-testid={`workflow-node-create-${item.type}`}
            onClick={() => onSelectNodeType(item.type)}
            role="menuitem"
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function emptyPixiWorkflowGraph() {
  return {
    edges: [],
    nodes: [],
    workflow: null,
  };
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
