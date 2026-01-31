import _ from "lodash";
import { memo, useMemo, type CSSProperties } from "react";
import { toggleAgenticEdgeSelection } from "state/actions/agenticEdges";
import { getSectionIdsForProject } from "state/aiFollowUtils";
import {
  useAIFollow,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  AgenticEdgeKindEnum,
  SectionTypeEnum,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import { useReactFlow } from "../store";
import type { Node } from "../types";

type NodeCenter = { x: number; y: number };

function resolveNodeCenter(
  node: Node | undefined,
  fallbackLayout: TopLevelSectionLayout | undefined,
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
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  };
}

const AgenticEdgeRenderer = () => {
  const { width, height, multiSelectionActive } = useReactFlow((state) => ({
    width: state.width,
    height: state.height,
    multiSelectionActive: state.multiSelectionActive,
  }));
  const {
    agenticEdges,
    topLevelSections,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
    projectConfigId,
  } = useProjectState(
    (state) => ({
      agenticEdges: state.projectConfig.agenticEdges,
      topLevelSections: state.projectConfig.topLevelSections,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      projectConfigId: state.projectConfig.id,
    }),
    _.isEqual,
  );
  const nodes = useNodeInternals((state) => state.x, _.isEqual);
  const { canEditStructure } = useShareCapabilities();
  const { toolArgumentsIdsByProjectConfigId, toolResultIdsByProjectConfigId } =
    useAIFollow(
      (state) => ({
        toolArgumentsIdsByProjectConfigId:
          state.toolArgumentsIdsByProjectConfigId,
        toolResultIdsByProjectConfigId: state.toolResultIdsByProjectConfigId,
      }),
      _.isEqual,
    );

  const runningChatSectionIds = useMemo(() => {
    const running = new Set<string>();
    for (const [sectionId, variantId] of Object.entries(sectionVariantMap)) {
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
  }, [sectionImpls, sectionVariantMap, sectionVariants]);

  const toolArgSectionIds = useMemo(
    () =>
      new Set(
        getSectionIdsForProject(
          toolArgumentsIdsByProjectConfigId,
          projectConfigId,
        ),
      ),
    [projectConfigId, toolArgumentsIdsByProjectConfigId],
  );
  const toolResultSectionIds = useMemo(
    () =>
      new Set(
        getSectionIdsForProject(
          toolResultIdsByProjectConfigId,
          projectConfigId,
        ),
      ),
    [projectConfigId, toolResultIdsByProjectConfigId],
  );

  if (!width || !height) {
    return null;
  }

  const sortedEdges = [...agenticEdges].sort((a, b) => a.zIndex - b.zIndex);

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
          const sourceCenter = resolveNodeCenter(
            nodes.get(edge.sourceSectionId),
            topLevelSections[edge.sourceSectionId],
          );
          const targetCenter = resolveNodeCenter(
            nodes.get(edge.targetSectionId),
            topLevelSections[edge.targetSectionId],
          );
          if (!sourceCenter || !targetCenter) {
            return null;
          }

          const { x: sourceX, y: sourceY } = sourceCenter;
          const { x: targetX, y: targetY } = targetCenter;
          const path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;

          const touchesToolArgs =
            toolArgSectionIds.has(edge.sourceSectionId) ||
            toolArgSectionIds.has(edge.targetSectionId);
          const touchesToolResults =
            toolResultSectionIds.has(edge.sourceSectionId) ||
            toolResultSectionIds.has(edge.targetSectionId);
          const isRunningFromSource = runningChatSectionIds.has(
            edge.sourceSectionId,
          );

          const pathClassNames = [
            "react-flow__agentic-edge-path",
            `agentic-edge--${edge.kind}`,
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
              className={`react-flow__agentic-edge ${
                edge.kind === AgenticEdgeKindEnum.chat_chat
                  ? "agentic-edge-chat"
                  : ""
              }`}
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
      </g>
    </svg>
  );
};

AgenticEdgeRenderer.displayName = "AgenticEdgeRenderer";

export default memo(AgenticEdgeRenderer);
