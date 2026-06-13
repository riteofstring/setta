import type { WorkflowGraphProjection, WorkflowValidationResult } from "@generated/backend";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import { useWorkflowEditorStore } from "../../stores/workflow-editor-store";
import { requestWorkspacePaneOpen } from "../../workspace-layout/open-pane-events";
import { useSemanticGraphStore } from "../../stores/semantic-graph-store";
import {
  emptyWorkflowGraph,
  workflowGraphWithoutDraftNodes,
  type WorkflowDraftNodeType,
} from "./workflow-graph-draft";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";
import { persistGraphNodePositions } from "./workflow-graph-layout-persistence";
import type {
  WorkflowGraphCameraState,
  WorkflowGraphEdgeConnection,
  WorkflowGraphRenderer,
  WorkflowGraphRendererHandlers,
} from "./pixi-renderer";
import { WorkflowApprovalOverlay } from "./workflow-approval-overlay";
import {
  syncWorkflowGraphCameraScope,
  writeWorkflowGraphCameraState,
  type SyntheticWorkflowGraphOptions,
  type WorkflowGraphCameraScope,
} from "./workflow-graph-camera-scope";
import { useWorkflowProjectionState } from "./workflow-graph-projection-state";
import { workflowRendererHandlersForSurface } from "./workflow-graph-renderer-handlers";
import { isWorkflowGraphRendererInitAbort } from "./workflow-graph-renderer-lifecycle";
import {
  workflowGraphStateForSurface,
  workflowSyntheticGraphForSurface,
} from "./workflow-graph-surface-state";
import {
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
import {
  materializeWorkflowDraftEdge,
  materializeWorkflowDraftNode,
  rendererGraphForWorkflowProjection,
  semanticGraphIsEmpty,
  workflowProjectionForDefinition,
  workflowProjectionForExecution,
  workflowProjectionPendingApproval,
  workflowProjectionWithLayoutPositions,
  workflowRendererGraphForSurface,
  workflowRendererScopeKey,
  workflowRunDraftPreflightMessage,
  workflowValidationForDraftProjection,
  type WorkflowGraphRendererGraph,
} from "./workflow-graph-surface-helpers";

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
  const workflowRendererRef = useRef<WorkflowGraphRenderer | null>(null);
  const pendingWorkflowGraphRef = useRef<WorkflowGraphRendererGraph | null>(null);
  const reactRenderCount = useRef(0);
  reactRenderCount.current += 1;
  const [workflowEditorError, setWorkflowEditorError] = useState("");
  const [workflowContextMenu, setWorkflowContextMenu] = useState<WorkflowContextMenuState | null>(
    null,
  );
  const [selectedWorkflowNodeId, setSelectedWorkflowNodeId] = useState<string | null>(null);
  const [selectedSemanticNodeId, setSelectedSemanticNodeId] = useState<string | null>(null);
  const [workflowValidationFallback, setWorkflowValidationFallback] =
    useState<WorkflowValidationResult | null>(null);
  const [workflowOperation, setWorkflowOperation] = useState<"run" | "validate" | null>(null);
  const workflowProjectionRef = useRef<WorkflowGraphProjection | null>(null);
  const layoutSaveQueueRef = useRef<Promise<WorkflowGraphProjection | null>>(Promise.resolve(null));
  const layoutSaveSequenceRef = useRef(0);
  const syntheticGraph = workflowSyntheticGraphForSurface(syntheticGraphFallback);
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
  workflowProjectionRef.current = workflowProjection;
  const workflowValidation = useMemo(
    () => workflowValidationForDraftProjection(workflowProjection) ?? workflowValidationFallback,
    [workflowProjection, workflowValidationFallback],
  );
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
  pendingWorkflowGraphRef.current = graph ?? null;
  const rendererGraphReady = graph !== undefined;
  const rendererScopeKey = workflowRendererScopeKey(syntheticGraph, workflowWorkspaceId);
  const pendingApproval = useMemo(
    () => workflowProjectionPendingApproval(workflowProjection),
    [workflowProjection],
  );
  const selectedWorkflowNode = useMemo(
    () => selectedWorkflowProjectionNode(workflowProjection, selectedWorkflowNodeId),
    [selectedWorkflowNodeId, workflowProjection],
  );
  const { loadingProjection, noWorkspace, workflowProjectionError } = workflowGraphStateForSurface({
    semanticGraphError: semanticGraphState.error,
    semanticGraphLoading: semanticGraphState.loading,
    syntheticGraph,
    workflowProjectionHasNoWorkspace,
    workflowProjectionLoadError,
    workflowProjectionLoading,
  });
  const openWorkflowContextMenu = useCallback((menu: WorkflowContextMenuState) => {
    setWorkflowContextMenu(menu);
  }, []);
  const addWorkflowDraftNodeAt = useCallback(
    async (nodeType: WorkflowDraftNodeType, position: WorkflowDraftNodePosition) => {
      setWorkflowEditorError("");
      setWorkflowValidationFallback(null);
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
        setWorkflowValidationFallback(null);
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
      const optimisticProjection = workflowProjectionWithLayoutPositions(
        workflowProjectionRef.current,
        positions,
      );
      if (optimisticProjection !== null) {
        replaceWorkflowProjection(optimisticProjection);
      }
      const projectionAtDragEnd = workflowProjectionRef.current;
      const saveSequence = layoutSaveSequenceRef.current + 1;
      layoutSaveSequenceRef.current = saveSequence;
      const save = layoutSaveQueueRef.current
        .catch(() => null)
        .then(async () => {
          const refreshed = await persistGraphNodePositions({
            positions,
            semanticGraph: semanticGraphState.graph,
            setWorkflowEditorError,
            updateSemanticLayoutPositions: semanticGraphState.replaceSemanticLayoutPositions,
            workflowProjection: projectionAtDragEnd,
          });
          if (refreshed !== null && saveSequence === layoutSaveSequenceRef.current) {
            replaceWorkflowProjection(refreshed);
          }
          return refreshed;
        });
      layoutSaveQueueRef.current = save;
      await save;
    },
    [
      replaceWorkflowProjection,
      semanticGraphState.graph,
      semanticGraphState.replaceSemanticLayoutPositions,
      syntheticGraph,
      workflowEditorError,
    ],
  );
  const flushPendingWorkflowGraphWrites = useCallback(async () => {
    const refreshed = await layoutSaveQueueRef.current;
    if (refreshed !== null) {
      replaceWorkflowProjection(refreshed);
    }
  }, [replaceWorkflowProjection]);
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
      setWorkflowValidationFallback(null);
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
      setWorkflowValidationFallback(null);
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
      await flushPendingWorkflowGraphWrites();
      const currentProjection = workflowProjectionRef.current;
      if (currentProjection === null) {
        const result = await window.setta.workflow.validateDefinition(
          workflowWorkspaceId,
          emptyWorkflowGraph(),
        );
        setWorkflowValidationFallback(result);
        return result;
      }
      const refreshed = await window.setta.workflow.validateDefinitionDraft({
        definitionId: currentProjection.definitionId,
        workspaceId: currentProjection.workspaceId,
      });
      replaceWorkflowProjection(refreshed);
      setWorkflowValidationFallback(null);
      const result = workflowValidationForDraftProjection(refreshed);
      return result;
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow validation failed");
      return null;
    } finally {
      setWorkflowOperation(null);
    }
  }, [
    flushPendingWorkflowGraphWrites,
    replaceWorkflowProjection,
    syntheticGraph,
    workflowProjection,
    workflowWorkspaceId,
  ]);
  const runWorkflowDraft = useCallback(async () => {
    const preflight = workflowRunDraftPreflightMessage({
      projection: workflowProjection,
      syntheticGraphEnabled: syntheticGraph !== null,
      workspaceId: workflowWorkspaceId,
    });
    if (preflight === "skip") {
      return;
    }
    if (preflight !== null) {
      setWorkflowEditorError(preflight);
      return;
    }
    setWorkflowOperation("run");
    setWorkflowEditorError("");
    try {
      await flushPendingWorkflowGraphWrites();
      const currentProjection = workflowProjectionRef.current;
      if (currentProjection === null) {
        setWorkflowEditorError("Add a workflow node before running");
        return;
      }
      const validated = await window.setta.workflow.validateDefinitionDraft({
        definitionId: currentProjection.definitionId,
        workspaceId: currentProjection.workspaceId,
      });
      replaceWorkflowProjection(validated);
      setWorkflowValidationFallback(null);
      const validation = workflowValidationForDraftProjection(validated);
      if (validation === null || !validation.valid) {
        return;
      }
      const execution = await window.setta.workflow.startExecution(
        currentProjection.workspaceId,
        currentProjection.definitionId,
      );
      const refreshed = await workflowProjectionForExecution(
        currentProjection.workspaceId,
        currentProjection.definitionId,
        execution.definitionVersionId,
        execution.id,
      );
      replaceWorkflowProjection(refreshed);
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow run failed");
    } finally {
      setWorkflowOperation(null);
    }
  }, [
    flushPendingWorkflowGraphWrites,
    replaceWorkflowProjection,
    syntheticGraph,
    workflowProjection,
    workflowWorkspaceId,
  ]);
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
      setWorkflowValidationFallback(null);
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
  const rendererHandlers = useMemo<WorkflowGraphRendererHandlers>(
    () =>
      workflowRendererHandlersForSurface({
        addWorkflowDraftEdge,
        deleteWorkflowDraftNodes,
        handleGraphNodeSelectionChange,
        openGraphNodeDetails,
        openWorkflowContextMenu,
        persistNodePositions,
        reactRenderCount,
        surfaceId,
        syntheticGraph,
        workflowCameraRef,
        workflowCameraScopeRef,
      }),
    [
      addWorkflowDraftEdge,
      deleteWorkflowDraftNodes,
      handleGraphNodeSelectionChange,
      openGraphNodeDetails,
      openWorkflowContextMenu,
      persistNodePositions,
      surfaceId,
      syntheticGraph,
    ],
  );
  const rendererHandlersRef = useRef<WorkflowGraphRendererHandlers>(rendererHandlers);
  rendererHandlersRef.current = rendererHandlers;

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
    workflowRendererRef.current?.setHandlers(rendererHandlers);
  }, [rendererHandlers]);

  useEffect(() => {
    if (!graph) {
      return;
    }
    workflowRendererRef.current?.updateGraph(graph);
  }, [graph]);

  useEffect(() => {
    if (!rendererGraphReady) {
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const initialGraph = pendingWorkflowGraphRef.current;
    if (initialGraph === null) {
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
      if (workflowRendererRef.current === rendererHandle) {
        workflowRendererRef.current = null;
      }
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
          graph: initialGraph,
          host,
          initialCameraState: workflowCameraRef.current,
          ...rendererHandlersRef.current,
        });
        if (disposed) {
          renderer.destroy();
          return;
        }
        rendererHandle = renderer;
        workflowRendererRef.current = renderer;
        renderer.setHandlers(rendererHandlersRef.current);
        const pendingGraph = pendingWorkflowGraphRef.current;
        if (pendingGraph !== null && pendingGraph !== initialGraph) {
          renderer.updateGraph(pendingGraph);
        }
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
  }, [debugEnabled, rendererGraphReady, rendererScopeKey, surfaceId]);

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
