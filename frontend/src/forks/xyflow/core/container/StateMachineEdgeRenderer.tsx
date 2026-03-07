import { memo, useMemo, type CSSProperties, type MouseEvent } from "react";
import { toggleStateMachineEdgeSelection } from "state/actions/stateMachineEdges";
import { useNodeInternals, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  SectionTypeEnum,
  type ProjectStateSingleConfig,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { getBezierPath } from "../components/Edges/BezierEdge";
import { useReactFlow } from "../store";
import { HandlePosition, type Node } from "../types";

type NodeCenter = { x: number; y: number };
type NodeAnchorSide = "left" | "right";
type WorkflowEdge =
  ProjectStateSingleConfig["projectConfig"]["stateMachineEdges"][number];

function getSectionTypeById(
  state: ProjectStateSingleConfig,
  sectionId: string,
): SectionTypeEnum | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  return impl.type ?? null;
}

function getWorkflowAnchorFactor(sectionType: SectionTypeEnum | null): number {
  return 0.5;
}

function resolveNodeAnchor(
  node: Node | undefined,
  fallbackLayout: TopLevelSectionLayout | undefined,
  side: NodeAnchorSide,
  sectionType: SectionTypeEnum | null,
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
    y: node.position.y + height * getWorkflowAnchorFactor(sectionType),
  };
}

function getEdgeClassNames(edge: WorkflowEdge): string {
  const classNames = ["react-flow__state-machine-edge-path"];
  if (edge.selected) {
    classNames.push("workflow-edge--selected");
  }
  if (edge.sourceFilter?.type === "signal") {
    classNames.push("workflow-edge--signal");
  }
  if (edge.targetAction?.type === "reset_thread") {
    classNames.push("workflow-edge--reset-thread");
  }
  if (edge.targetAction?.type === "send_prompt") {
    classNames.push("workflow-edge--send-prompt");
  }
  return classNames.join(" ");
}

const StateMachineEdgeRenderer = () => {
  const { width, height, multiSelectionActive } = useReactFlow((state) => ({
    width: state.width,
    height: state.height,
    multiSelectionActive: state.multiSelectionActive,
  }));
  const {
    stateMachineEdges,
    topLevelSections,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
  } = useProjectState(
    (state) => ({
      stateMachineEdges: state.projectConfig.stateMachineEdges,
      topLevelSections: state.projectConfig.topLevelSections,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
    }),
    shallow,
  );
  const nodes = useNodeInternals((state) => state.x);
  const { canEditStructure } = useShareCapabilities();

  const sectionTypesById = useMemo(() => {
    const state = useProjectState.getState();
    const entries = Object.keys(sectionVariantMap).map((sectionId) => [
      sectionId,
      getSectionTypeById(state, sectionId),
    ]);
    return new Map<string, SectionTypeEnum | null>(entries);
  }, [sectionImpls, sectionVariantMap, sectionVariants]);

  const sortedEdges = useMemo(
    () =>
      [...stateMachineEdges].sort((left, right) => left.zIndex - right.zIndex),
    [stateMachineEdges],
  );

  if (!width || !height) {
    return null;
  }

  return (
    <svg
      width={width}
      height={height}
      className="react-flow__state-machine-edges react-flow__container"
    >
      <g>
        {sortedEdges.map((edge) => {
          if (edge.hidden) {
            return null;
          }
          const sourceType = sectionTypesById.get(edge.sourceSectionId) ?? null;
          const targetType = sectionTypesById.get(edge.targetSectionId) ?? null;
          const sourceCenter = resolveNodeAnchor(
            nodes.get(edge.sourceSectionId),
            topLevelSections[edge.sourceSectionId],
            "right",
            sourceType,
          );
          const targetCenter = resolveNodeAnchor(
            nodes.get(edge.targetSectionId),
            topLevelSections[edge.targetSectionId],
            "left",
            targetType,
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
          const onClick = (event: MouseEvent<SVGGElement>) => {
            if (!canEditStructure) {
              return;
            }
            event.stopPropagation();
            toggleStateMachineEdgeSelection(edge.id, multiSelectionActive);
          };
          return (
            <g
              key={edge.id}
              className="react-flow__state-machine-edge"
              onClick={onClick}
              role="button"
              tabIndex={0}
              data-edgeid={edge.id}
              data-testid={`workflow-edge-${edge.id}`}
            >
              <path
                d={path}
                className={getEdgeClassNames(edge)}
                style={edge.style ? (edge.style as CSSProperties) : undefined}
                fill="none"
              />
              <path
                d={path}
                className="react-flow__state-machine-edge-interaction"
                data-testid={`workflow-edge-hitbox-${edge.id}`}
                fill="none"
                strokeOpacity={0}
                strokeWidth={18}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

StateMachineEdgeRenderer.displayName = "StateMachineEdgeRenderer";

export default memo(StateMachineEdgeRenderer);
