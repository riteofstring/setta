import type {
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowGraphProjection,
  WorkflowValidationResult,
  WorkflowPendingApproval,
} from "@generated/backend";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import { useWorkflowEditorStore } from "../../stores/workflow-editor-store";
import { requestWorkspacePaneOpen } from "../../workspace-layout/open-pane-events";
import {
  emptyWorkflowGraph,
  workflowGraphWithAddedDraftEdge,
  workflowGraphWithAddedDraftNode,
  workflowGraphWithoutDraftNodes,
  type WorkflowDraftEdgeConnection,
  type WorkflowDraftNodeType,
} from "./workflow-graph-draft";
import { workflowGraphWithNodeLayout, type WorkflowLayoutPosition } from "./workflow-graph-layout";
import type {
  WorkflowGraphCameraState,
  WorkflowGraphEdgeConnection,
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
  selectedWorkflowProjectionNode,
  workflowNodeDetailsTarget,
  workflowSettingsTarget,
} from "./workflow-graph-targets";
import {
  toolbarDraftNodePosition,
  WorkflowGraphToolbar,
  workflowNodeMenuItems,
  WorkflowValidationPanel,
  type WorkflowDraftNodePosition,
} from "./workflow-graph-toolbar";

export function WorkflowGraphSurface({
  debugEnabled,
  surfaceId,
}: {
  debugEnabled: boolean;
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
  const [workflowValidation, setWorkflowValidation] = useState<WorkflowValidationResult | null>(
    null,
  );
  const [workflowOperation, setWorkflowOperation] = useState<"run" | "validate" | null>(null);
  const syntheticGraph = window.setta.app.flags.workflowGraphSyntheticGraph;
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
  });
  const workflowGraph = useMemo(
    () => rendererGraphForWorkflowProjection(workflowProjection, workflowValidation),
    [workflowProjection, workflowValidation],
  );
  const graph = useMemo(
    () =>
      workflowRendererGraphForSurface({
        syntheticGraph,
        workflowGraph,
        workflowProjectionReady,
        workflowWorkspaceId,
      }),
    [syntheticGraph, workflowGraph, workflowProjectionReady, workflowWorkspaceId],
  );
  const pendingApproval = useMemo(
    () => workflowProjectionPendingApproval(workflowProjection),
    [workflowProjection],
  );
  const selectedWorkflowNode = useMemo(
    () => selectedWorkflowProjectionNode(workflowProjection, selectedWorkflowNodeId),
    [selectedWorkflowNodeId, workflowProjection],
  );
  const loadingProjection = syntheticGraph === null && workflowProjectionLoading;
  const noWorkspace = syntheticGraph === null && workflowProjectionHasNoWorkspace;
  const workflowProjectionError = syntheticGraph === null ? workflowProjectionLoadError : "";
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
      if (syntheticGraph !== null || workflowProjection === null) {
        return;
      }
      if (!workflowProjection.editable) {
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
      if (workflowProjection === null) {
        setWorkflowEditorError("Select workflow nodes before deleting");
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
        const graph = workflowGraphWithoutDraftNodes(definition.graph, nodeIds);
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
          selectedNodeId !== null && nodeIds.includes(selectedNodeId) ? null : selectedNodeId,
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
  const handleWorkflowNodeSelectionChange = useCallback((nodeIds: string[]) => {
    setSelectedWorkflowNodeId(nodeIds[0] ?? null);
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
type WorkflowGraphRendererGraph = ReturnType<typeof rendererGraphFromWorkflowProjection>;

function WorkflowGraphToolbarLayer({
  addWorkflowDraftNodeFromToolbar,
  openWorkflowNodeDetails,
  openWorkflowSettings,
  runWorkflowDraft,
  selectedWorkflowNodeId,
  selectedWorkflowNodeLabel,
  showDraftWorkflow,
  syntheticGraph,
  validateWorkflowDraft,
  workflowOperation,
  workflowProjection,
  workflowProjectionReady,
  workflowValidation,
  workflowWorkspaceId,
}: {
  addWorkflowDraftNodeFromToolbar: (nodeType: WorkflowDraftNodeType) => Promise<void>;
  openWorkflowNodeDetails: (nodeId: string | null) => void;
  openWorkflowSettings: () => void;
  runWorkflowDraft: () => Promise<void>;
  selectedWorkflowNodeId: string | null;
  selectedWorkflowNodeLabel: string;
  showDraftWorkflow: () => Promise<void>;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  validateWorkflowDraft: () => Promise<WorkflowValidationResult | null>;
  workflowOperation: "run" | "validate" | null;
  workflowProjection: WorkflowGraphProjection | null;
  workflowProjectionReady: boolean;
  workflowValidation: WorkflowValidationResult | null;
  workflowWorkspaceId: string;
}) {
  if (syntheticGraph !== null) {
    return null;
  }
  return (
    <WorkflowGraphToolbar
      busy={workflowOperation}
      onAddNode={(nodeType) => void addWorkflowDraftNodeFromToolbar(nodeType)}
      onOpenDetails={() => openWorkflowNodeDetails(selectedWorkflowNodeId)}
      onOpenSettings={() => openWorkflowSettings()}
      onRun={() => void runWorkflowDraft()}
      onShowDraft={() => void showDraftWorkflow()}
      onValidate={() => void validateWorkflowDraft()}
      projection={workflowProjection}
      ready={workflowProjectionReady}
      selectedNodeLabel={selectedWorkflowNodeLabel}
      validation={workflowValidation}
      workspaceId={workflowWorkspaceId}
    />
  );
}

function WorkflowGraphStateLayers({
  loadingProjection,
  noWorkspace,
  workflowProjectionError,
}: {
  loadingProjection: boolean;
  noWorkspace: boolean;
  workflowProjectionError: string;
}) {
  return workflowGraphStateLabels({
    loadingProjection,
    noWorkspace,
    workflowProjectionError,
  }).map((label) => <WorkflowGraphState key={label} label={label} />);
}

function WorkflowValidationLayer({
  workflowValidation,
}: {
  workflowValidation: WorkflowValidationResult | null;
}) {
  if (!workflowValidation) {
    return null;
  }
  return <WorkflowValidationPanel validation={workflowValidation} />;
}

function WorkflowContextMenuLayer({
  addWorkflowDraftNode,
  workflowContextMenu,
  workflowMenuRef,
}: {
  addWorkflowDraftNode: (nodeType: WorkflowDraftNodeType) => Promise<void>;
  workflowContextMenu: WorkflowContextMenuState | null;
  workflowMenuRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (!workflowContextMenu) {
    return null;
  }
  return (
    <WorkflowCanvasContextMenu
      menu={workflowContextMenu}
      menuRef={workflowMenuRef}
      onSelectNodeType={(nodeType) => void addWorkflowDraftNode(nodeType)}
    />
  );
}

function WorkflowGraphEditorErrorLayer({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return <WorkflowGraphEditorError message={message} />;
}

function workflowGraphStateLabels({
  loadingProjection,
  noWorkspace,
  workflowProjectionError,
}: {
  loadingProjection: boolean;
  noWorkspace: boolean;
  workflowProjectionError: string;
}) {
  const labels: string[] = [];
  if (loadingProjection) {
    labels.push("Loading workflow graph");
  }
  if (noWorkspace) {
    labels.push("Open a workspace to edit workflows");
  }
  if (workflowProjectionError) {
    labels.push(workflowProjectionError);
  }
  return labels;
}

function rendererGraphForWorkflowProjection(
  projection: WorkflowGraphProjection | null,
  validation: WorkflowValidationResult | null,
) {
  if (projection === null) {
    return undefined;
  }
  return rendererGraphFromWorkflowProjection(projection, validation);
}

function workflowRendererGraphForSurface({
  syntheticGraph,
  workflowGraph,
  workflowProjectionReady,
  workflowWorkspaceId,
}: {
  syntheticGraph: SyntheticWorkflowGraphOptions;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowProjectionReady: boolean;
  workflowWorkspaceId: string;
}) {
  if (syntheticGraph) {
    return createSyntheticWorkflowGraph(syntheticGraph);
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

function WorkflowGraphState({ label }: { label: string }) {
  return <div className="workspace-workflow-graph-state">{label}</div>;
}

function WorkflowGraphEditorError({ message }: { message: string }) {
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

function emptyWorkflowRendererGraph() {
  return {
    edges: [],
    nodes: [],
    workflow: null,
  };
}
