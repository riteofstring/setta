import { useReactFlow } from "forks/xyflow/core/store";
import type { ReactFlowState } from "forks/xyflow/core/types";
import {
  buildGpuEdgeScene,
  type GpuAgenticMissingEdgeSource,
  type GpuConnectionLineSource,
  type GpuEdgeFamily,
  type GpuEdgeNodeFrame,
  type GpuEdgeScene,
} from "gpuFlow/edges/edgeSources";
import type { GpuEdgeInteractionEvent } from "gpuFlow/interactions/edges";
import { screenToFlowPosition } from "gpuFlow/viewportMath";
import { useMemo } from "react";
import { toggleAgenticEdgeSelection } from "state/actions/agenticEdges";
import { isSharedChatHandleId } from "state/actions/chatSharedHandleIds";
import { toggleEdgeSelection } from "state/actions/edges";
import {
  isWorkflowHandleId,
  toggleStateMachineEdgeSelection,
} from "state/actions/stateMachineEdges";
import {
  useAIFollow,
  useEdgeHandleRegistry,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

type ProjectState = ReturnType<typeof useProjectState.getState>;
type ProjectConfig = ProjectState["projectConfig"];
type SectionVariantMap = ProjectConfig["sectionVariantMap"];
type SectionVariants = ProjectState["sectionVariants"];
type SectionImpls = ProjectState["sectionImpls"];
type TopLevelSections = ProjectConfig["topLevelSections"];
type EdgeHandlePositions = ReturnType<
  typeof useEdgeHandleRegistry.getState
>["positions"];
type NodeInternals = ReturnType<typeof useNodeInternals.getState>["x"];
type ReactFlowConnectionState = Pick<
  ReactFlowState,
  "connectionPosition" | "connectionStartHandle" | "transform"
>;

type ProjectGpuEdgeVisibility = {
  readonly showAgenticEdges: boolean;
  readonly showDataEdges: boolean;
};

export type BuildProjectGpuEdgeSceneInput = ProjectGpuEdgeVisibility & {
  readonly connectionState: ReactFlowConnectionState;
  readonly handlePositions: EdgeHandlePositions;
  readonly nodeInternals: NodeInternals;
  readonly projectConfig: ProjectConfig;
  readonly scopeViolationEdges:
    | readonly GpuAgenticMissingEdgeSource[]
    | undefined;
  readonly sectionImpls: SectionImpls;
  readonly sectionVariants: SectionVariants;
};

type SelectProjectGpuEdgeInput = {
  readonly canEditStructure: boolean;
  readonly event: Pick<GpuEdgeInteractionEvent, "edgeId" | "family">;
  readonly multiSelect: boolean;
};

type SelectProjectGpuEdgeAction = "agentic" | "data" | "workflow" | "none";

const AGENTIC_HANDLE_PREFIX = "agentic-edge-";

export function useProjectGpuEdgeScene({
  showAgenticEdges,
  showDataEdges,
}: ProjectGpuEdgeVisibility): GpuEdgeScene {
  const { projectConfig, sectionImpls, sectionVariants } = useProjectState(
    (state) => ({
      projectConfig: state.projectConfig,
      sectionImpls: state.sectionImpls,
      sectionVariants: state.sectionVariants,
    }),
    shallow,
  );
  const nodeInternals = useNodeInternals((state) => state.x);
  const handlePositions = useEdgeHandleRegistry((state) => state.positions);
  const connectionState = useReactFlow(selectReactFlowConnectionState, shallow);
  const scopeViolationEdges = useAIFollow(
    (state) => state.scopeViolationEdgesByProjectConfigId[projectConfig.id],
  );

  return useMemo(
    () =>
      buildProjectGpuEdgeScene({
        connectionState,
        handlePositions,
        nodeInternals,
        projectConfig,
        scopeViolationEdges,
        sectionImpls,
        sectionVariants,
        showAgenticEdges,
        showDataEdges,
      }),
    [
      connectionState,
      handlePositions,
      nodeInternals,
      projectConfig,
      scopeViolationEdges,
      sectionImpls,
      sectionVariants,
      showAgenticEdges,
      showDataEdges,
    ],
  );
}

export function buildProjectGpuEdgeScene({
  connectionState,
  handlePositions,
  nodeInternals,
  projectConfig,
  scopeViolationEdges,
  sectionImpls,
  sectionVariants,
  showAgenticEdges,
  showDataEdges,
}: BuildProjectGpuEdgeSceneInput): GpuEdgeScene {
  return buildGpuEdgeScene({
    agenticEdges: showAgenticEdges ? projectConfig.agenticEdges ?? [] : [],
    connectionLine: resolveProjectGpuConnectionLine({
      connectionState,
      showAgenticEdges,
      showDataEdges,
    }),
    dataEdges: showDataEdges ? projectConfig.edges ?? [] : [],
    handlePositions,
    nodes: buildGpuEdgeNodeFrames(nodeInternals),
    runningSourceSectionIds: showAgenticEdges
      ? getRunningAgenticSourceSectionIds({
          sectionImpls,
          sectionVariantMap: projectConfig.sectionVariantMap,
          sectionVariants,
          topLevelSections: projectConfig.topLevelSections,
        })
      : undefined,
    scopeViolationEdges: showAgenticEdges ? scopeViolationEdges : [],
    sectionVariantMap: projectConfig.sectionVariantMap,
    topLevelSections: projectConfig.topLevelSections,
    workflowEdges: projectConfig.stateMachineEdges ?? [],
  });
}

export function selectProjectGpuEdge({
  canEditStructure,
  event,
  multiSelect,
}: SelectProjectGpuEdgeInput): SelectProjectGpuEdgeAction {
  switch (event.family) {
    case "data":
      toggleEdgeSelection(event.edgeId, multiSelect);
      return "data";
    case "agentic":
      if (!canEditStructure) {
        return "none";
      }
      toggleAgenticEdgeSelection(event.edgeId, multiSelect);
      return "agentic";
    case "workflow":
      if (!canEditStructure) {
        return "none";
      }
      toggleStateMachineEdgeSelection(event.edgeId, multiSelect);
      return "workflow";
    case "agentic-missing":
    case "connection":
    case "workflow-prompt-link":
      return "none";
  }
}

export function buildProjectGpuEdgeClickHandler({
  canEditStructure,
}: {
  readonly canEditStructure: boolean;
}): (event: GpuEdgeInteractionEvent<PointerEvent>) => void {
  return (event) => {
    selectProjectGpuEdge({
      canEditStructure,
      event,
      multiSelect: useReactFlow.getState().multiSelectionActive,
    });
  };
}

function buildGpuEdgeNodeFrames(
  nodeInternals: NodeInternals,
): ReadonlyMap<string, GpuEdgeNodeFrame> {
  const frames = new Map<string, GpuEdgeNodeFrame>();
  for (const [nodeId, node] of nodeInternals) {
    frames.set(nodeId, {
      height: node.height,
      width: node.width,
      x: node.position.x,
      y: node.position.y,
    });
  }
  return frames;
}

function getRunningAgenticSourceSectionIds({
  sectionImpls,
  sectionVariantMap,
  sectionVariants,
  topLevelSections,
}: {
  readonly sectionImpls: SectionImpls;
  readonly sectionVariantMap: SectionVariantMap;
  readonly sectionVariants: SectionVariants;
  readonly topLevelSections: TopLevelSections;
}): ReadonlySet<string> {
  const running = new Set<string>();
  for (const sectionId of Object.keys(topLevelSections)) {
    const variantId = sectionVariantMap[sectionId];
    if (!variantId) {
      continue;
    }
    const variant = sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    const impl = sectionImpls[variant.impl];
    if (
      impl?.type === SectionTypeEnum.Chat &&
      "waitingForResponse" in impl &&
      impl.waitingForResponse
    ) {
      running.add(sectionId);
    }
  }
  return running;
}

function selectReactFlowConnectionState(
  state: ReactFlowState,
): ReactFlowConnectionState {
  return {
    connectionPosition: state.connectionPosition,
    connectionStartHandle: state.connectionStartHandle,
    transform: state.transform,
  };
}

function resolveProjectGpuConnectionLine({
  connectionState,
  showAgenticEdges,
  showDataEdges,
}: ProjectGpuEdgeVisibility & {
  readonly connectionState: ReactFlowConnectionState;
}): GpuConnectionLineSource | null {
  const startHandle = connectionState.connectionStartHandle;
  if (!startHandle?.handleId) {
    return null;
  }
  if (
    !shouldShowConnectionLineForHandle({
      handleId: startHandle.handleId,
      showAgenticEdges,
      showDataEdges,
    })
  ) {
    return null;
  }
  return {
    pointerFlowPosition: screenToFlowPosition(
      connectionState.connectionPosition,
      connectionState.transform,
    ),
    startHandle,
  };
}

function shouldShowConnectionLineForHandle({
  handleId,
  showAgenticEdges,
  showDataEdges,
}: ProjectGpuEdgeVisibility & {
  readonly handleId: string;
}): boolean {
  if (isWorkflowHandleId(handleId) || isSharedChatHandleId(handleId)) {
    return true;
  }
  if (handleId.startsWith(AGENTIC_HANDLE_PREFIX)) {
    return showAgenticEdges;
  }
  return showDataEdges;
}

export function isSelectableProjectGpuEdgeFamily(
  family: GpuEdgeFamily,
): boolean {
  return family === "data" || family === "agentic" || family === "workflow";
}
