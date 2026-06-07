import type {
  ApprovalAnswer,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowGraph,
  WorkflowGraphProjection,
  WorkflowValidationResult,
  WorkflowPendingApproval,
} from "@generated/backend";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ApprovalCard, type SubmitApproval } from "../../components/chat-transcript-approvals";
import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import { useWorkflowEditorStore } from "../../stores/workflow-editor-store";
import { requestNiriPaneOpen } from "../../niri-workspace/open-pane-events";
import {
  emptyWorkflowGraph,
  workflowGraphWithAddedDraftEdge,
  workflowGraphWithAddedDraftNode,
  type WorkflowDraftEdgeConnection,
  type WorkflowDraftNodeType,
} from "./workflow-graph-draft";
import { workflowGraphWithNodeLayout, type WorkflowLayoutPosition } from "./workflow-graph-layout";
import type {
  PixiWorkspaceCameraState,
  PixiWorkspaceEdgeConnection,
  PixiWorkspaceRenderer,
} from "./pixi-workspace-renderer";
import { createSyntheticPixiWorkspaceGraph } from "./pixi-workspace-synthetic-graph";
import { pixiGraphFromWorkflowProjection } from "./workflow-graph-projection";
import {
  toolbarDraftNodePosition,
  WorkflowGraphToolbar,
  workflowNodeMenuItems,
  WorkflowValidationPanel,
  type WorkflowDraftNodePosition,
} from "./workflow-graph-toolbar";

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
  const workflowCameraRef = useRef<PixiWorkspaceCameraState | null>(null);
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
  const [selectedWorkflowNodeId, setSelectedWorkflowNodeId] = useState<string | null>(null);
  const [workflowValidation, setWorkflowValidation] = useState<WorkflowValidationResult | null>(
    null,
  );
  const [workflowOperation, setWorkflowOperation] = useState<"run" | "validate" | null>(null);
  const syntheticGraph = window.setta.app.flags.pixiWorkspaceSyntheticGraph;
  const selectedDefinitionIdsByWorkspaceId = useWorkflowDefinitionStore(
    (state) => state.selectedDefinitionIdsByWorkspaceId,
  );
  const createWorkflowDefinition = useWorkflowDefinitionStore(
    (state) => state.createWorkflowDefinition,
  );
  const definitionChangeSequence = useWorkflowEditorStore(
    (state) => state.definitionChangeSequence,
  );
  const setSelectedNodeTarget = useWorkflowEditorStore((state) => state.setSelectedNodeTarget);
  useWorkflowProjection({
    definitionChangeSequence,
    selectedDefinitionIdsByWorkspaceId,
    setWorkflowProjection,
    setWorkflowProjectionReady,
    setWorkflowWorkspaceId,
    workflowTargetRef,
  });
  const workflowGraph = useMemo(
    () => pixiGraphForWorkflowProjection(workflowProjection),
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
    () => workflowProjectionPendingApproval(workflowProjection),
    [workflowProjection],
  );
  const selectedWorkflowNode = useMemo(
    () => selectedWorkflowProjectionNode(workflowProjection, selectedWorkflowNodeId),
    [selectedWorkflowNodeId, workflowProjection],
  );
  const loadingProjection = workflowProjectionLoading(syntheticGraph, workflowProjectionReady);
  const noWorkspace = workflowProjectionHasNoWorkspace(
    syntheticGraph,
    workflowProjectionReady,
    workflowWorkspaceId,
  );
  const openWorkflowContextMenu = useCallback((menu: WorkflowContextMenuState) => {
    setWorkflowContextMenu(menu);
  }, []);
  const addWorkflowDraftNodeAt = useCallback(
    async (nodeType: WorkflowDraftNodeType, position: WorkflowDraftNodePosition) => {
      setWorkflowEditorError("");
      setWorkflowValidation(null);
      try {
        const refreshed = await materializeWorkflowDraftNode({
          createWorkflowDefinition,
          nodeType,
          position,
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
    [createWorkflowDefinition, syntheticGraph, workflowProjection, workflowWorkspaceId],
  );
  const addWorkflowDraftNode = useCallback(
    async (nodeType: WorkflowDraftNodeType) => {
      const menu = workflowContextMenu;
      if (menu === null) {
        return;
      }
      setWorkflowContextMenu(null);
      await addWorkflowDraftNodeAt(nodeType, {
        worldX: menu.worldX,
        worldY: menu.worldY,
      });
    },
    [addWorkflowDraftNodeAt, workflowContextMenu],
  );
  const addWorkflowDraftNodeFromToolbar = useCallback(
    async (nodeType: WorkflowDraftNodeType) => {
      await addWorkflowDraftNodeAt(nodeType, toolbarDraftNodePosition(workflowProjection));
    },
    [addWorkflowDraftNodeAt, workflowProjection],
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
  const addWorkflowDraftEdge = useCallback(
    async (connection: PixiWorkspaceEdgeConnection) => {
      if (syntheticGraph !== null) {
        return;
      }
      if (workflowProjection === null) {
        setWorkflowEditorError("Create workflow nodes before connecting them");
        return;
      }
      if (workflowProjection.executionId !== "") {
        setWorkflowEditorError("Select the draft workflow before editing the graph");
        return;
      }
      if (workflowEditorError !== "") {
        setWorkflowEditorError("");
      }
      try {
        const refreshed = await materializeWorkflowDraftEdge({
          connection,
          projection: workflowProjection,
        });
        workflowTargetRef.current = workflowProjectionTarget(refreshed);
        setWorkflowProjection(refreshed);
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow edge edit failed",
        );
      }
    },
    [syntheticGraph, workflowEditorError, workflowProjection],
  );
  const validateWorkflowDraft = useCallback(async () => {
    if (syntheticGraph !== null) {
      return null;
    }
    if (workflowWorkspaceId === "") {
      setWorkflowEditorError("Open a workspace before validating a workflow");
      return null;
    }
    if (workflowProjection?.executionId) {
      setWorkflowEditorError("Switch to the draft workflow before validating");
      return null;
    }
    setWorkflowOperation("validate");
    setWorkflowEditorError("");
    try {
      const graphToValidate =
        workflowProjection === null
          ? emptyWorkflowGraph()
          : (
              await window.setta.workflow.readDefinition(
                workflowProjection.workspaceId,
                workflowProjection.definitionId,
              )
            ).graph;
      const result = await window.setta.workflow.validateDefinition(
        workflowWorkspaceId,
        graphToValidate,
      );
      setWorkflowValidation(result);
      return result;
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow validation failed");
      return null;
    } finally {
      setWorkflowOperation(null);
    }
  }, [syntheticGraph, workflowProjection, workflowWorkspaceId]);
  const runWorkflowDraft = useCallback(async () => {
    if (syntheticGraph !== null) {
      return;
    }
    if (workflowWorkspaceId === "") {
      setWorkflowEditorError("Open a workspace before running a workflow");
      return;
    }
    if (workflowProjection === null) {
      setWorkflowEditorError("Add a workflow node before running");
      return;
    }
    if (workflowProjection.executionId !== "") {
      setWorkflowEditorError("Switch to the draft workflow before starting another run");
      return;
    }
    setWorkflowOperation("run");
    setWorkflowEditorError("");
    try {
      const definition = await window.setta.workflow.readDefinition(
        workflowProjection.workspaceId,
        workflowProjection.definitionId,
      );
      const validation = await window.setta.workflow.validateDefinition(
        workflowProjection.workspaceId,
        definition.graph,
      );
      setWorkflowValidation(validation);
      if (!validation.valid) {
        return;
      }
      const execution = await window.setta.workflow.startExecution(
        workflowProjection.workspaceId,
        workflowProjection.definitionId,
      );
      const refreshed = await workflowProjectionForExecution(
        workflowProjection.workspaceId,
        workflowProjection.definitionId,
        execution.definitionVersionId,
        execution.id,
      );
      workflowTargetRef.current = workflowProjectionTarget(refreshed);
      setWorkflowProjection(refreshed);
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow run failed");
    } finally {
      setWorkflowOperation(null);
    }
  }, [syntheticGraph, workflowProjection, workflowWorkspaceId]);
  const showDraftWorkflow = useCallback(async () => {
    if (workflowProjection === null) {
      return;
    }
    setWorkflowEditorError("");
    try {
      const refreshed = await workflowProjectionForDefinition(
        workflowProjection.workspaceId,
        workflowProjection.definitionId,
      );
      workflowTargetRef.current = workflowProjectionTarget(refreshed);
      setWorkflowProjection(refreshed);
      setWorkflowValidation(null);
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow draft load failed");
    }
  }, [workflowProjection]);
  const openWorkflowNodeDetails = useCallback(
    (nodeId: string | null) => {
      if (workflowProjection === null || nodeId === null) {
        return;
      }
      setSelectedNodeTarget(workflowNodeDetailsTarget(workflowProjection, nodeId));
      requestNiriPaneOpen({
        surfaceKind: "workflow-node-details",
        subtitle: "workflow node details",
        title: "Workflow Node",
        tone: "cyan",
        widthSpec: { unit: "px", value: 380 },
      });
    },
    [setSelectedNodeTarget, workflowProjection],
  );
  const handleWorkflowNodeSelectionChange = useCallback((nodeIds: string[]) => {
    setSelectedWorkflowNodeId(nodeIds[0] ?? null);
  }, []);

  useEffect(() => {
    workflowCameraRef.current = null;
  }, [syntheticGraph, workflowWorkspaceId]);

  useEffect(() => {
    if (
      selectedWorkflowNodeId !== null &&
      !workflowProjection?.nodes.some((node) => node.id === selectedWorkflowNodeId)
    ) {
      setSelectedWorkflowNodeId(null);
    }
  }, [selectedWorkflowNodeId, workflowProjection]);

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
    let rendererHandle: PixiWorkspaceRenderer | null = null;
    const destroyRenderer = () => {
      if (rendererHandle === null) {
        return;
      }
      workflowCameraRef.current = rendererHandle.cameraState();
      rendererHandle.destroy();
      rendererHandle = null;
    };

    void import("./pixi-workspace-renderer")
      .then(async ({ createPixiWorkspaceRenderer }) => {
        const renderer = await createPixiWorkspaceRenderer({
          debugEnabled,
          debugSurfaceId: surfaceId,
          graph,
          host,
          initialCameraState: workflowCameraRef.current,
          onCanvasContextMenu: syntheticGraph === null ? openWorkflowContextMenu : undefined,
          onEdgeCreate:
            syntheticGraph === null ? (edge) => void addWorkflowDraftEdge(edge) : undefined,
          onNodeOpen:
            syntheticGraph === null ? (nodeId) => openWorkflowNodeDetails(nodeId) : undefined,
          onNodePositionsChange: (positions) => {
            void persistNodePositions(positions);
          },
          onNodeSelectionChange:
            syntheticGraph === null ? handleWorkflowNodeSelectionChange : undefined,
          reactRenderCount: () => reactRenderCount.current,
        });
        if (disposed) {
          renderer.destroy();
          return;
        }
        rendererHandle = renderer;
      })
      .catch((error: unknown) => {
        console.error("Failed to initialize Pixi workspace surface", error);
      });

    return () => {
      disposed = true;
      destroyRenderer();
      host.replaceChildren();
    };
  }, [
    debugEnabled,
    graph,
    addWorkflowDraftEdge,
    handleWorkflowNodeSelectionChange,
    openWorkflowContextMenu,
    openWorkflowNodeDetails,
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
      {syntheticGraph === null ? (
        <WorkflowGraphToolbar
          busy={workflowOperation}
          onAddNode={(nodeType) => void addWorkflowDraftNodeFromToolbar(nodeType)}
          onOpenDetails={() => openWorkflowNodeDetails(selectedWorkflowNodeId)}
          onRun={() => void runWorkflowDraft()}
          onShowDraft={() => void showDraftWorkflow()}
          onValidate={() => void validateWorkflowDraft()}
          projection={workflowProjection}
          ready={workflowProjectionReady}
          selectedNodeLabel={selectedWorkflowNode?.label ?? ""}
          validation={workflowValidation}
          workspaceId={workflowWorkspaceId}
        />
      ) : null}
      {loadingProjection ? <PixiWorkspaceState label="Loading workflow graph" /> : null}
      {noWorkspace ? <PixiWorkspaceState label="Open a workspace to edit workflows" /> : null}
      {workflowValidation ? <WorkflowValidationPanel validation={workflowValidation} /> : null}
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

function pixiGraphForWorkflowProjection(projection: WorkflowGraphProjection | null) {
  if (projection === null) {
    return undefined;
  }
  return pixiGraphFromWorkflowProjection(projection);
}

function workflowProjectionPendingApproval(projection: WorkflowGraphProjection | null) {
  if (projection === null) {
    return null;
  }
  return pendingWorkflowApproval(projection);
}

function selectedWorkflowProjectionNode(
  projection: WorkflowGraphProjection | null,
  nodeId: string | null,
) {
  if (projection === null || nodeId === null) {
    return null;
  }
  return projection.nodes.find((node) => node.id === nodeId) ?? null;
}

function workflowProjectionLoading(syntheticGraph: unknown, workflowProjectionReady: boolean) {
  return syntheticGraph === null && !workflowProjectionReady;
}

function workflowProjectionHasNoWorkspace(
  syntheticGraph: unknown,
  workflowProjectionReady: boolean,
  workflowWorkspaceId: string,
) {
  return syntheticGraph === null && workflowProjectionReady && workflowWorkspaceId === "";
}

function workflowNodeDetailsTarget(projection: WorkflowGraphProjection, nodeId: string) {
  return {
    definitionId: projection.definitionId,
    definitionName: projection.definitionName,
    executionId: projection.executionId,
    nodeId,
    workspaceId: projection.workspaceId,
  };
}

interface MaterializeWorkflowDraftNodeRequest {
  createWorkflowDefinition: CreateWorkflowDefinition;
  nodeType: WorkflowDraftNodeType;
  position: WorkflowDraftNodePosition;
  projection: WorkflowGraphProjection | null;
  syntheticGraphEnabled: boolean;
  workspaceId: string;
}

async function materializeWorkflowDraftNode({
  createWorkflowDefinition,
  nodeType,
  position,
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
  const graph = await workflowGraphWithDraftNode(projection, workspaceId, nodeType, position);
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
  position: WorkflowDraftNodePosition,
): Promise<WorkflowGraph> {
  const baseGraph =
    projection === null
      ? emptyWorkflowGraph()
      : (await window.setta.workflow.readDefinition(workspaceId, projection.definitionId)).graph;
  return workflowGraphWithAddedDraftNode(baseGraph, nodeType, {
    x: position.worldX,
    y: position.worldY,
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

async function workflowProjectionForExecution(
  workspaceId: string,
  definitionId: string,
  definitionVersionId: string,
  executionId: string,
): Promise<WorkflowGraphProjection> {
  const refreshed = await window.setta.workflow.graphProjection(
    workspaceId,
    definitionId,
    definitionVersionId,
    executionId,
  );
  if (refreshed.projection === null) {
    throw new Error(`workflow graph projection ${executionId} was not returned`);
  }
  return refreshed.projection;
}

interface MaterializeWorkflowDraftEdgeRequest {
  connection: WorkflowDraftEdgeConnection;
  projection: WorkflowGraphProjection;
}

async function materializeWorkflowDraftEdge({
  connection,
  projection,
}: MaterializeWorkflowDraftEdgeRequest): Promise<WorkflowGraphProjection> {
  const definition = await window.setta.workflow.readDefinition(
    projection.workspaceId,
    projection.definitionId,
  );
  const graph = workflowGraphWithAddedDraftEdge(definition.graph, connection);
  const updated = await window.setta.workflow.updateDefinition(
    projection.workspaceId,
    definition.id,
    definition.name,
    definition.description,
    graph,
  );
  return workflowProjectionForDefinition(projection.workspaceId, updated.id);
}

interface WorkflowProjectionLoader {
  definitionChangeSequence: number;
  selectedDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
  setWorkflowProjection: (projection: WorkflowGraphProjection | null) => void;
  setWorkflowProjectionReady: (ready: boolean) => void;
  setWorkflowWorkspaceId: (workspaceId: string) => void;
  workflowTargetRef: MutableRefObject<WorkflowProjectionTarget | null>;
}

function useWorkflowProjection({
  definitionChangeSequence,
  selectedDefinitionIdsByWorkspaceId,
  setWorkflowProjection,
  setWorkflowProjectionReady,
  setWorkflowWorkspaceId,
  workflowTargetRef,
}: WorkflowProjectionLoader) {
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
    definitionChangeSequence,
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

function WorkflowCanvasContextMenu({
  menu,
  menuRef,
  onSelectNodeType,
}: {
  menu: WorkflowContextMenuState;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  onSelectNodeType: (nodeType: WorkflowDraftNodeType) => void;
}) {
  return createPortal(
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
    </div>,
    document.body,
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
