import type { WorkflowGraphProjection, WorkflowValidationResult } from "@generated/backend";
import { Profiler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import { useWorkflowEditorStore } from "../../stores/workflow-editor-store";
import { requestWorkspacePaneOpen } from "../../workspace-layout/open-pane-events";
import { subscribeWorkspaceSurfaceResumed } from "../../workspace-layout/surface-lifecycle-events";
import { useWorkflowContextMenuClose } from "./workflow-context-menu-close";
import { useWorkflowGraphDebugRunDraftRegistration } from "./workflow-graph-debug-run-draft";
import { emptyWorkflowGraph, type WorkflowDraftNodeType } from "./workflow-graph-draft";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";
import { useWorkflowLayoutOverlay } from "./workflow-graph-layout-overlay";
import {
  graphNodeLayoutPersistenceErrorMessage,
  persistGraphNodePositions,
  type GraphNodeLayoutPersistenceOutcome,
} from "./workflow-graph-layout-persistence";
import {
  recordSupersededWorkflowGraphLayoutSave,
  recordWorkflowGraphLayoutSaveOutcome,
  startWorkflowGraphLayoutSaveRecording,
} from "./workflow-graph-layout-save-recording";
import type {
  WorkflowGraphCameraState,
  WorkflowGraphEdgeConnection,
  WorkflowGraphRendererHandlers,
} from "./pixi-renderer";
import { WorkflowActivitySpritePopover } from "./workflow-activity-sprite-popover";
import { WorkflowApprovalOverlay } from "./workflow-approval-overlay";
import {
  syncWorkflowGraphCameraScope,
  writeWorkflowGraphCameraState,
  type SyntheticWorkflowGraphOptions,
  type WorkflowGraphCameraScope,
} from "./workflow-graph-camera-scope";
import { writeWorkflowGraphProjectionFocusTarget } from "./workflow-graph-projection-target-store";
import { useWorkflowProjectionState } from "./workflow-graph-projection-state";
import { workflowGraphReactCommitRecorder } from "./workflow-graph-react-profiler";
import { workflowRendererHandlersForSurface } from "./workflow-graph-renderer-handlers";
import { workflowGraphSurfaceControllerForSurface } from "./workflow-graph-surface-controller";
import {
  workflowGraphAnimationSettingsForSurface,
  workflowGraphStateForSurface,
  workflowSyntheticGraphForSurface,
} from "./workflow-graph-surface-state";
import {
  semanticNodeIdFromRendererNodeId,
  semanticRendererNodeId,
} from "./semantic-graph-projection";
import { useSemanticGraphState } from "./semantic-graph-state";
import { useWorkflowGraphDetailsOpeners } from "./workflow-graph-details-openers";
import { useSemanticLayoutOverlay } from "./workflow-graph-semantic-layout-overlay";
import {
  useWorkflowGraphViewLayout,
  workflowRendererGraphWithViewLayoutPositions,
} from "./workflow-graph-view-layout";
import { selectedWorkflowProjectionNode, workflowSettingsTarget } from "./workflow-graph-targets";
import { useWorkspaceTrajectoryRuntime } from "./workflow-trajectory-runtime";
import { toolbarDraftNodePosition, type WorkflowDraftNodePosition } from "./workflow-graph-toolbar";
import {
  WorkflowContextMenuLayer,
  WorkflowGraphEditorErrorLayer,
  WorkflowGraphStateLayers,
  WorkflowGraphToolbarLayer,
  type WorkflowContextMenuState,
} from "./workflow-graph-surface-layers";
import { useWorkflowGraphSceneRuntime } from "./workflow-graph-scene-runtime";
import {
  materializeWorkflowDraftEdge,
  materializeWorkflowDraftNode,
  rendererGraphForWorkflowProjection,
  semanticGraphIsEmpty,
  workflowProjectionForDefinition,
  workflowProjectionForExecution,
  workflowProjectionPendingApproval,
  workflowRunDraftPreflightMessage,
  workflowValidationForDraftProjection,
  type WorkflowGraphRendererGraph,
} from "./workflow-graph-surface-helpers";
export function WorkflowGraphSurface({
  active,
  debugEnabled,
  syntheticGraphFallback,
  surfaceId,
}: {
  active: boolean;
  debugEnabled: boolean;
  syntheticGraphFallback?: SyntheticWorkflowGraphOptions;
  surfaceId: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workflowMenuRef = useRef<HTMLDivElement>(null);
  const workflowCameraRef = useRef<WorkflowGraphCameraState | null>(null);
  const workflowCameraScopeRef = useRef<WorkflowGraphCameraScope | null>(null);
  const workflowController = useMemo(
    () => workflowGraphSurfaceControllerForSurface(surfaceId),
    [surfaceId],
  );
  const workflowRendererRef = useRef(workflowController);
  workflowRendererRef.current = workflowController;
  const currentSceneGraphRef = useRef<WorkflowGraphRendererGraph | null>(null);
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
  const recordWorkflowGraphReactCommit = workflowGraphReactCommitRecorder(surfaceId);
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
    surfaceId,
  });
  workflowProjectionRef.current = workflowProjection;
  const {
    preparePendingWorkflowLayout,
    settleWorkflowLayoutSave,
    workflowProjectionWithLocalLayout,
  } = useWorkflowLayoutOverlay({
    projection: workflowProjection,
  });
  const applyWorkflowProjection = useCallback(
    (
      projection: WorkflowGraphProjection | null,
      options: { allowDraftTargetSwitch?: boolean } = {},
    ) => {
      if (replaceWorkflowProjection(projection, options)) {
        workflowProjectionRef.current = projection;
        writeWorkflowGraphProjectionFocusTarget(surfaceId, projection);
      }
    },
    [replaceWorkflowProjection, surfaceId],
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
  const workflowGraphFromProjection = useMemo(
    () => rendererGraphForWorkflowProjection(workflowProjectionWithLocalLayout, workflowValidation),
    [workflowProjectionWithLocalLayout, workflowValidation],
  );
  const {
    preparePendingWorkflowViewLayout,
    replaceWorkflowGraphViewLayoutPositions,
    settleWorkflowViewLayoutSave,
    target: workflowViewLayoutTarget,
    viewLayoutPositions: workflowViewLayoutPositions,
  } = useWorkflowGraphViewLayout({
    projection: workflowProjection,
    setWorkflowEditorError,
  });
  const workflowGraph = useMemo(
    () =>
      workflowRendererGraphWithViewLayoutPositions(
        workflowGraphFromProjection,
        workflowViewLayoutPositions,
      ),
    [workflowGraphFromProjection, workflowViewLayoutPositions],
  );
  const semanticGraphState = useSemanticGraphState();
  const { trajectoryStore } = useWorkspaceTrajectoryRuntime({
    syntheticGraph,
    workflowProjection,
    workflowWorkspaceId,
  });
  const { preparePendingSemanticLayout, semanticGraphWithLocalLayout, settleSemanticLayoutSave } =
    useSemanticLayoutOverlay({
      semanticGraph: semanticGraphState.graph,
      workspaceId: semanticGraphState.workspaceId,
    });
  const { graphSceneStore, syncSceneFrameToRenderer } = useWorkflowGraphSceneRuntime({
    currentSceneGraphRef,
    selectedWorkflowNodeId,
    semanticActivities: semanticGraphState.activitiesByNodeId,
    semanticGraph: semanticGraphWithLocalLayout,
    semanticRuntimeStore: semanticGraphState.runtimeStore,
    setSelectedNodeTarget,
    syntheticGraph,
    trajectoryStore,
    workflowGraph,
    workflowProjection,
    workflowProjectionReady,
    workflowRendererRef,
    workflowWorkspaceId,
  });
  const {
    activitySpritePopoverTarget,
    dismissActivitySpritePopover,
    handleGraphActivitySpriteClick,
    openActivitySpriteDetails,
    openGraphNodeDetails,
  } = useWorkflowGraphDetailsOpeners({
    currentSceneGraphRef,
    semanticGraphState,
    setSelectedNodeTarget,
    syncSceneFrameToRenderer,
    trajectoryStore,
    workflowProjection,
  });
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
  const applyPersistedGraphLayoutOutcome = useCallback(
    (outcome: GraphNodeLayoutPersistenceOutcome) => {
      if (outcome.semantic.status === "persisted") {
        semanticGraphState.replaceSemanticLayoutPositions(outcome.semantic.positions);
      }
      if (
        outcome.workflow.status === "persisted" &&
        outcome.workflow.owner === "workflow_view_layout"
      ) {
        replaceWorkflowGraphViewLayoutPositions(outcome.workflow.positions);
      }
    },
    [replaceWorkflowGraphViewLayoutPositions, semanticGraphState.replaceSemanticLayoutPositions],
  );
  const persistNodePositions = useCallback(
    async (positions: WorkflowLayoutPosition[]) => {
      const movedNodeIds = positions
        .filter((position) => position.moved)
        .map((position) => position.nodeId);
      if (syntheticGraph !== null) {
        workflowController.settleNodePositionSave({
          nodeIds: movedNodeIds,
          status: "skipped",
        });
        return;
      }
      if (workflowEditorError !== "") {
        setWorkflowEditorError("");
      }
      const saveSequence = layoutSaveSequenceRef.current + 1;
      layoutSaveSequenceRef.current = saveSequence;
      const semanticGraphAtDragEnd = semanticGraphState.graph;
      const semanticLayoutInputs = preparePendingSemanticLayout(positions, saveSequence);
      const projectionAtDragEnd = workflowProjectionRef.current;
      const graphAtDragEnd = currentSceneGraphRef.current;
      const viewLayoutTargetAtDragEnd = workflowViewLayoutTarget;
      const workflowLayoutInputs = preparePendingWorkflowLayout(
        projectionAtDragEnd,
        positions,
        saveSequence,
      );
      const workflowViewLayoutInputs = preparePendingWorkflowViewLayout(
        graphAtDragEnd,
        positions,
        saveSequence,
      );
      const layoutSaveRecording = startWorkflowGraphLayoutSaveRecording({
        positions,
        projection: projectionAtDragEnd,
        saveSequence,
        semanticLayoutInputCount: semanticLayoutInputs.length,
        surfaceId,
        viewLayoutTarget: viewLayoutTargetAtDragEnd,
        workflowLayoutInputCount: workflowLayoutInputs.length,
        workflowViewLayoutInputCount: workflowViewLayoutInputs.length,
      });
      const save = enqueueWorkflowGraphWrite(async () => {
        if (saveSequence !== layoutSaveSequenceRef.current) {
          settleSemanticLayoutSave(semanticLayoutInputs, saveSequence);
          settleWorkflowLayoutSave(workflowLayoutInputs, saveSequence);
          settleWorkflowViewLayoutSave(workflowViewLayoutInputs, saveSequence);
          recordSupersededWorkflowGraphLayoutSave(layoutSaveRecording);
          return null;
        }
        const outcome = await persistGraphNodePositions({
          positions,
          semanticGraph: semanticGraphAtDragEnd,
          workflowViewLayoutTarget: viewLayoutTargetAtDragEnd,
          workflowProjection: projectionAtDragEnd,
        });
        recordWorkflowGraphLayoutSaveOutcome(layoutSaveRecording, outcome);
        if (
          layoutSaveFailedForCurrentSequence(outcome, saveSequence, layoutSaveSequenceRef.current)
        ) {
          setWorkflowEditorError(graphNodeLayoutPersistenceErrorMessage(outcome));
        }
        applyPersistedGraphLayoutOutcome(outcome);
        settleSemanticLayoutSave(semanticLayoutInputs, saveSequence);
        settleWorkflowLayoutSave(workflowLayoutInputs, saveSequence);
        settleWorkflowViewLayoutSave(workflowViewLayoutInputs, saveSequence);
        if (layoutOutcomeReleasesRendererNodePositions(outcome)) {
          workflowController.settleNodePositionSave({
            nodeIds: movedNodeIds,
            status: outcome.status,
          });
        }
        return workflowDefinitionProjectionFromLayoutOutcome(outcome);
      });
      await save;
    },
    [
      applyPersistedGraphLayoutOutcome,
      enqueueWorkflowGraphWrite,
      preparePendingSemanticLayout,
      preparePendingWorkflowLayout,
      preparePendingWorkflowViewLayout,
      semanticGraphState.graph,
      settleSemanticLayoutSave,
      settleWorkflowLayoutSave,
      settleWorkflowViewLayoutSave,
      syntheticGraph,
      workflowController,
      workflowEditorError,
      workflowViewLayoutTarget,
      surfaceId,
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
    const latestProjection = workflowProjectionRef.current;
    if (
      latestProjection === null ||
      latestProjection.viewMode !== "draft" ||
      latestProjection.workspaceId !== currentProjection.workspaceId ||
      latestProjection.definitionId !== currentProjection.definitionId
    ) {
      return;
    }
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
      applyWorkflowProjection(refreshed, { allowDraftTargetSwitch: true });
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
  useWorkflowGraphDebugRunDraftRegistration({ runWorkflowDraft, surfaceId, workflowProjectionRef });
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
      applyWorkflowProjection(refreshed, { allowDraftTargetSwitch: true });
      setWorkflowValidationFallback(null);
    } catch (error: unknown) {
      setWorkflowEditorError(error instanceof Error ? error.message : "Workflow draft load failed");
    }
  }, [applyWorkflowProjection, workflowProjection]);
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
        handleGraphActivitySpriteClick,
        handleGraphEdgeSelectionChange,
        handleGraphNodeSelectionChange,
        openGraphNodeDetails,
        openWorkflowContextMenu,
        persistNodePositions,
        reactRenderCount,
        syntheticGraph,
      }),
    [
      addWorkflowDraftEdge,
      deleteWorkflowDraftEdges,
      deleteWorkflowDraftNodes,
      handleGraphActivitySpriteClick,
      handleGraphEdgeSelectionChange,
      handleGraphNodeSelectionChange,
      openGraphNodeDetails,
      openWorkflowContextMenu,
      persistNodePositions,
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
    workflowController.configure({
      animationEnabled: graphAnimationSettings.animationEnabled,
      captureCameraState: (camera) => {
        workflowCameraRef.current = camera;
        writeWorkflowGraphCameraState(surfaceId, workflowCameraScopeRef.current, camera);
      },
      debugEnabled,
      handlers: rendererHandlers,
      initialCameraState: workflowCameraRef.current,
      noteCameraMovement: graphSceneStore.noteCameraMovement,
      reduceMotion: graphAnimationSettings.reduceMotion,
    });
  }, [
    debugEnabled,
    graphAnimationSettings.animationEnabled,
    graphAnimationSettings.reduceMotion,
    graphSceneStore,
    rendererHandlers,
    surfaceId,
    workflowController,
  ]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    workflowController.mount(host);
    return () => {
      workflowController.suspend();
    };
  }, [workflowController]);
  useEffect(() => {
    if (active) {
      workflowController.activate();
      return;
    }
    workflowController.suspend();
  }, [active, workflowController]);
  useWorkflowContextMenuClose({ setWorkflowContextMenu, workflowContextMenu, workflowMenuRef });
  return (
    <Profiler id={`workflow-graph:${surfaceId}`} onRender={recordWorkflowGraphReactCommit}>
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
        <WorkflowActivitySpritePopover
          onDismiss={dismissActivitySpritePopover}
          onOpenDetails={openActivitySpriteDetails}
          surfaceId={surfaceId}
          target={activitySpritePopoverTarget}
        />
        <WorkflowGraphEditorErrorLayer message={workflowEditorError} />
        <WorkflowApprovalOverlay
          pendingApproval={pendingApproval}
          projection={workflowProjection}
          setWorkflowProjection={applyWorkflowProjection}
        />
      </section>
    </Profiler>
  );
}

function layoutSaveFailedForCurrentSequence(
  outcome: GraphNodeLayoutPersistenceOutcome,
  saveSequence: number,
  currentSaveSequence: number,
): boolean {
  return outcome.status === "failed" && saveSequence === currentSaveSequence;
}

function layoutOutcomeReleasesRendererNodePositions(outcome: GraphNodeLayoutPersistenceOutcome) {
  return outcome.status === "failed" || outcome.status === "skipped";
}

function workflowDefinitionProjectionFromLayoutOutcome(
  outcome: GraphNodeLayoutPersistenceOutcome,
): WorkflowGraphProjection | null {
  return outcome.workflow.status === "persisted" &&
    outcome.workflow.owner === "workflow_definition_layout"
    ? outcome.workflow.projection
    : null;
}
