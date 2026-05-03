import {
  buildGpuEdgeScene,
  type GpuAgenticEdgeSource,
  type GpuAgenticMissingEdgeSource,
  type GpuConnectionLineSource,
  type GpuDataEdgeSource,
  type GpuEdgeHandlePosition,
  type GpuEdgeNodeFrame,
  type GpuEdgeScene,
  type GpuWorkflowEdgeSource,
} from "gpuFlow/edges/edgeSources";
import type { GpuEdgeInteractionEvent } from "gpuFlow/interactions/edges";
import type { GpuFlowLayoutNode } from "gpuFlow/layoutStore";
import {
  buildGpuFlowPortEndpoints,
  makeGpuFlowPortKey,
  useGpuFlowPortRegistry,
  type GpuFlowPortDescriptor,
  type GpuFlowPortEndpoint,
} from "gpuFlow/ports/portGeometry";
import {
  getGpuPortAnchorHandleType,
  getGpuPortAnchorSide,
  type GpuFlowScene,
  type GpuPortAnchorDescriptor,
} from "gpuFlow/scene";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import { screenToFlowPosition } from "gpuFlow/viewportMath";
import type { GpuFlowViewportStore } from "gpuFlow/viewportStore";
import { useMemo } from "react";
import { toggleAgenticEdgeSelection } from "state/actions/agenticEdges";
import { isSharedChatHandleId } from "state/actions/chatSharedHandleIds";
import { toggleEdgeSelection } from "state/actions/edges";
import {
  isWorkflowHandleId,
  toggleStateMachineEdgeSelection,
} from "state/actions/stateMachineEdges";
import { useAIFollow, useProjectState } from "state/definitions";
import {
  AgenticEdgeKindEnum,
  SectionTypeEnum,
  StateMachineUIConfig,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

type ProjectState = ReturnType<typeof useProjectState.getState>;
type ProjectConfig = ProjectState["projectConfig"];
type SectionVariantMap = ProjectConfig["sectionVariantMap"];
type SectionVariants = ProjectState["sectionVariants"];
type SectionImpls = ProjectState["sectionImpls"];
type TopLevelSections = ProjectConfig["topLevelSections"];
type PortDescriptors = Readonly<Record<string, GpuFlowPortDescriptor>>;
type ProjectDataEdge = NonNullable<ProjectConfig["edges"]>[number];
type ProjectAgenticEdge = NonNullable<ProjectConfig["agenticEdges"]>[number];
type ProjectWorkflowEdge = NonNullable<
  ProjectConfig["stateMachineEdges"]
>[number];
type ProjectAgenticMissingEdgeSource = Pick<
  ProjectAgenticEdge,
  "kind" | "sourceSectionId" | "targetSectionId"
>;
type ProjectGpuConnectionState = Pick<
  GpuFlowViewportStore,
  | "connectionPosition"
  | "connectionStartHandle"
  | "connectionStatus"
  | "transform"
>;

type ProjectGpuEdgeVisibility = {
  readonly showAgenticEdges: boolean;
  readonly showDataEdges: boolean;
};

export type BuildProjectGpuEdgeSceneInput = ProjectGpuEdgeVisibility & {
  readonly connectionState: ProjectGpuConnectionState;
  readonly layoutNodes: readonly GpuFlowLayoutNode[];
  readonly portDescriptors: PortDescriptors;
  readonly projectConfig: ProjectConfig;
  readonly scene?: GpuFlowScene | undefined;
  readonly scopeViolationEdges:
    | readonly ProjectAgenticMissingEdgeSource[]
    | undefined;
  readonly sectionImpls: SectionImpls;
  readonly sectionVariants: SectionVariants;
};

type UseProjectGpuEdgeSceneInput = ProjectGpuEdgeVisibility & {
  readonly layoutNodes: readonly GpuFlowLayoutNode[];
  readonly scene?: GpuFlowScene | undefined;
};

type SelectProjectGpuEdgeInput = {
  readonly canEditStructure: boolean;
  readonly event: Pick<GpuEdgeInteractionEvent, "edgeId" | "family">;
  readonly multiSelect: boolean;
};

type SelectProjectGpuEdgeAction = "agentic" | "data" | "workflow" | "none";

const AGENTIC_HANDLE_PREFIX = "agentic-edge-";
const INACTIVE_PROJECT_GPU_CONNECTION_STATE: ProjectGpuConnectionState = {
  connectionPosition: { x: 0, y: 0 },
  connectionStartHandle: null,
  connectionStatus: null,
  transform: [0, 0, 1],
};
const workflowSourceActivationCountOperatorLabelByValue = new Map(
  StateMachineUIConfig.sourceActivationCountOperatorOptions.map((option) => [
    option.value,
    option.label,
  ]),
);

export function useProjectGpuEdgeScene({
  layoutNodes,
  scene,
  showAgenticEdges,
  showDataEdges,
}: UseProjectGpuEdgeSceneInput): GpuEdgeScene {
  const { projectConfig, sectionImpls, sectionVariants } = useProjectState(
    (state) => ({
      projectConfig: state.projectConfig,
      sectionImpls: state.sectionImpls,
      sectionVariants: state.sectionVariants,
    }),
    shallow,
  );
  const portDescriptors = useGpuFlowPortRegistry((state) => state.descriptors);
  const connectionState = useGpuFlowViewportStore(
    selectProjectGpuConnectionState,
    shallow,
  );
  const scopeViolationEdges = useAIFollow(
    (state) => state.scopeViolationEdgesByProjectConfigId[projectConfig.id],
  );

  return useMemo(
    () =>
      buildProjectGpuEdgeScene({
        connectionState,
        layoutNodes,
        portDescriptors,
        projectConfig,
        scene,
        scopeViolationEdges,
        sectionImpls,
        sectionVariants,
        showAgenticEdges,
        showDataEdges,
      }),
    [
      connectionState,
      layoutNodes,
      portDescriptors,
      projectConfig,
      scene,
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
  layoutNodes,
  portDescriptors,
  projectConfig,
  scene,
  scopeViolationEdges,
  sectionImpls,
  sectionVariants,
  showAgenticEdges,
  showDataEdges,
}: BuildProjectGpuEdgeSceneInput): GpuEdgeScene {
  const handlePositions = buildProjectGpuEdgeHandlePositions(
    buildGpuFlowPortEndpoints({
      layoutNodes,
      ports: portDescriptors,
    }),
    scene,
  );
  return buildGpuEdgeScene({
    agenticEdges: showAgenticEdges
      ? buildProjectGpuAgenticEdgeSources(projectConfig.agenticEdges ?? [])
      : [],
    connectionLine: resolveProjectGpuConnectionLine({
      connectionState,
      showAgenticEdges,
      showDataEdges,
    }),
    dataEdges: showDataEdges
      ? buildProjectGpuDataEdgeSources({
          edges: projectConfig.edges ?? [],
          sectionVariantMap: projectConfig.sectionVariantMap,
        })
      : [],
    handlePositions,
    nodes: buildGpuEdgeNodeFrames(layoutNodes),
    runningSourceSectionIds: showAgenticEdges
      ? getRunningAgenticSourceSectionIds({
          sectionImpls,
          sectionVariantMap: projectConfig.sectionVariantMap,
          sectionVariants,
          topLevelSections: projectConfig.topLevelSections,
        })
      : undefined,
    scopeViolationEdges: showAgenticEdges
      ? buildProjectGpuAgenticMissingEdgeSources(scopeViolationEdges ?? [])
      : [],
    workflowEdges: buildProjectGpuWorkflowEdgeSources(
      projectConfig.stateMachineEdges ?? [],
    ),
  });
}

function buildProjectGpuEdgeHandlePositions(
  portEndpoints: Readonly<Record<string, GpuFlowPortEndpoint>>,
  scene: GpuFlowScene | undefined,
): Readonly<Record<string, GpuEdgeHandlePosition>> {
  const domHandlePositions = Object.fromEntries(
    Object.entries(portEndpoints).map(([key, endpoint]) => [
      key,
      {
        portId: endpoint.portId,
        sectionId: endpoint.nodeId,
        side: endpoint.side,
        type: endpoint.type,
        x: endpoint.x,
        y: endpoint.y,
      },
    ]),
  );
  return {
    ...domHandlePositions,
    ...buildProjectGpuSectionSceneHandlePositions(scene),
    ...buildProjectGpuRetainedContentHandlePositions(scene),
  };
}

function buildProjectGpuSectionSceneHandlePositions(
  scene: GpuFlowScene | undefined,
): Readonly<Record<string, GpuEdgeHandlePosition>> {
  if (!scene) {
    return {};
  }
  const handlePositions: Record<string, GpuEdgeHandlePosition> = {};
  for (const section of scene.sections) {
    for (const anchor of section.portAnchors) {
      const endpoint = getProjectGpuSectionScenePortEndpoint(anchor);
      if (!endpoint) {
        continue;
      }
      handlePositions[
        makeGpuFlowPortKey(section.sectionId, anchor.id, endpoint.type)
      ] = {
        portId: anchor.id,
        sectionId: section.sectionId,
        side: endpoint.side,
        type: endpoint.type,
        x: section.worldRect.x + anchor.localPosition.x,
        y: section.worldRect.y + anchor.localPosition.y,
      };
    }
  }
  return handlePositions;
}

function getProjectGpuSectionScenePortEndpoint(
  anchor: GpuPortAnchorDescriptor,
): Pick<GpuEdgeHandlePosition, "side" | "type"> | null {
  const type = getGpuPortAnchorHandleType(anchor);
  const side = getGpuPortAnchorSide(anchor);
  if (!type || !side) {
    return null;
  }
  return { side, type };
}

function buildProjectGpuRetainedContentHandlePositions(
  scene: GpuFlowScene | undefined,
): Readonly<Record<string, GpuEdgeHandlePosition>> {
  if (!scene) {
    return {};
  }
  const handlePositions: Record<string, GpuEdgeHandlePosition> = {};
  for (const surface of scene.contentSurfaces) {
    const retainedScene = surface.retainedScene;
    if (surface.renderer.kind !== "canvas-content" || !retainedScene) {
      continue;
    }
    for (const anchor of retainedScene.portAnchors) {
      const type = anchor.kind === "input" ? "target" : "source";
      handlePositions[
        makeGpuFlowPortKey(surface.ownerSectionId, anchor.id, type)
      ] = {
        portId: anchor.id,
        sectionId: surface.ownerSectionId,
        side: anchor.side,
        type,
        x: surface.rect.x + anchor.localPosition.x,
        y: surface.rect.y + anchor.localPosition.y,
      };
    }
  }
  return handlePositions;
}

function buildProjectGpuDataEdgeSources({
  edges,
  sectionVariantMap,
}: {
  readonly edges: readonly ProjectDataEdge[];
  readonly sectionVariantMap: SectionVariantMap;
}): GpuDataEdgeSource[] {
  const activeEdges: GpuDataEdgeSource[] = [];
  for (const edge of edges) {
    if (
      sectionVariantMap[edge.sourceSectionId] !== edge.sourceVariantId ||
      sectionVariantMap[edge.targetSectionId] !== edge.targetVariantId
    ) {
      continue;
    }
    activeEdges.push({
      hidden: edge.hidden,
      id: edge.id,
      label: edge.label,
      selected: edge.selected,
      sourcePortId: edge.sourcePortId,
      sourceSectionId: edge.sourceSectionId,
      style: edge.style,
      targetPortId: edge.targetPortId,
      targetSectionId: edge.targetSectionId,
      type: edge.type,
      zIndex: edge.zIndex,
    });
  }
  return activeEdges;
}

function buildProjectGpuAgenticEdgeSources(
  edges: readonly ProjectAgenticEdge[],
): GpuAgenticEdgeSource[] {
  return edges.map((edge) => ({
    dedupeKey: getProjectGpuAgenticEdgeKey(edge),
    hidden: edge.hidden,
    id: edge.id,
    selected: edge.selected,
    sourceSectionId: edge.sourceSectionId,
    style: edge.style,
    targetSectionId: edge.targetSectionId,
    zIndex: edge.zIndex,
  }));
}

function buildProjectGpuAgenticMissingEdgeSources(
  edges: readonly ProjectAgenticMissingEdgeSource[],
): GpuAgenticMissingEdgeSource[] {
  return edges.map((edge) => ({
    dedupeKey: getProjectGpuAgenticEdgeKey(edge),
    sourceSectionId: edge.sourceSectionId,
    targetSectionId: edge.targetSectionId,
  }));
}

function buildProjectGpuWorkflowEdgeSources(
  edges: readonly ProjectWorkflowEdge[],
): GpuWorkflowEdgeSource[] {
  return edges.map((edge) => ({
    hidden: edge.hidden,
    id: edge.id,
    promptSectionId: getProjectGpuWorkflowPromptSectionId(edge),
    selected: edge.selected,
    sourceActivationLabel:
      getProjectGpuWorkflowSourceActivationCountLabel(edge),
    sourceSectionId: edge.sourceSectionId,
    style: edge.style,
    targetSectionId: edge.targetSectionId,
    zIndex: edge.zIndex,
  }));
}

function getProjectGpuAgenticEdgeKey(
  edge: ProjectAgenticMissingEdgeSource,
): string {
  if (edge.kind === AgenticEdgeKindEnum.chat_chat) {
    const [first, second] =
      edge.sourceSectionId < edge.targetSectionId
        ? [edge.sourceSectionId, edge.targetSectionId]
        : [edge.targetSectionId, edge.sourceSectionId];
    return `${edge.kind}:${first}:${second}`;
  }
  return `${edge.kind}:${edge.sourceSectionId}:${edge.targetSectionId}`;
}

function getProjectGpuWorkflowPromptSectionId(
  edge: ProjectWorkflowEdge,
): string | null {
  if (edge.targetAction?.type !== "send_prompt") {
    return null;
  }
  return edge.targetAction.promptSectionId ?? null;
}

function getProjectGpuWorkflowSourceActivationCountLabel(
  edge: ProjectWorkflowEdge,
): string | null {
  const condition = edge.sourceActivationCountCondition;
  if (!condition) {
    return null;
  }
  const operatorLabel =
    workflowSourceActivationCountOperatorLabelByValue.get(condition.operator) ??
    condition.operator;
  return `src count ${operatorLabel} ${condition.value}`;
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

function buildGpuEdgeNodeFrames(
  layoutNodes: readonly GpuFlowLayoutNode[],
): ReadonlyMap<string, GpuEdgeNodeFrame> {
  const frames = new Map<string, GpuEdgeNodeFrame>();
  for (const node of layoutNodes) {
    frames.set(node.nodeId, {
      height: node.height,
      width: node.width,
      x: node.x,
      y: node.y,
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

export function selectProjectGpuConnectionState(
  state: GpuFlowViewportStore,
): ProjectGpuConnectionState {
  if (!state.connectionStartHandle?.handleId) {
    return INACTIVE_PROJECT_GPU_CONNECTION_STATE;
  }
  return {
    connectionPosition: state.connectionPosition,
    connectionStartHandle: state.connectionStartHandle,
    connectionStatus: state.connectionStatus,
    transform: state.transform,
  };
}

function resolveProjectGpuConnectionLine({
  connectionState,
  showAgenticEdges,
  showDataEdges,
}: ProjectGpuEdgeVisibility & {
  readonly connectionState: ProjectGpuConnectionState;
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
    status: connectionState.connectionStatus,
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
