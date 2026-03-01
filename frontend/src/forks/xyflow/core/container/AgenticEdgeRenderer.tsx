import { memo, useMemo, type CSSProperties } from "react";
import { toggleAgenticEdgeSelection } from "state/actions/agenticEdges";
import {
  getAllowedChatIdsForProject,
  getSectionIdsForProject,
} from "state/aiFollowUtils";
import {
  useAIFollow,
  useNodeInternals,
  useProjectState,
  useProjectViewModeState,
} from "state/definitions";
import { useUpdateAgenticScopeHighlights } from "state/hooks/agenticScopeHighlights";
import { useShareCapabilities } from "state/hooks/share";
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
  fallbackLayout: TopLevelSectionLayout | undefined,
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

const AgenticEdgeRenderer = () => {
  const { width, height, multiSelectionActive } = useReactFlow((state) => ({
    width: state.width,
    height: state.height,
    multiSelectionActive: state.multiSelectionActive,
  }));
  const topLevelSections = useProjectViewModeState(
    (state) => state.topLevelSections,
  );
  const {
    agenticEdges,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
    projectConfigId,
    activeIds,
  } = useProjectState(
    (state) => ({
      agenticEdges: state.projectConfig.agenticEdges,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      projectConfigId: state.projectConfig.id,
      activeIds: state.projectConfig.activeIds,
    }),
    shallow,
  );
  const nodes = useNodeInternals((state) => state.x);
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

  useUpdateAgenticScopeHighlights({
    projectConfigId,
    agenticEdges,
    activeIds,
    topLevelSections,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
  });

  const runningChatSectionIds = useMemo(() => {
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
      if (!impl) {
        continue;
      }
      if (impl.type === SectionTypeEnum.Chat && impl.waitingForResponse) {
        running.add(sectionId);
      }
    }
    return running;
  }, [sectionImpls, sectionVariantMap, sectionVariants, topLevelSections]);

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
            topLevelSections[edge.sourceSectionId],
            "right",
          );
          const targetCenter = resolveNodeAnchor(
            nodes.get(edge.targetSectionId),
            topLevelSections[edge.targetSectionId],
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
            topLevelSections[edge.sourceSectionId],
            "right",
          );
          const targetCenter = resolveNodeAnchor(
            nodes.get(edge.targetSectionId),
            topLevelSections[edge.targetSectionId],
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

AgenticEdgeRenderer.displayName = "AgenticEdgeRenderer";

export default memo(AgenticEdgeRenderer);
