import _ from "lodash";
import { memo, useMemo, type CSSProperties } from "react";
import { toggleAgenticEdgeSelection } from "state/actions/agenticEdges";
import { useActiveSectionUI } from "state/activeSectionUI";
import {
  getAllowedChatIdsForProject,
  getSectionIdsForProject,
} from "state/aiFollowUtils";
import {
  useAIFollow,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { useUpdateAgenticScopeHighlights } from "state/hooks/agenticScopeHighlights";
import { useShareCapabilities } from "state/hooks/share";
import {
  AgenticEdgeKindEnum,
  SectionTypeEnum,
  type AgenticEdge,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { getBezierPath } from "../components/Edges/BezierEdge";
import { useReactFlow } from "../store";
import { HandlePosition, type Node } from "../types";

type NodeCenter = { x: number; y: number };
type NodeAnchorSide = "left" | "right";
type FallbackSectionSize = { w?: number; h?: number };
type EdgeSections = Pick<
  AgenticEdge,
  "kind" | "sourceSectionId" | "targetSectionId"
>;
type MissingAgenticEdge = EdgeSections & { id: string };
type AgenticEdgeRenderContext = {
  canEditStructure: boolean;
  fallbackSectionSizes: Record<string, FallbackSectionSize>;
  multiSelectionActive: boolean;
  nodes: Map<string, Node>;
  runningChatSectionIds: Set<string>;
  toolArgSectionIds: Set<string>;
  toolResultSectionIds: Set<string>;
};

function areNodeGeometryMapsEqual(
  left: Map<string, Node>,
  right: Map<string, Node>,
) {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const [sectionId, leftNode] of left) {
    const rightNode = right.get(sectionId);
    if (!rightNode) {
      return false;
    }
    if (
      leftNode.position.x !== rightNode.position.x ||
      leftNode.position.y !== rightNode.position.y ||
      leftNode.width !== rightNode.width ||
      leftNode.height !== rightNode.height
    ) {
      return false;
    }
  }
  return true;
}

function buildEdgeKey(
  sourceSectionId: string,
  targetSectionId: string,
  kind: string,
): string {
  if (kind === AgenticEdgeKindEnum.chat_chat) {
    const [first, second] =
      sourceSectionId < targetSectionId
        ? [sourceSectionId, targetSectionId]
        : [targetSectionId, sourceSectionId];
    return `${kind}:${first}:${second}`;
  }
  return `${kind}:${sourceSectionId}:${targetSectionId}`;
}

function resolveNodeDimension(
  primaryValue: number | undefined,
  fallbackValue: number | undefined,
): number | null {
  return primaryValue ?? fallbackValue ?? null;
}

function resolveNodeDimensions(
  node: Node,
  fallbackLayout: FallbackSectionSize | undefined,
): { width: number; height: number } | null {
  const width = resolveNodeDimension(node.width, fallbackLayout?.w);
  const height = resolveNodeDimension(node.height, fallbackLayout?.h);
  if (width === null || height === null) {
    return null;
  }
  return { width, height };
}

function resolveNodeAnchorX(
  node: Node,
  width: number,
  side: NodeAnchorSide,
): number {
  return side === "left" ? node.position.x : node.position.x + width;
}

function resolveNodeAnchor(
  node: Node | undefined,
  fallbackLayout: FallbackSectionSize | undefined,
  side: NodeAnchorSide,
): NodeCenter | null {
  if (!node) {
    return null;
  }
  const dimensions = resolveNodeDimensions(node, fallbackLayout);
  if (!dimensions) {
    return null;
  }
  return {
    x: resolveNodeAnchorX(node, dimensions.width, side),
    y: node.position.y + dimensions.height / 2,
  };
}

function getTopLevelSectionIds(
  topLevelSections: Record<string, TopLevelSectionLayout>,
): Array<string> {
  return Object.keys(topLevelSections);
}

function getFallbackSectionSizes(
  topLevelSections: Record<string, TopLevelSectionLayout>,
): Record<string, FallbackSectionSize> {
  return Object.fromEntries(
    Object.entries(topLevelSections).map(([sectionId, layout]) => [
      sectionId,
      { w: layout.w, h: layout.h },
    ]),
  );
}

function resolveAgenticEdgePath(
  edge: EdgeSections,
  nodes: Map<string, Node>,
  fallbackSectionSizes: Record<string, FallbackSectionSize>,
): string | null {
  const sourceCenter = resolveNodeAnchor(
    nodes.get(edge.sourceSectionId),
    fallbackSectionSizes[edge.sourceSectionId],
    "right",
  );
  const targetCenter = resolveNodeAnchor(
    nodes.get(edge.targetSectionId),
    fallbackSectionSizes[edge.targetSectionId],
    "left",
  );
  if (!sourceCenter || !targetCenter) {
    return null;
  }

  const [path] = getBezierPath({
    sourceX: sourceCenter.x,
    sourceY: sourceCenter.y,
    sourcePosition: HandlePosition.Right,
    targetX: targetCenter.x,
    targetY: targetCenter.y,
    targetPosition: HandlePosition.Left,
  });
  return path;
}

function edgeTouchesTrackedSections(
  edge: EdgeSections,
  trackedSectionIds: Set<string>,
): boolean {
  return (
    trackedSectionIds.has(edge.sourceSectionId) ||
    trackedSectionIds.has(edge.targetSectionId)
  );
}

function buildAgenticEdgePathClassNames(
  edge: EdgeSections,
  options: {
    isMissing?: boolean;
    isRunningFromSource?: boolean;
    isSelected?: boolean;
    touchesToolArgs?: boolean;
    touchesToolResults?: boolean;
  },
): string {
  const classNames = [
    "react-flow__agentic-edge-path",
    `agentic-edge--${edge.kind.replaceAll("_", "-")}`,
  ];
  if (options.isSelected) {
    classNames.push("agentic-edge--selected");
  }
  if (options.touchesToolArgs) {
    classNames.push("agentic-edge--tool-args");
  }
  if (options.touchesToolResults) {
    classNames.push("agentic-edge--tool-result");
  }
  if (options.isRunningFromSource) {
    classNames.push("agentic-edge--run");
  }
  if (options.isMissing) {
    classNames.push("agentic-edge--missing");
  }
  return classNames.join(" ");
}

function handleAgenticEdgeClick(
  event: React.MouseEvent<SVGGElement>,
  edgeId: string,
  canEditStructure: boolean,
  multiSelectionActive: boolean,
) {
  if (!canEditStructure) {
    return;
  }
  event.stopPropagation();
  toggleAgenticEdgeSelection(edgeId, multiSelectionActive);
}

function renderAgenticEdge(
  edge: AgenticEdge,
  context: AgenticEdgeRenderContext,
) {
  if (edge.hidden) {
    return null;
  }

  const path = resolveAgenticEdgePath(
    edge,
    context.nodes,
    context.fallbackSectionSizes,
  );
  if (!path) {
    return null;
  }

  const pathClassNames = buildAgenticEdgePathClassNames(edge, {
    isRunningFromSource: context.runningChatSectionIds.has(
      edge.sourceSectionId,
    ),
    isSelected: edge.selected,
    touchesToolArgs: edgeTouchesTrackedSections(
      edge,
      context.toolArgSectionIds,
    ),
    touchesToolResults: edgeTouchesTrackedSections(
      edge,
      context.toolResultSectionIds,
    ),
  });
  const style = edge.style ? (edge.style as CSSProperties) : undefined;
  const onClick = (event: React.MouseEvent<SVGGElement>) => {
    handleAgenticEdgeClick(
      event,
      edge.id,
      context.canEditStructure,
      context.multiSelectionActive,
    );
  };

  return (
    <g
      key={edge.id}
      className="react-flow__agentic-edge"
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <path d={path} className={pathClassNames} style={style} fill="none" />
      <path
        d={path}
        className="react-flow__agentic-edge-interaction"
        fill="none"
        strokeOpacity={0}
        strokeWidth={16}
      />
    </g>
  );
}

function renderMissingAgenticEdge(
  edge: MissingAgenticEdge,
  nodes: Map<string, Node>,
  fallbackSectionSizes: Record<string, FallbackSectionSize>,
) {
  const path = resolveAgenticEdgePath(edge, nodes, fallbackSectionSizes);
  if (!path) {
    return null;
  }

  return (
    <g key={edge.id} className="react-flow__agentic-edge">
      <path
        d={path}
        className={buildAgenticEdgePathClassNames(edge, { isMissing: true })}
        fill="none"
      />
    </g>
  );
}

function AgenticScopeHighlightsUpdater() {
  const {
    agenticEdges,
    topLevelSectionIds,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
    projectConfigId,
  } = useProjectState(
    (state) => ({
      agenticEdges: state.projectConfig.agenticEdges,
      topLevelSectionIds: getTopLevelSectionIds(
        state.projectConfig.topLevelSections,
      ),
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      projectConfigId: state.projectConfig.id,
    }),
    _.isEqual,
  );
  const activeIds = useActiveSectionUI((state) => state.activeIds);

  useUpdateAgenticScopeHighlights({
    projectConfigId,
    agenticEdges,
    activeIds,
    topLevelSectionIds,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
  });

  return null;
}

const _AgenticEdgeRenderer = () => {
  const { width, height, multiSelectionActive } = useReactFlow(
    (state) => ({
      width: state.width,
      height: state.height,
      multiSelectionActive: state.multiSelectionActive,
    }),
    shallow,
  );
  const {
    agenticEdges,
    topLevelSectionIds,
    fallbackSectionSizes,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
    projectConfigId,
  } = useProjectState(
    (state) => ({
      agenticEdges: state.projectConfig.agenticEdges,
      topLevelSectionIds: getTopLevelSectionIds(
        state.projectConfig.topLevelSections,
      ),
      fallbackSectionSizes: getFallbackSectionSizes(
        state.projectConfig.topLevelSections,
      ),
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      projectConfigId: state.projectConfig.id,
    }),
    _.isEqual,
  );
  const nodes = useNodeInternals((state) => state.x, areNodeGeometryMapsEqual);
  const { canEditStructure } = useShareCapabilities();
  const {
    toolArgumentsIdsByProjectConfigId,
    toolResultIdsByProjectConfigId,
    mode,
    selectedChatIdsByProjectConfigId,
    selectedSectionIdsByProjectConfigId,
    scopeViolationEdgesByProjectConfigId,
  } = useAIFollow(
    (state) => ({
      toolArgumentsIdsByProjectConfigId:
        state.toolArgumentsIdsByProjectConfigId,
      toolResultIdsByProjectConfigId: state.toolResultIdsByProjectConfigId,
      mode: state.mode,
      selectedChatIdsByProjectConfigId: state.selectedChatIdsByProjectConfigId,
      selectedSectionIdsByProjectConfigId:
        state.selectedSectionIdsByProjectConfigId,
      scopeViolationEdgesByProjectConfigId:
        state.scopeViolationEdgesByProjectConfigId,
    }),
    shallow,
  );

  const runningChatSectionIds = useMemo(() => {
    const running = new Set<string>();
    for (const sectionId of topLevelSectionIds) {
      const variantId = sectionVariantMap[sectionId];
      if (!variantId) {
        continue;
      }
      const variant = sectionVariants[variantId];
      if (!variant) {
        continue;
      }
      const impl = sectionImpls[variant.impl];
      if (!impl) {
        continue;
      }
      if (impl.type === SectionTypeEnum.Chat && impl.waitingForResponse) {
        running.add(sectionId);
      }
    }
    return running;
  }, [sectionImpls, sectionVariantMap, sectionVariants, topLevelSectionIds]);

  const allowedChatIds = useMemo(
    () =>
      getAllowedChatIdsForProject(
        mode,
        selectedChatIdsByProjectConfigId,
        selectedSectionIdsByProjectConfigId,
        projectConfigId,
        sectionVariantMap,
        sectionVariants,
        sectionImpls,
      ),
    [
      mode,
      projectConfigId,
      sectionImpls,
      sectionVariantMap,
      sectionVariants,
      selectedChatIdsByProjectConfigId,
      selectedSectionIdsByProjectConfigId,
    ],
  );

  const toolArgSectionIds = useMemo(
    () =>
      new Set(
        getSectionIdsForProject(
          toolArgumentsIdsByProjectConfigId,
          projectConfigId,
          allowedChatIds,
        ),
      ),
    [allowedChatIds, projectConfigId, toolArgumentsIdsByProjectConfigId],
  );
  const toolResultSectionIds = useMemo(
    () =>
      new Set(
        getSectionIdsForProject(
          toolResultIdsByProjectConfigId,
          projectConfigId,
          allowedChatIds,
        ),
      ),
    [allowedChatIds, projectConfigId, toolResultIdsByProjectConfigId],
  );

  const missingEdges = useMemo(() => {
    const violations =
      scopeViolationEdgesByProjectConfigId[projectConfigId] ?? [];
    if (violations.length === 0) {
      return [];
    }
    const existingKeys = new Set(
      agenticEdges.map((edge) =>
        buildEdgeKey(edge.sourceSectionId, edge.targetSectionId, edge.kind),
      ),
    );
    return violations
      .filter((edge) => {
        const key = buildEdgeKey(
          edge.sourceSectionId,
          edge.targetSectionId,
          edge.kind,
        );
        return !existingKeys.has(key);
      })
      .map((edge) => ({
        ...edge,
        id: `missing:${buildEdgeKey(
          edge.sourceSectionId,
          edge.targetSectionId,
          edge.kind,
        )}`,
      }));
  }, [agenticEdges, projectConfigId, scopeViolationEdgesByProjectConfigId]);

  const sortedEdges = useMemo(
    () => [...agenticEdges].sort((a, b) => a.zIndex - b.zIndex),
    [agenticEdges],
  );
  const edgeRenderContext = {
    canEditStructure,
    fallbackSectionSizes,
    multiSelectionActive,
    nodes,
    runningChatSectionIds,
    toolArgSectionIds,
    toolResultSectionIds,
  };

  if (!width || !height) {
    return null;
  }

  return (
    <svg
      width={width}
      height={height}
      className="react-flow__agentic-edges react-flow__container"
    >
      <g>
        {sortedEdges.map((edge) => renderAgenticEdge(edge, edgeRenderContext))}
        {missingEdges.map((edge) =>
          renderMissingAgenticEdge(edge, nodes, fallbackSectionSizes),
        )}
      </g>
    </svg>
  );
};

const AgenticEdgeRenderer = memo(_AgenticEdgeRenderer);

AgenticEdgeRenderer.displayName = "AgenticEdgeRenderer";

function _AgenticEdgeRendererWithHighlights() {
  return (
    <>
      <AgenticScopeHighlightsUpdater />
      <AgenticEdgeRenderer />
    </>
  );
}

const AgenticEdgeRendererWithHighlights = memo(
  _AgenticEdgeRendererWithHighlights,
);

AgenticEdgeRendererWithHighlights.displayName =
  "AgenticEdgeRendererWithHighlights";

export default AgenticEdgeRendererWithHighlights;
