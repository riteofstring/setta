import type {
  SemanticGraph,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowGraphProjection,
  WorkflowValidationResult,
  WorkflowPendingApproval,
} from "@generated/backend";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import { useWorkflowEditorStore } from "../../stores/workflow-editor-store";
import { requestWorkspacePaneOpen } from "../../workspace-layout/open-pane-events";
import { useSemanticGraphStore } from "../../stores/semantic-graph-store";
import {
  emptyWorkflowGraph,
  workflowGraphWithAddedDraftEdge,
  workflowGraphWithAddedDraftNode,
  workflowGraphWithoutDraftNodes,
  type WorkflowDraftEdgeConnection,
  type WorkflowDraftNodeType,
} from "./workflow-graph-draft";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";
import { persistGraphNodePositions } from "./workflow-graph-layout-persistence";
import type {
  WorkflowGraphCameraState,
  WorkflowGraphEdgeConnection,
  WorkflowGraphGraph,
  WorkflowGraphRenderer,
} from "./pixi-renderer";
import { createSyntheticWorkflowGraph } from "./pixi-renderer-synthetic-graph";
import { WorkflowApprovalOverlay } from "./workflow-approval-overlay";
import {
  syncWorkflowGraphCameraScope,
  writeWorkflowGraphCameraState,
  type SyntheticWorkflowGraphOptions,
  type WorkflowGraphCameraScope,
} from "./workflow-graph-camera-scope";
import { rendererGraphFromWorkflowProjection } from "./workflow-graph-projection";
import { useWorkflowProjectionState } from "./workflow-graph-projection-state";
import { isWorkflowGraphRendererInitAbort } from "./workflow-graph-renderer-lifecycle";
import {
  mergeWorkflowAndSemanticGraphs,
  rendererGraphFromSemanticGraph,
  semanticNodeIdFromRendererNodeId,
} from "./semantic-graph-projection";
import { useSemanticGraphState } from "./semantic-graph-state";
import {
  selectedWorkflowProjectionNode,
  workflowNodeDetailsTarget,
  workflowSettingsTarget,
} from "./workflow-graph-targets";
import { toolbarDraftNodePosition, type WorkflowDraftNodePosition } from "./workflow-graph-toolbar";
import {
  WorkflowContextMenuLayer,
  WorkflowGraphEditorErrorLayer,
  WorkflowGraphStateLayers,
  WorkflowGraphToolbarLayer,
  WorkflowValidationLayer,
  type WorkflowContextMenuState,
} from "./workflow-graph-surface-layers";

export function WorkflowGraphSurface({
  debugEnabled,
  syntheticGraphFallback,
  surfaceId,
}: {
  debugEnabled: boolean;
  syntheticGraphFallback?: SyntheticWorkflowGraphOptions;
  surfaceId: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workflowMenuRef = useRef<HTMLDivElement>(null);
  const workflowCameraRef = useRef<WorkflowGraphCameraState | null>(null);
  const workflowCameraScopeRef = useRef<WorkflowGraphCameraScope | null>(null);
  const reactRenderCount = useRef(0);
  reactRenderCount.current += 1;
  const [workflowEditorError, setWorkflowEditorError] = useState("");
  const [workflowContextMenu, setWorkflowContextMenu] = useState<WorkflowContextMenuState | null>(
    null,
  );
  const [selectedWorkflowNodeId, setSelectedWorkflowNodeId] = useState<string | null>(null);
  const [selectedSemanticNodeId, setSelectedSemanticNodeId] = useState<string | null>(null);
  const [workflowValidation, setWorkflowValidation] = useState<WorkflowValidationResult | null>(
    null,
  );
  const [workflowOperation, setWorkflowOperation] = useState<"run" | "validate" | null>(null);
  const syntheticGraph =
    window.setta.app.flags.workflowGraphSyntheticGraph ?? syntheticGraphFallback ?? null;
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
  const setSelectedWorkflowSettingsTarget = useWorkflowEditorStore(
    (state) => state.setSelectedWorkflowSettingsTarget,
  );
  const setSelectedSemanticNodeTarget = useSemanticGraphStore(
    (state) => state.setSelectedNodeTarget,
  );
  const {
    error: workflowProjectionLoadError,
    loading: workflowProjectionLoading,
    noWorkspace: workflowProjectionHasNoWorkspace,
    projection: workflowProjection,
    ready: workflowProjectionReady,
    replaceWorkflowProjection,
    workspaceId: workflowWorkspaceId,
  } = useWorkflowProjectionState({
    definitionChangeSequence,
    selectedDefinitionIdsByWorkspaceId,
  });
  const workflowGraph = useMemo(
    () => rendererGraphForWorkflowProjection(workflowProjection, workflowValidation),
    [workflowProjection, workflowValidation],
  );
  const semanticGraphState = useSemanticGraphState();
  const semanticGraph = useMemo(
    () =>
      syntheticGraph === null && semanticGraphState.graph !== null
        ? rendererGraphFromSemanticGraph({
            semanticActivities: semanticGraphState.activitiesByNodeId,
            semanticGraph: semanticGraphState.graph,
            workflowGraph,
          })
        : undefined,
    [
      semanticGraphState.activitiesByNodeId,
      semanticGraphState.graph,
      syntheticGraph,
      workflowGraph,
    ],
  );
  const graph = useMemo(
    () =>
      workflowRendererGraphForSurface({
        semanticGraph,
        syntheticGraph,
        workflowGraph,
        workflowProjectionReady,
        workflowWorkspaceId,
      }),
    [semanticGraph, syntheticGraph, workflowGraph, workflowProjectionReady, workflowWorkspaceId],
  );
  const pendingApproval = useMemo(
    () => workflowProjectionPendingApproval(workflowProjection),
    [workflowProjection],
  );
  const selectedWorkflowNode = useMemo(
    () => selectedWorkflowProjectionNode(workflowProjection, selectedWorkflowNodeId),
    [selectedWorkflowNodeId, workflowProjection],
  );
  const loadingProjection =
    syntheticGraph === null && (workflowProjectionLoading || semanticGraphState.loading);
  const noWorkspace = syntheticGraph === null && workflowProjectionHasNoWorkspace;
  const workflowProjectionError =
    syntheticGraph === null
      ? [workflowProjectionLoadError, semanticGraphState.error].filter(Boolean).join("\n")
      : "";
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
          replaceWorkflowProjection(refreshed);
        }
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow graph edit failed",
        );
      }
    },
    [
      createWorkflowDefinition,
      replaceWorkflowProjection,
      syntheticGraph,
      workflowProjection,
      workflowWorkspaceId,
    ],
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
      if (syntheticGraph !== null) {
        return;
      }
      if (workflowEditorError !== "") {
        setWorkflowEditorError("");
      }
      await persistGraphNodePositions({
        positions,
        semanticGraph: semanticGraphState.graph,
        setWorkflowEditorError,
        updateSemanticLayoutPositions: semanticGraphState.replaceSemanticLayoutPositions,
        workflowProjection,
      });
    },
    [
      semanticGraphState.graph,
      semanticGraphState.replaceSemanticLayoutPositions,
      syntheticGraph,
      workflowEditorError,
      workflowProjection,
    ],
  );
  const addWorkflowDraftEdge = useCallback(
    async (connection: WorkflowGraphEdgeConnection) => {
      if (syntheticGraph !== null) {
        return;
      }
      if (workflowProjection === null) {
        setWorkflowEditorError("Create workflow nodes before connecting them");
        return;
      }
      if (!workflowProjection.editable) {
        setWorkflowEditorError("Select the draft workflow before editing the graph");
        return;
      }
      if (workflowEditorError !== "") {
        setWorkflowEditorError("");
      }
      setWorkflowValidation(null);
      try {
        const refreshed = await materializeWorkflowDraftEdge({
          connection,
          projection: workflowProjection,
        });
        replaceWorkflowProjection(refreshed);
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow edge edit failed",
        );
      }
    },
    [replaceWorkflowProjection, syntheticGraph, workflowEditorError, workflowProjection],
  );
  const deleteWorkflowDraftNodes = useCallback(
    async (nodeIds: string[]) => {
      if (syntheticGraph !== null || nodeIds.length === 0) {
        return;
      }
      if (nodeIds.every((nodeId) => semanticNodeIdFromRendererNodeId(nodeId) !== null)) {
        return;
      }
      if (workflowProjection === null) {
        setWorkflowEditorError("Select workflow nodes before deleting");
        return;
      }
      const workflowNodeIds = new Set(workflowProjection.nodes.map((node) => node.id));
      const nodeIdsToDelete = nodeIds.filter((nodeId) => workflowNodeIds.has(nodeId));
      if (nodeIdsToDelete.length === 0) {
        return;
      }
      if (!workflowProjection.editable) {
        setWorkflowEditorError("Select the draft workflow before deleting nodes");
        return;
      }
      setWorkflowEditorError("");
      setWorkflowValidation(null);
      try {
        const definition = await window.setta.workflow.readDefinition(
          workflowProjection.workspaceId,
          workflowProjection.definitionId,
        );
        const graph = workflowGraphWithoutDraftNodes(definition.graph, nodeIdsToDelete);
        const updated = await window.setta.workflow.updateDefinition(
          workflowProjection.workspaceId,
          definition.id,
          definition.name,
          definition.description,
          graph,
        );
        const refreshed = await workflowProjectionForDefinition(
          workflowProjection.workspaceId,
          updated.id,
        );
        replaceWorkflowProjection(refreshed);
        setSelectedWorkflowNodeId((selectedNodeId) =>
          selectedNodeId !== null && nodeIdsToDelete.includes(selectedNodeId)
            ? null
            : selectedNodeId,
        );
        setSelectedNodeTarget(null);
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow node delete failed",
        );
      }
    },
    [replaceWorkflowProjection, setSelectedNodeTarget, syntheticGraph, workflowProjection],
  );
  const validateWorkflowDraft = useCallback(async () => {
    if (syntheticGraph !== null) {
      return null;
    }
    if (workflowWorkspaceId === "") {
      setWorkflowEditorError("Open a workspace before validating a workflow");
      return null;
    }
    if (workflowProjection !== null && !workflowProjection.editable) {
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
    if (!workflowProjection.editable) {
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
      replaceWorkflowProjection(refreshed);
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow run failed");
    } finally {
      setWorkflowOperation(null);
    }
  }, [replaceWorkflowProjection, syntheticGraph, workflowProjection, workflowWorkspaceId]);
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
      replaceWorkflowProjection(refreshed);
      setWorkflowValidation(null);
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow draft load failed");
    }
  }, [replaceWorkflowProjection, workflowProjection]);
  const openSemanticNodeDetails = useCallback(
    (semanticNodeId: string) => {
      const node = semanticGraphState.graph?.nodes.find(
        (candidate) => candidate.id === semanticNodeId,
      );
      if (semanticGraphState.workspaceId === "" || node === undefined) {
        return;
      }
      setSelectedSemanticNodeTarget({
        nodeId: node.id,
        nodeKind: node.kind,
        nodeLabel: node.label,
        workspaceId: semanticGraphState.workspaceId,
      });
      requestWorkspacePaneOpen({
        surfaceKind: "semantic-node-details",
        subtitle: "semantic node details",
        title: "Semantic Node",
        tone: "orange",
        widthSpec: { unit: "px", value: 420 },
      });
    },
    [semanticGraphState.graph, semanticGraphState.workspaceId, setSelectedSemanticNodeTarget],
  );
  const openWorkflowNodeDetails = useCallback(
    (nodeId: string | null) => {
      if (workflowProjection === null || nodeId === null) {
        return;
      }
      setSelectedNodeTarget(workflowNodeDetailsTarget(workflowProjection, nodeId));
      requestWorkspacePaneOpen({
        surfaceKind: "workflow-node-details",
        subtitle: "workflow node details",
        title: "Workflow Node",
        tone: "cyan",
        widthSpec: { unit: "px", value: 380 },
      });
    },
    [setSelectedNodeTarget, workflowProjection],
  );
  const openGraphNodeDetails = useCallback(
    (rendererNodeId: string | null) => {
      if (rendererNodeId === null) {
        return;
      }
      const semanticNodeId = semanticNodeIdFromRendererNodeId(rendererNodeId);
      if (semanticNodeId !== null) {
        openSemanticNodeDetails(semanticNodeId);
        return;
      }
      openWorkflowNodeDetails(rendererNodeId);
    },
    [openSemanticNodeDetails, openWorkflowNodeDetails],
  );
  const openWorkflowSettings = useCallback(() => {
    if (workflowProjection === null) {
      return;
    }
    setSelectedWorkflowSettingsTarget(workflowSettingsTarget(workflowProjection));
    requestWorkspacePaneOpen({
      surfaceKind: "workflow-settings",
      subtitle: "workflow settings",
      title: "Workflow Settings",
      tone: "cyan",
      widthSpec: { unit: "px", value: 380 },
    });
  }, [setSelectedWorkflowSettingsTarget, workflowProjection]);
  const handleGraphNodeSelectionChange = useCallback((nodeIds: string[]) => {
    const selectedNodeId = nodeIds[0] ?? null;
    const semanticNodeId =
      selectedNodeId === null ? null : semanticNodeIdFromRendererNodeId(selectedNodeId);
    setSelectedSemanticNodeId(semanticNodeId);
    setSelectedWorkflowNodeId(semanticNodeId === null ? selectedNodeId : null);
  }, []);

  useEffect(() => {
    syncWorkflowGraphCameraScope({
      cameraRef: workflowCameraRef,
      scopeRef: workflowCameraScopeRef,
      surfaceId,
      syntheticGraph,
      workflowWorkspaceId,
    });
  }, [surfaceId, syntheticGraph, workflowWorkspaceId]);

  useEffect(() => {
    if (
      selectedWorkflowNodeId !== null &&
      !workflowProjection?.nodes.some((node) => node.id === selectedWorkflowNodeId)
    ) {
      setSelectedWorkflowNodeId(null);
    }
  }, [selectedWorkflowNodeId, workflowProjection]);

  useEffect(() => {
    if (
      selectedSemanticNodeId !== null &&
      !semanticGraphState.graph?.nodes.some((node) => node.id === selectedSemanticNodeId)
    ) {
      setSelectedSemanticNodeId(null);
    }
  }, [selectedSemanticNodeId, semanticGraphState.graph]);

  useEffect(() => {
    if (!graph) {
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.replaceChildren();
    const abortController = new AbortController();
    let disposed = false;
    let rendererHandle: WorkflowGraphRenderer | null = null;
    const destroyRenderer = () => {
      if (rendererHandle === null) {
        return;
      }
      workflowCameraRef.current = rendererHandle.cameraState();
      writeWorkflowGraphCameraState(
        surfaceId,
        workflowCameraScopeRef.current,
        workflowCameraRef.current,
      );
      rendererHandle.destroy();
      rendererHandle = null;
    };

    void import("./pixi-renderer")
      .then(async ({ createWorkflowGraphRenderer }) => {
        if (disposed) {
          return;
        }
        const renderer = await createWorkflowGraphRenderer({
          abortSignal: abortController.signal,
          debugEnabled,
          debugSurfaceId: surfaceId,
          graph,
          host,
          initialCameraState: workflowCameraRef.current,
          onCanvasContextMenu: syntheticGraph === null ? openWorkflowContextMenu : undefined,
          onCameraStateChange: (camera) => {
            workflowCameraRef.current = camera;
            writeWorkflowGraphCameraState(surfaceId, workflowCameraScopeRef.current, camera);
          },
          onEdgeCreate:
            syntheticGraph === null ? (edge) => void addWorkflowDraftEdge(edge) : undefined,
          onNodeDelete:
            syntheticGraph === null
              ? (nodeIds) => void deleteWorkflowDraftNodes(nodeIds)
              : undefined,
          onNodeOpen:
            syntheticGraph === null ? (nodeId) => openGraphNodeDetails(nodeId) : undefined,
          onNodePositionsChange: (positions) => {
            void persistNodePositions(positions);
          },
          onNodeSelectionChange:
            syntheticGraph === null ? handleGraphNodeSelectionChange : undefined,
          reactRenderCount: () => reactRenderCount.current,
        });
        if (disposed) {
          renderer.destroy();
          return;
        }
        rendererHandle = renderer;
      })
      .catch((error: unknown) => {
        if (isWorkflowGraphRendererInitAbort(error)) {
          return;
        }
        console.error("Failed to initialize workflow graph surface", error);
      });

    return () => {
      disposed = true;
      abortController.abort();
      destroyRenderer();
      host.replaceChildren();
    };
  }, [
    debugEnabled,
    graph,
    addWorkflowDraftEdge,
    deleteWorkflowDraftNodes,
    handleGraphNodeSelectionChange,
    openWorkflowContextMenu,
    openGraphNodeDetails,
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
    <section
      className="workspace-workflow-graph-surface"
      data-testid="workspace-workflow-graph-surface"
    >
      <div
        ref={hostRef}
        className="workspace-workflow-graph-host"
        data-surface-id={surfaceId}
        data-testid="workflow-graph"
      />
      <WorkflowGraphToolbarLayer
        addWorkflowDraftNodeFromToolbar={addWorkflowDraftNodeFromToolbar}
        openWorkflowNodeDetails={openWorkflowNodeDetails}
        openWorkflowSettings={openWorkflowSettings}
        runWorkflowDraft={runWorkflowDraft}
        selectedWorkflowNodeId={selectedWorkflowNodeId}
        selectedWorkflowNodeLabel={selectedWorkflowNode?.label ?? ""}
        showDraftWorkflow={showDraftWorkflow}
        syntheticGraph={syntheticGraph}
        validateWorkflowDraft={validateWorkflowDraft}
        workflowOperation={workflowOperation}
        workflowProjection={workflowProjection}
        workflowProjectionReady={workflowProjectionReady}
        workflowValidation={workflowValidation}
        workflowWorkspaceId={workflowWorkspaceId}
      />
      <WorkflowGraphStateLayers
        loadingProjection={loadingProjection}
        noWorkspace={noWorkspace}
        semanticEmpty={semanticGraphIsEmpty({
          semanticGraph: semanticGraphState.graph,
          semanticReady: semanticGraphState.ready,
          workflowGraph,
        })}
        workflowProjectionError={workflowProjectionError}
      />
      <WorkflowValidationLayer workflowValidation={workflowValidation} />
      <WorkflowContextMenuLayer
        addWorkflowDraftNode={addWorkflowDraftNode}
        workflowContextMenu={workflowContextMenu}
        workflowMenuRef={workflowMenuRef}
      />
      <WorkflowGraphEditorErrorLayer message={workflowEditorError} />
      <WorkflowApprovalOverlay
        pendingApproval={pendingApproval}
        projection={workflowProjection}
        setWorkflowProjection={replaceWorkflowProjection}
      />
    </section>
  );
}

type CreateWorkflowDefinition = (
  workspaceId: string,
  name?: string,
  graph?: WorkflowGraph,
) => Promise<WorkflowDefinition>;
type WorkflowGraphRendererGraph = WorkflowGraphGraph;

function rendererGraphForWorkflowProjection(
  projection: WorkflowGraphProjection | null,
  validation: WorkflowValidationResult | null,
) {
  if (projection === null) {
    return undefined;
  }
  return rendererGraphFromWorkflowProjection(projection, validation);
}

function semanticGraphIsEmpty({
  semanticGraph,
  semanticReady,
  workflowGraph,
}: {
  semanticGraph: SemanticGraph | null;
  semanticReady: boolean;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
}) {
  return (
    semanticReady &&
    semanticGraph !== null &&
    semanticGraph.nodes.length === 0 &&
    (workflowGraph === undefined || workflowGraph.nodes.length === 0)
  );
}

function workflowRendererGraphForSurface({
  semanticGraph,
  syntheticGraph,
  workflowGraph,
  workflowProjectionReady,
  workflowWorkspaceId,
}: {
  semanticGraph: WorkflowGraphRendererGraph | undefined;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowProjectionReady: boolean;
  workflowWorkspaceId: string;
}) {
  if (syntheticGraph) {
    return createSyntheticWorkflowGraph(syntheticGraph);
  }
  const merged = mergeWorkflowAndSemanticGraphs({ semanticGraph, workflowGraph });
  if (merged) {
    return merged;
  }
  if (workflowGraph) {
    return workflowGraph;
  }
  if (workflowProjectionReady && workflowWorkspaceId !== "") {
    return emptyWorkflowRendererGraph();
  }
  return undefined;
}

function workflowProjectionPendingApproval(projection: WorkflowGraphProjection | null) {
  if (projection === null) {
    return null;
  }
  return pendingWorkflowApproval(projection);
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
  if (projection !== null && !projection.editable) {
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

function emptyWorkflowRendererGraph() {
  return {
    edges: [],
    nodes: [],
    workflow: null,
  };
}
