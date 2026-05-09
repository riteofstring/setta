import { memo, useMemo, type CSSProperties, type MouseEvent } from "react";
import { toggleStateMachineEdgeSelection } from "state/actions/stateMachineEdges";
import { useNodeInternals, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  StateMachineUIConfig,
  type SingleConfig,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { getBezierPath } from "../components/Edges/BezierEdge";
import { useReactFlow } from "../store";
import { HandlePosition, type Node } from "../types";

type NodeCenter = { x: number; y: number };
type NodeFrame = { height: number; width: number; x: number; y: number };
type NodeAnchorSide = "left" | "right";
type WorkflowEdge = SingleConfig["projectConfig"]["stateMachineEdges"][number];
type TopLevelSections = SingleConfig["projectConfig"]["topLevelSections"];

const sourceActivationCountOperatorLabelByValue = new Map(
  StateMachineUIConfig.sourceActivationCountOperatorOptions.map((option) => [
    option.value,
    option.label,
  ]),
);

function resolveNodeSize(
  measuredSize: number | null | undefined,
  fallbackSize: number | null | undefined,
): number | null {
  if (measuredSize) {
    return measuredSize;
  }
  if (fallbackSize) {
    return fallbackSize;
  }
  return null;
}

function getNodeFrame(
  node: Node | undefined,
  fallbackLayout: TopLevelSectionLayout | undefined,
): NodeFrame | null {
  if (!node) {
    return null;
  }
  const width = resolveNodeSize(node.width, fallbackLayout?.w);
  const height = resolveNodeSize(node.height, fallbackLayout?.h);
  if (!width || !height) {
    return null;
  }
  return {
    height,
    width,
    x: node.position.x,
    y: node.position.y,
  };
}

function getNodeCenterX(frame: NodeFrame | null): number | null {
  if (!frame) {
    return null;
  }
  return frame.x + frame.width / 2;
}

function resolveNodeAnchor(
  frame: NodeFrame | null,
  side: NodeAnchorSide,
): NodeCenter | null {
  if (!frame) {
    return null;
  }
  return {
    x: side === "left" ? frame.x : frame.x + frame.width,
    y: frame.y + frame.height * 0.5,
  };
}

function getEdgeClassNames(edge: WorkflowEdge): string {
  const classNames = ["react-flow__state-machine-edge-path"];
  if (edge.selected) {
    classNames.push("workflow-edge--selected");
  }
  return classNames.join(" ");
}

function getSourceActivationCountLabel(edge: WorkflowEdge): string | null {
  const condition = edge.sourceActivationCountCondition;
  if (!condition) {
    return null;
  }
  const operatorLabel =
    sourceActivationCountOperatorLabelByValue.get(condition.operator) ??
    condition.operator;
  return `src count ${operatorLabel} ${condition.value}`;
}

function resolveRelativeAnchorSides(
  sourceFrame: NodeFrame | null,
  targetFrame: NodeFrame | null,
): { sourceSide: NodeAnchorSide; targetSide: NodeAnchorSide } {
  const sourceCenterX = getNodeCenterX(sourceFrame);
  const targetCenterX = getNodeCenterX(targetFrame);
  if (sourceCenterX === null || targetCenterX === null) {
    return {
      sourceSide: "right",
      targetSide: "left",
    };
  }
  if (sourceCenterX <= targetCenterX) {
    return {
      sourceSide: "right",
      targetSide: "left",
    };
  }
  return {
    sourceSide: "left",
    targetSide: "right",
  };
}

function getEdgePath(
  sourceCenter: NodeCenter,
  targetCenter: NodeCenter,
): string {
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

function getPromptSectionId(edge: WorkflowEdge): string | null {
  if (edge.targetAction?.type !== "send_prompt") {
    return null;
  }
  return edge.targetAction.promptSectionId ?? null;
}

function getPromptLinkPath({
  edge,
  nodes,
  targetNode,
  topLevelSections,
}: {
  edge: WorkflowEdge;
  nodes: Map<string, Node>;
  targetNode: Node | undefined;
  topLevelSections: TopLevelSections;
}): string | null {
  const promptSectionId = getPromptSectionId(edge);
  if (!promptSectionId) {
    return null;
  }
  const promptNode = nodes.get(promptSectionId);
  const promptLayout = topLevelSections[promptSectionId];
  const targetLayout = topLevelSections[edge.targetSectionId];
  const promptFrame = getNodeFrame(promptNode, promptLayout);
  const targetFrame = getNodeFrame(targetNode, targetLayout);
  const { sourceSide, targetSide } = resolveRelativeAnchorSides(
    promptFrame,
    targetFrame,
  );
  const promptSourceCenter = resolveNodeAnchor(promptFrame, sourceSide);
  const promptTargetCenter = resolveNodeAnchor(targetFrame, targetSide);
  if (!promptSourceCenter || !promptTargetCenter) {
    return null;
  }
  const promptSourcePosition =
    sourceSide === "right" ? HandlePosition.Right : HandlePosition.Left;
  const promptTargetPosition =
    targetSide === "left" ? HandlePosition.Left : HandlePosition.Right;
  const [path] = getBezierPath({
    sourceX: promptSourceCenter.x,
    sourceY: promptSourceCenter.y,
    sourcePosition: promptSourcePosition,
    targetX: promptTargetCenter.x,
    targetY: promptTargetCenter.y,
    targetPosition: promptTargetPosition,
  });
  return path;
}

function getSourceActivationCountLabelLayout(
  sourceCenter: NodeCenter,
  targetCenter: NodeCenter,
  label: string | null,
): { x: number; y: number; width: number } | null {
  if (!label) {
    return null;
  }
  return {
    x: (sourceCenter.x + targetCenter.x) / 2,
    y: (sourceCenter.y + targetCenter.y) / 2,
    width: Math.max(80, label.length * 6 + 12),
  };
}

function renderWorkflowEdge({
  edge,
  canEditStructure,
  multiSelectionActive,
  nodes,
  topLevelSections,
}: {
  edge: WorkflowEdge;
  canEditStructure: boolean;
  multiSelectionActive: boolean;
  nodes: Map<string, Node>;
  topLevelSections: TopLevelSections;
}): JSX.Element | null {
  if (edge.hidden) {
    return null;
  }
  const targetNode = nodes.get(edge.targetSectionId);
  const sourceFrame = getNodeFrame(
    nodes.get(edge.sourceSectionId),
    topLevelSections[edge.sourceSectionId],
  );
  const targetFrame = getNodeFrame(
    targetNode,
    topLevelSections[edge.targetSectionId],
  );
  const sourceCenter = resolveNodeAnchor(sourceFrame, "right");
  const targetCenter = resolveNodeAnchor(targetFrame, "left");
  if (!sourceCenter || !targetCenter) {
    return null;
  }
  const path = getEdgePath(sourceCenter, targetCenter);
  const sourceActivationCountLabel = getSourceActivationCountLabel(edge);
  const sourceActivationCountLabelLayout = getSourceActivationCountLabelLayout(
    sourceCenter,
    targetCenter,
    sourceActivationCountLabel,
  );
  const promptLinkPath = getPromptLinkPath({
    edge,
    nodes,
    targetNode,
    topLevelSections,
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
      {promptLinkPath ? (
        <path
          d={promptLinkPath}
          className="react-flow__state-machine-prompt-link-path"
          data-testid={`workflow-prompt-link-${edge.id}`}
          fill="none"
        />
      ) : null}
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
      {sourceActivationCountLabel && sourceActivationCountLabelLayout ? (
        <g
          className="react-flow__state-machine-edge-label"
          data-testid={`workflow-edge-source-activation-badge-${edge.id}`}
          transform={`translate(${sourceActivationCountLabelLayout.x - sourceActivationCountLabelLayout.width / 2} ${sourceActivationCountLabelLayout.y - 10})`}
        >
          <rect
            className="react-flow__state-machine-edge-label-bg"
            width={sourceActivationCountLabelLayout.width}
            height={20}
            rx={10}
            ry={10}
          />
          <text
            className="react-flow__state-machine-edge-label-text"
            x={sourceActivationCountLabelLayout.width / 2}
            y={13}
            textAnchor="middle"
          >
            {sourceActivationCountLabel}
          </text>
        </g>
      ) : null}
    </g>
  );
}

const StateMachineEdgeRenderer = () => {
  const { width, height, multiSelectionActive } = useReactFlow((state) => ({
    width: state.width,
    height: state.height,
    multiSelectionActive: state.multiSelectionActive,
  }));
  const { stateMachineEdges, topLevelSections } = useProjectState(
    (state) => ({
      stateMachineEdges: state.projectConfig.stateMachineEdges,
      topLevelSections: state.projectConfig.topLevelSections,
    }),
    shallow,
  );
  const nodes = useNodeInternals((state) => state.x);
  const { canEditStructure } = useShareCapabilities();

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
        {sortedEdges.map((edge) =>
          renderWorkflowEdge({
            edge,
            canEditStructure,
            multiSelectionActive,
            nodes,
            topLevelSections,
          }),
        )}
      </g>
    </svg>
  );
};

StateMachineEdgeRenderer.displayName = "StateMachineEdgeRenderer";

export default memo(StateMachineEdgeRenderer);
