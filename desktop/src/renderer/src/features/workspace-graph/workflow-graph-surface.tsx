import type { WorkflowGraphProjection, WorkflowValidationResult } from "@generated/backend";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import { useWorkflowEditorStore } from "../../stores/workflow-editor-store";
import { requestWorkspacePaneOpen } from "../../workspace-layout/open-pane-events";
import { subscribeWorkspaceSurfaceResumed } from "../../workspace-layout/surface-lifecycle-events";
import { useSemanticGraphStore } from "../../stores/semantic-graph-store";
import { emptyWorkflowGraph, type WorkflowDraftNodeType } from "./workflow-graph-draft";
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
  workflowGraphAnimationSettingsForSurface,
  workflowGraphStateForSurface,
  workflowSyntheticGraphForSurface,
} from "./workflow-graph-surface-state";
import {
  rendererGraphFromSemanticGraph,
  semanticNodeIdFromRendererNodeId,
  semanticRendererNodeId,
} from "./semantic-graph-projection";
import { useSemanticGraphState } from "./semantic-graph-state";
import { useSemanticLayoutOverlay } from "./workflow-graph-semantic-layout-overlay";
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
  const [selectedWorkflowEdgeId, setSelectedWorkflowEdgeId] = useState<string | null>(null);
  const [selectedSemanticNodeId, setSelectedSemanticNodeId] = useState<string | null>(null);
  const [workflowValidationFallback, setWorkflowValidationFallback] =
    useState<WorkflowValidationResult | null>(null);
  const [workflowOperation, setWorkflowOperation] = useState<"run" | "validate" | null>(null);
  const workflowProjectionRef = useRef<WorkflowGraphProjection | null>(null);
  const workflowGraphWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const layoutSaveSequenceRef = useRef(0);
  const syntheticGraph = workflowSyntheticGraphForSurface(syntheticGraphFallback);
  const graphAnimationSettings = workflowGraphAnimationSettingsForSurface();
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
  const applyWorkflowProjection = useCallback(
    (projection: WorkflowGraphProjection | null) => {
      workflowProjectionRef.current = projection;
      replaceWorkflowProjection(projection);
    },
    [replaceWorkflowProjection],
  );
  const enqueueWorkflowGraphWrite = useCallback(
    (write: () => Promise<WorkflowGraphProjection | null>) => {
      const queued = workflowGraphWriteQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const refreshed = await write();
          if (refreshed !== null) {
            applyWorkflowProjection(refreshed);
          }
          return refreshed;
        });
      workflowGraphWriteQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [applyWorkflowProjection],
  );
  const workflowValidation = useMemo(
    () => workflowValidationForDraftProjection(workflowProjection) ?? workflowValidationFallback,
    [workflowProjection, workflowValidationFallback],
  );
  const workflowGraph = useMemo(
    () => rendererGraphForWorkflowProjection(workflowProjection, workflowValidation),
    [workflowProjection, workflowValidation],
  );
  const semanticGraphState = useSemanticGraphState();
  const {
    clearPersistedSemanticLayout,
    preparePendingSemanticLayout,
    semanticGraphWithLocalLayout,
  } = useSemanticLayoutOverlay({
    semanticGraph: semanticGraphState.graph,
    workspaceId: semanticGraphState.workspaceId,
  });
  const semanticGraph = useMemo(
    () =>
      syntheticGraph === null && semanticGraphWithLocalLayout !== null
        ? rendererGraphFromSemanticGraph({
            semanticActivities: semanticGraphState.activitiesByNodeId,
            semanticGraph: semanticGraphWithLocalLayout,
            semanticWorkingSet: semanticGraphState.workingSet,
            workflowGraph,
          })
        : undefined,
    [
      semanticGraphState.activitiesByNodeId,
      semanticGraphState.workingSet,
      semanticGraphWithLocalLayout,
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
  const selectedSemanticNode = useMemo(
    () =>
      selectedSemanticNodeId === null
        ? null
        : (semanticGraphState.graph?.nodes.find((node) => node.id === selectedSemanticNodeId) ??
          null),
    [selectedSemanticNodeId, semanticGraphState.graph],
  );
  const selectedGraphNodeId =
    selectedSemanticNodeId === null
      ? selectedWorkflowNodeId
      : semanticRendererNodeId(selectedSemanticNodeId);
  const selectedGraphNodeLabel = selectedSemanticNode?.label ?? selectedWorkflowNode?.label ?? "";
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
        await enqueueWorkflowGraphWrite(() =>
          materializeWorkflowDraftNode({
            createWorkflowDefinition,
            nodeType,
            position,
            projection: workflowProjectionRef.current,
            syntheticGraphEnabled: syntheticGraph !== null,
            workspaceId: workflowWorkspaceId,
          }),
        );
        setWorkflowValidationFallback(null);
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow graph edit failed",
        );
      }
    },
    [createWorkflowDefinition, enqueueWorkflowGraphWrite, syntheticGraph, workflowWorkspaceId],
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
      const saveSequence = layoutSaveSequenceRef.current + 1;
      layoutSaveSequenceRef.current = saveSequence;
      const semanticGraphAtDragEnd = semanticGraphState.graph;
      const semanticLayoutInputs = preparePendingSemanticLayout(positions, saveSequence);
      const optimisticProjection = workflowProjectionWithLayoutPositions(
        workflowProjectionRef.current,
        positions,
      );
      if (optimisticProjection !== null) {
        applyWorkflowProjection(optimisticProjection);
      }
      const projectionAtDragEnd = workflowProjectionRef.current;
      const save = enqueueWorkflowGraphWrite(async () => {
        let semanticLayoutPersisted = false;
        const refreshed = await persistGraphNodePositions({
          positions,
          semanticGraph: semanticGraphAtDragEnd,
          setWorkflowEditorError,
          updateSemanticLayoutPositions: (savedPositions) => {
            semanticLayoutPersisted = true;
            semanticGraphState.replaceSemanticLayoutPositions(savedPositions);
          },
          workflowProjection: workflowProjectionRef.current ?? projectionAtDragEnd,
        });
        if (semanticLayoutPersisted) {
          clearPersistedSemanticLayout(semanticLayoutInputs, saveSequence);
        }
        if (refreshed !== null && saveSequence === layoutSaveSequenceRef.current) {
          return refreshed;
        }
        return null;
      });
      await save;
    },
    [
      applyWorkflowProjection,
      enqueueWorkflowGraphWrite,
      clearPersistedSemanticLayout,
      preparePendingSemanticLayout,
      semanticGraphState.graph,
      semanticGraphState.replaceSemanticLayoutPositions,
      syntheticGraph,
      workflowEditorError,
    ],
  );
  const flushPendingWorkflowGraphWrites = useCallback(async () => {
    await workflowGraphWriteQueueRef.current;
  }, []);
  const refreshCurrentDraftProjection = useCallback(async () => {
    if (syntheticGraph !== null) {
      return;
    }
    const currentProjection = workflowProjectionRef.current;
    if (
      currentProjection === null ||
      currentProjection.viewMode !== "draft" ||
      currentProjection.definitionId === ""
    ) {
      return;
    }
    const refreshed = await workflowProjectionForDefinition(
      currentProjection.workspaceId,
      currentProjection.definitionId,
    );
    applyWorkflowProjection(refreshed);
    setWorkflowValidationFallback(null);
  }, [applyWorkflowProjection, syntheticGraph]);
  const addWorkflowDraftEdge = useCallback(
    async (connection: WorkflowGraphEdgeConnection) => {
      if (syntheticGraph !== null) {
        return;
      }
      const currentProjection = workflowProjectionRef.current;
      if (currentProjection === null) {
        setWorkflowEditorError("Create workflow nodes before connecting them");
        return;
      }
      if (!currentProjection.editable) {
        setWorkflowEditorError("Select the draft workflow before editing the graph");
        return;
      }
      if (workflowEditorError !== "") {
        setWorkflowEditorError("");
      }
      setWorkflowValidationFallback(null);
      try {
        await enqueueWorkflowGraphWrite(() => {
          const currentProjection = workflowProjectionRef.current;
          if (currentProjection === null) {
            throw new Error("Create workflow nodes before connecting them");
          }
          if (!currentProjection.editable) {
            throw new Error("Select the draft workflow before editing the graph");
          }
          return materializeWorkflowDraftEdge({
            connection,
            projection: currentProjection,
          });
        });
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow edge edit failed",
        );
      }
    },
    [enqueueWorkflowGraphWrite, syntheticGraph, workflowEditorError],
  );
  const deleteWorkflowDraftNodes = useCallback(
    async (nodeIds: string[]) => {
      if (syntheticGraph !== null || nodeIds.length === 0) {
        return;
      }
      if (nodeIds.every((nodeId) => semanticNodeIdFromRendererNodeId(nodeId) !== null)) {
        return;
      }
      const projectionForDelete = workflowProjectionRef.current;
      if (projectionForDelete === null) {
        setWorkflowEditorError("Select workflow nodes before deleting");
        return;
      }
      const workflowNodeIds = new Set(projectionForDelete.nodes.map((node) => node.id));
      const nodeIdsToDelete = nodeIds.filter((nodeId) => workflowNodeIds.has(nodeId));
      if (nodeIdsToDelete.length === 0) {
        return;
      }
      if (!projectionForDelete.editable) {
        setWorkflowEditorError("Select the draft workflow before deleting nodes");
        return;
      }
      setWorkflowEditorError("");
      setWorkflowValidationFallback(null);
      try {
        await enqueueWorkflowGraphWrite(() => {
          const currentProjection = workflowProjectionRef.current;
          if (currentProjection === null) {
            throw new Error("Select workflow nodes before deleting");
          }
          if (!currentProjection.editable) {
            throw new Error("Select the draft workflow before deleting nodes");
          }
          return window.setta.workflow.deleteNodes({
            definitionId: currentProjection.definitionId,
            expectedRevision: currentProjection.draftRevision,
            nodeIds: nodeIdsToDelete,
            workspaceId: currentProjection.workspaceId,
          });
        });
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
    [enqueueWorkflowGraphWrite, setSelectedNodeTarget, syntheticGraph],
  );
  const deleteWorkflowDraftEdges = useCallback(
    async (edgeIds: string[]) => {
      if (syntheticGraph !== null || edgeIds.length === 0) {
        return;
      }
      const projectionForDelete = workflowProjectionRef.current;
      if (projectionForDelete === null) {
        setWorkflowEditorError("Select workflow edges before deleting");
        return;
      }
      const workflowEdgeIds = new Set(projectionForDelete.edges.map((edge) => edge.id));
      const edgeIdsToDelete = edgeIds.filter((edgeId) => workflowEdgeIds.has(edgeId));
      if (edgeIdsToDelete.length === 0) {
        return;
      }
      if (!projectionForDelete.editable) {
        setWorkflowEditorError("Select the draft workflow before deleting edges");
        return;
      }
      setWorkflowEditorError("");
      setWorkflowValidationFallback(null);
      try {
        await enqueueWorkflowGraphWrite(() => {
          const currentProjection = workflowProjectionRef.current;
          if (currentProjection === null) {
            throw new Error("Select workflow edges before deleting");
          }
          if (!currentProjection.editable) {
            throw new Error("Select the draft workflow before deleting edges");
          }
          return window.setta.workflow.deleteEdges({
            definitionId: currentProjection.definitionId,
            edgeIds: edgeIdsToDelete,
            expectedRevision: currentProjection.draftRevision,
            workspaceId: currentProjection.workspaceId,
          });
        });
        setSelectedWorkflowEdgeId((selectedEdgeId) =>
          selectedEdgeId !== null && edgeIdsToDelete.includes(selectedEdgeId)
            ? null
            : selectedEdgeId,
        );
      } catch (error: unknown) {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow edge delete failed",
        );
      }
    },
    [enqueueWorkflowGraphWrite, syntheticGraph],
  );
  const validateWorkflowDraft = useCallback(async () => {
    if (syntheticGraph !== null) {
      return null;
    }
    if (workflowWorkspaceId === "") {
      setWorkflowEditorError("Open a workspace before validating a workflow");
      return null;
    }
    const projectionForValidation = workflowProjectionRef.current;
    if (projectionForValidation !== null && !projectionForValidation.editable) {
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
        expectedRevision: currentProjection.draftRevision,
        workspaceId: currentProjection.workspaceId,
      });
      applyWorkflowProjection(refreshed);
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
    applyWorkflowProjection,
    syntheticGraph,
    workflowWorkspaceId,
  ]);
  const runWorkflowDraft = useCallback(async () => {
    const projectionForRun = workflowProjectionRef.current;
    const preflight = workflowRunDraftPreflightMessage({
      projection: projectionForRun,
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
        expectedRevision: currentProjection.draftRevision,
        workspaceId: currentProjection.workspaceId,
      });
      applyWorkflowProjection(validated);
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
      applyWorkflowProjection(refreshed);
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow run failed");
    } finally {
      setWorkflowOperation(null);
    }
  }, [
    flushPendingWorkflowGraphWrites,
    applyWorkflowProjection,
    syntheticGraph,
    workflowWorkspaceId,
  ]);
  useEffect(() => {
    if (!window.setta.app.flags.workflowGraphDebug) {
      return;
    }
    const callbacks = window.__settaWorkflowGraphRunDrafts ?? new Map();
    window.__settaWorkflowGraphRunDrafts = callbacks;
    const runWorkflowDraftForDebug = async () => {
      await runWorkflowDraft();
      const projection = workflowProjectionRef.current;
      return {
        definitionId: projection?.definitionId ?? "",
        executionId: projection?.executionId ?? "",
        viewMode: projection?.viewMode ?? "",
        workspaceId: projection?.workspaceId ?? "",
      };
    };
    callbacks.set(surfaceId, runWorkflowDraftForDebug);
    return () => {
      if (callbacks.get(surfaceId) === runWorkflowDraftForDebug) {
        callbacks.delete(surfaceId);
      }
      if (callbacks.size === 0 && window.__settaWorkflowGraphRunDrafts === callbacks) {
        delete window.__settaWorkflowGraphRunDrafts;
      }
    };
  }, [runWorkflowDraft, surfaceId]);
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
      applyWorkflowProjection(refreshed);
      setWorkflowValidationFallback(null);
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow draft load failed");
    }
  }, [applyWorkflowProjection, workflowProjection]);
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
      const runtime =
        pendingWorkflowGraphRef.current?.nodes.find((node) => node.id === nodeId)?.runtime ?? null;
      setSelectedNodeTarget(workflowNodeDetailsTarget(workflowProjection, nodeId, runtime));
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
    if (selectedNodeId !== null) {
      setSelectedWorkflowEdgeId(null);
    }
  }, []);
  const handleGraphEdgeSelectionChange = useCallback((edgeIds: string[]) => {
    const selectedEdgeId = edgeIds[0] ?? null;
    setSelectedWorkflowEdgeId(selectedEdgeId);
    if (selectedEdgeId !== null) {
      setSelectedSemanticNodeId(null);
      setSelectedWorkflowNodeId(null);
    }
  }, []);
  const rendererHandlers = useMemo<WorkflowGraphRendererHandlers>(
    () =>
      workflowRendererHandlersForSurface({
        addWorkflowDraftEdge,
        deleteWorkflowDraftEdges,
        deleteWorkflowDraftNodes,
        handleGraphEdgeSelectionChange,
        handleGraphNodeSelectionChange,
        noteSemanticRuntimeCameraMovement: semanticGraphState.runtimeStore?.noteCameraMovement,
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
      deleteWorkflowDraftEdges,
      deleteWorkflowDraftNodes,
      handleGraphEdgeSelectionChange,
      handleGraphNodeSelectionChange,
      openGraphNodeDetails,
      openWorkflowContextMenu,
      persistNodePositions,
      semanticGraphState.runtimeStore,
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
    return subscribeWorkspaceSurfaceResumed((event) => {
      if (event.surfaceKind !== "workflow-graph" || event.surfaceId !== surfaceId) {
        return;
      }
      void refreshCurrentDraftProjection().catch((error: unknown) => {
        setWorkflowEditorError(
          error instanceof Error ? error.message : "Workflow draft refresh failed",
        );
      });
    });
  }, [refreshCurrentDraftProjection, surfaceId]);

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
      selectedWorkflowEdgeId !== null &&
      !workflowProjection?.edges.some((edge) => edge.id === selectedWorkflowEdgeId)
    ) {
      setSelectedWorkflowEdgeId(null);
    }
  }, [selectedWorkflowEdgeId, workflowProjection]);

  useEffect(() => {
    if (
      selectedSemanticNodeId !== null &&
      semanticGraphState.graph !== null &&
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
          animationEnabled: graphAnimationSettings.animationEnabled,
          debugEnabled,
          debugSurfaceId: surfaceId,
          graph: initialGraph,
          host,
          initialCameraState: workflowCameraRef.current,
          reduceMotion: graphAnimationSettings.reduceMotion,
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
  }, [
    debugEnabled,
    graphAnimationSettings.animationEnabled,
    graphAnimationSettings.reduceMotion,
    rendererGraphReady,
    rendererScopeKey,
    surfaceId,
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
        debugEnabled={debugEnabled}
        openGraphNodeDetails={openGraphNodeDetails}
        openWorkflowSettings={openWorkflowSettings}
        runWorkflowDraft={runWorkflowDraft}
        selectedGraphNodeId={selectedGraphNodeId}
        selectedGraphNodeLabel={selectedGraphNodeLabel}
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
      <WorkflowContextMenuLayer
        addWorkflowDraftNode={addWorkflowDraftNode}
        workflowContextMenu={workflowContextMenu}
        workflowMenuRef={workflowMenuRef}
      />
      <WorkflowGraphEditorErrorLayer message={workflowEditorError} />
      <WorkflowApprovalOverlay
        pendingApproval={pendingApproval}
        projection={workflowProjection}
        setWorkflowProjection={applyWorkflowProjection}
      />
    </section>
  );
}
