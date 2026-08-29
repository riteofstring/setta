import { memo } from "react";
import { computeReadyToBeVisible } from "../canvas/fitView";
import { useReactFlow } from "../canvas/store";
import {
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
  type NodeInternalsState,
  type WorkspaceDocumentState,
} from "../document/stores";
import type { Node } from "../document/types";
import { deriveSectionStyleTheme } from "../section/sectionStyleColors";
import MiniMapNode from "./MiniMapNode";
import type { GetMiniMapNodeAttribute, MiniMapNodesType } from "./types";

// The fork's `minimap/MiniMapNodes.tsx`. The reactive visuals resolve through the package
// document instead of the reference's variant indirection (the application resolves variants on
// its side of the seam), and the section-style *preview* colors left with the app's style-color
// editing feature.
type RenderableMiniMapNode = Node & {
  height: number;
  width: number;
};

function isRenderableMiniMapNode(node: Node): node is RenderableMiniMapNode {
  return (
    node.width !== null &&
    node.height !== null &&
    node.width > 0 &&
    node.height > 0
  );
}

const selectorNodes = (s: NodeInternalsState) =>
  Array.from(s.x.values()).filter(isRenderableMiniMapNode);

function areNodeStylesEqual(left: Node["style"], right: Node["style"]) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key as keyof typeof left] !== right[key as keyof typeof right]) {
      return false;
    }
  }
  return true;
}

export function areMiniMapNodesRenderableInputsEqual(
  left: Array<Node>,
  right: Array<Node>,
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftNode = left[index];
    const rightNode = right[index];
    if (!leftNode || !rightNode) {
      return false;
    }
    if (!areMiniMapNodeRenderableFieldsEqual(leftNode, rightNode)) {
      return false;
    }
  }
  return true;
}

const MINI_MAP_RENDERABLE_FIELD_SELECTORS = [
  (node: Node) => node.id,
  (node: Node) => node.position.x,
  (node: Node) => node.position.y,
  (node: Node) => node.width,
  (node: Node) => node.height,
  (node: Node) => node.zIndex,
  (node: Node) => node.tempZIndex,
  (node: Node) => node.kind,
] as const;

function areMiniMapNodeRenderableFieldsEqual(left: Node, right: Node) {
  for (const selector of MINI_MAP_RENDERABLE_FIELD_SELECTORS) {
    if (selector(left) !== selector(right)) {
      return false;
    }
  }
  return areNodeStylesEqual(left.style, right.style);
}

type MiniMapNodeVisual = {
  background: string | null;
  id: string;
  kind: string;
};

const defaultMiniMapNodesProps = {
  nodeStrokeColor: "transparent",
  nodeColor: "#e2e2e2",
  nodeClassName: "",
  nodeBorderRadius: 5,
  nodeStrokeWidth: 2,
  nodeComponent: MiniMapNode,
} satisfies Pick<
  MiniMapNodesType,
  | "nodeStrokeColor"
  | "nodeColor"
  | "nodeClassName"
  | "nodeBorderRadius"
  | "nodeStrokeWidth"
  | "nodeComponent"
>;

function getMiniMapNodeVisuals(
  state: WorkspaceDocumentState,
  darkMode: boolean,
): Array<MiniMapNodeVisual> {
  const visuals: Array<MiniMapNodeVisual> = [];
  for (const [sectionId, section] of Object.entries(state.sections)) {
    if ((state.parentSectionMap[sectionId] ?? null) !== null) {
      continue;
    }
    visuals.push({
      id: sectionId,
      kind: section.kind,
      background: resolveMiniMapNodeBackground(
        sectionId,
        section.styleColor,
        darkMode,
      ),
    });
  }
  visuals.sort((left, right) => left.id.localeCompare(right.id));
  return visuals;
}

function resolveMiniMapNodeBackground(
  sectionId: string,
  styleColor: string | null,
  darkMode: boolean,
) {
  if (styleColor === null) {
    return null;
  }
  const normalizedStyleColor = styleColor.trim();
  if (normalizedStyleColor === "") {
    return null;
  }
  const theme = deriveSectionStyleTheme(normalizedStyleColor, darkMode);
  if (!theme) {
    throw new Error(
      `Section ${sectionId} has an unparseable style color ${styleColor}.`,
    );
  }
  return theme.bg;
}

function areMiniMapNodeVisualsEqual(
  left: Array<MiniMapNodeVisual>,
  right: Array<MiniMapNodeVisual>,
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftNode = left[index];
    const rightNode = right[index];
    if (!leftNode || !rightNode) {
      return false;
    }
    if (
      leftNode.id !== rightNode.id ||
      leftNode.kind !== rightNode.kind ||
      leftNode.background !== rightNode.background
    ) {
      return false;
    }
  }
  return true;
}

function mergeMiniMapNodesWithVisuals(
  nodes: Array<Node>,
  nodeVisuals: Array<MiniMapNodeVisual>,
): Array<Node> {
  const visualsById = new Map(
    nodeVisuals.map((nodeVisual) => [nodeVisual.id, nodeVisual]),
  );
  return nodes.map((node) => {
    const nodeVisual = visualsById.get(node.id);
    if (!nodeVisual) {
      return node;
    }

    const nextStyle =
      nodeVisual.background !== null
        ? { ...(node.style ?? {}), background: nodeVisual.background }
        : undefined;
    if (
      node.kind === nodeVisual.kind &&
      areNodeStylesEqual(node.style, nextStyle)
    ) {
      return node;
    }
    return {
      ...node,
      kind: nodeVisual.kind,
      style: nextStyle,
    };
  });
}

const getAttrFunction = (
  func: string | GetMiniMapNodeAttribute,
): GetMiniMapNodeAttribute => (typeof func === "function" ? func : () => func);

// The lint gate rejects the reference's underscore-prefixed component names; the memoized
// components inline their named implementations instead.
export const MiniMapNodesReactive = memo(function MiniMapNodesReactive(
  props: MiniMapNodesType,
) {
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const nodes = useNodeInternals(
    selectorNodes,
    areMiniMapNodesRenderableInputsEqual,
  );
  const nodeVisuals = useWorkspaceDocument(
    (state) => getMiniMapNodeVisuals(state, darkMode),
    areMiniMapNodeVisualsEqual,
  );
  const renderableNodes = mergeMiniMapNodesWithVisuals(nodes, nodeVisuals);
  if (readyToBeVisible) {
    return <MiniMapNodes nodes={renderableNodes} {...props} />;
  }
  return null;
});

function resolveMiniMapNodesProps(
  props: MiniMapNodesType & { nodes: Array<Node> },
) {
  return { ...defaultMiniMapNodesProps, ...props };
}

export const MiniMapNodes = memo(function MiniMapNodes(
  props: MiniMapNodesType & { nodes: Array<Node> },
) {
  const {
    nodes,
    nodeStrokeColor,
    nodeColor,
    nodeClassName,
    nodeBorderRadius,
    nodeStrokeWidth,
    nodeComponent: NodeComponent,
    onClick,
  } = resolveMiniMapNodesProps(props);
  const nodeColorFunc = getAttrFunction(nodeColor);
  const nodeStrokeColorFunc = getAttrFunction(nodeStrokeColor);
  const nodeClassNameFunc = getAttrFunction(nodeClassName);
  const renderableNodes = nodes.filter(isRenderableMiniMapNode);

  const isBrowser = typeof window !== "undefined";
  const isChrome = isBrowser && "chrome" in window;
  const shapeRendering =
    !isBrowser || isChrome ? "crispEdges" : "geometricPrecision";

  return (
    <>
      {renderableNodes.map((node, idx) => {
        const { x, y } = node.position;

        return (
          <NodeComponent
            key={`${node.id ?? idx}`}
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            dataMinimapNodeId={node.id}
            className={nodeClassNameFunc(node)}
            color={nodeColorFunc(node)}
            borderRadius={nodeBorderRadius}
            strokeColor={nodeStrokeColorFunc(node)}
            strokeWidth={nodeStrokeWidth}
            shapeRendering={shapeRendering}
            onClick={onClick}
            id={node.id}
          />
        );
      })}
    </>
  );
});
