import _ from "lodash";
import { memo, useMemo, type CSSProperties } from "react";
import { toggleAgenticEdgeSelection } from "state/actions/agenticEdges";
import { useActiveSectionUI } from "state/activeSectionUI";
import {
  getAllowedChatIdsForProject,
  getSectionIdsForProject,
} from "state/aiFollowUtils";
import { useNodeInternals, useProjectState } from "state/definitions";
import { useUpdateAgenticScopeHighlights } from "state/hooks/agenticScopeHighlights";
import { useShareCapabilities } from "state/hooks/share";
import { useAIFollow } from "state/stores/aiFollowStores";
import {
  AgenticEdgeKindEnum,
  SectionTypeEnum,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { getBezierPath } from "../components/Edges/BezierEdge";
import { useReactFlow } from "../store";
import { HandlePosition, type Node } from "../types";

type NodeCenter = { x: number; y: number };
type NodeAnchorSide = "left" | "right";
type FallbackSectionSize = { w?: number; h?: number };

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

function resolveNodeAnchor(
  node: Node | undefined,
  fallbackLayout: FallbackSectionSize | undefined,
  side: NodeAnchorSide,
): NodeCenter | null {
  if (!node) {
    return null;
  }
  const width = node.width ?? fallbackLayout?.w ?? null;
  const height = node.height ?? fallbackLayout?.h ?? null;
  if (!width || !height) {
    return null;
  }
  return {
    x: side === "left" ? node.position.x : node.position.x + width,
    y: node.position.y + height / 2,
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
        {sortedEdges.map((edge) => {
          if (edge.hidden) {
            return null;
          }
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

          const { x: sourceX, y: sourceY } = sourceCenter;
          const { x: targetX, y: targetY } = targetCenter;
          const [path] = getBezierPath({
            sourceX,
            sourceY,
            sourcePosition: HandlePosition.Right,
            targetX,
            targetY,
            targetPosition: HandlePosition.Left,
          });

          const touchesToolArgs =
            toolArgSectionIds.has(edge.sourceSectionId) ||
            toolArgSectionIds.has(edge.targetSectionId);
          const touchesToolResults =
            toolResultSectionIds.has(edge.sourceSectionId) ||
            toolResultSectionIds.has(edge.targetSectionId);
          const isRunningFromSource = runningChatSectionIds.has(
            edge.sourceSectionId,
          );

          const kindClassName = `agentic-edge--${edge.kind.replaceAll(
            "_",
            "-",
          )}`;
          const pathClassNames = [
            "react-flow__agentic-edge-path",
            kindClassName,
            edge.selected ? "agentic-edge--selected" : null,
            touchesToolArgs ? "agentic-edge--tool-args" : null,
            touchesToolResults ? "agentic-edge--tool-result" : null,
            isRunningFromSource ? "agentic-edge--run" : null,
          ]
            .filter(Boolean)
            .join(" ");

          const onClick = (event: React.MouseEvent<SVGGElement>) => {
            if (!canEditStructure) {
              return;
            }
            event.stopPropagation();
            toggleAgenticEdgeSelection(edge.id, multiSelectionActive);
          };

          return (
            <g
              key={edge.id}
              className="react-flow__agentic-edge"
              onClick={onClick}
              role="button"
              tabIndex={0}
            >
              <path
                d={path}
                className={pathClassNames}
                style={edge.style ? (edge.style as CSSProperties) : undefined}
                fill="none"
              />
              <path
                d={path}
                className="react-flow__agentic-edge-interaction"
                fill="none"
                strokeOpacity={0}
                strokeWidth={16}
              />
            </g>
          );
        })}
        {missingEdges.map((edge) => {
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

          const { x: sourceX, y: sourceY } = sourceCenter;
          const { x: targetX, y: targetY } = targetCenter;
          const [path] = getBezierPath({
            sourceX,
            sourceY,
            sourcePosition: HandlePosition.Right,
            targetX,
            targetY,
            targetPosition: HandlePosition.Left,
          });

          const kindClassName = `agentic-edge--${edge.kind.replaceAll(
            "_",
            "-",
          )}`;
          const pathClassNames = [
            "react-flow__agentic-edge-path",
            kindClassName,
            "agentic-edge--missing",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <g key={edge.id} className="react-flow__agentic-edge">
              <path d={path} className={pathClassNames} fill="none" />
            </g>
          );
        })}
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
