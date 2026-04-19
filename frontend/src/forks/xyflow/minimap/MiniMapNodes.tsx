import { memo } from "react";
import { getNodes } from "state/actions/nodeInternals";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useTemporaryMiscState,
  type ZustandNodeInternalsState,
  type ZustandProjectState,
} from "state/definitions";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { useReactFlow } from "../core/store";
import { computeReadyToBeVisible } from "../core/store/utils";
import type { Node } from "../core/types";
import MiniMapNode from "./MiniMapNode";
import type { GetMiniMapNodeAttribute, MiniMapNodesType } from "./types";

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

const selectorNodes = (s: ZustandNodeInternalsState) =>
  getNodes(s).filter(isRenderableMiniMapNode);

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
  left: Node[],
  right: Node[],
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
  (node: Node) => node.type,
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
  type: string | null | undefined;
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

const SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX = "section-style-preview-color-";

type MiniMapPreviewStyleColors = Record<string, string | null>;

function getMiniMapPreviewStyleColors(
  state: Record<string, unknown>,
): MiniMapPreviewStyleColors {
  const previewColors: MiniMapPreviewStyleColors = {};
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith(SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX)) {
      continue;
    }
    const sectionId = key.slice(SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX.length);
    previewColors[sectionId] = typeof value === "string" ? value : null;
  }
  return previewColors;
}

function areMiniMapPreviewStyleColorsEqual(
  left: MiniMapPreviewStyleColors,
  right: MiniMapPreviewStyleColors,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function getMiniMapNodeVisuals(
  state: ZustandProjectState,
  darkMode: boolean,
  previewStyleColors: MiniMapPreviewStyleColors,
): MiniMapNodeVisual[] {
  const visuals: MiniMapNodeVisual[] = [];
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const visual = resolveMiniMapNodeVisual(
      state,
      sectionId,
      variantId,
      darkMode,
      previewStyleColors,
    );
    if (visual) {
      visuals.push(visual);
    }
  }
  visuals.sort((left, right) => left.id.localeCompare(right.id));
  return visuals;
}

function resolveMiniMapNodeVisual(
  state: ZustandProjectState,
  sectionId: string,
  variantId: string,
  darkMode: boolean,
  previewStyleColors: MiniMapPreviewStyleColors,
): MiniMapNodeVisual | null {
  if ((state.parentSectionMap[sectionId] ?? null) !== null) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (
    !variant ||
    !state.sections[sectionId] ||
    !state.sectionImpls[variant.impl]
  ) {
    return null;
  }
  const effectiveImpl = getCurrEffectiveSectionImpl(state, sectionId);
  return {
    id: sectionId,
    type: effectiveImpl.type,
    background: resolveMiniMapNodeBackground(
      previewStyleColors[sectionId] === undefined
        ? effectiveImpl.styleColor
        : previewStyleColors[sectionId],
      darkMode,
    ),
  };
}

function resolveMiniMapNodeBackground(
  styleColor: string | null | undefined,
  darkMode: boolean,
) {
  if (styleColor === null || styleColor === undefined) {
    return null;
  }
  const normalizedStyleColor = styleColor.trim();
  if (normalizedStyleColor === "") {
    return null;
  }
  return deriveSectionStyleTheme(normalizedStyleColor, darkMode).bg;
}

function areMiniMapNodeVisualsEqual(
  left: MiniMapNodeVisual[],
  right: MiniMapNodeVisual[],
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
      leftNode.type !== rightNode.type ||
      leftNode.background !== rightNode.background
    ) {
      return false;
    }
  }
  return true;
}

function mergeMiniMapNodesWithVisuals(
  nodes: Node[],
  nodeVisuals: MiniMapNodeVisual[],
): Node[] {
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
      node.type === nodeVisual.type &&
      areNodeStylesEqual(node.style, nextStyle)
    ) {
      return node;
    }
    return {
      ...node,
      type: nodeVisual.type,
      style: nextStyle,
    };
  });
}

const getAttrFunction = (
  func: string | GetMiniMapNodeAttribute,
): GetMiniMapNodeAttribute => (typeof func === "function" ? func : () => func);

function _MiniMapNodesReactive(props: MiniMapNodesType) {
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const nodes = useNodeInternals(
    selectorNodes,
    areMiniMapNodesRenderableInputsEqual,
  );
  const previewStyleColors = useTemporaryMiscState(
    getMiniMapPreviewStyleColors,
    areMiniMapPreviewStyleColorsEqual,
  );
  const nodeVisuals = useProjectState(
    (state) => getMiniMapNodeVisuals(state, darkMode, previewStyleColors),
    areMiniMapNodeVisualsEqual,
  );
  const renderableNodes = mergeMiniMapNodesWithVisuals(nodes, nodeVisuals);
  if (readyToBeVisible) {
    return <MiniMapNodes nodes={renderableNodes} {...props} />;
  }
  return null;
}

export const MiniMapNodesReactive = memo(_MiniMapNodesReactive);

function resolveMiniMapNodesProps(props: MiniMapNodesType & { nodes: Node[] }) {
  return {
    ...defaultMiniMapNodesProps,
    ...props,
    nodeStrokeColor:
      props.nodeStrokeColor ?? defaultMiniMapNodesProps.nodeStrokeColor,
    nodeColor: props.nodeColor ?? defaultMiniMapNodesProps.nodeColor,
    nodeClassName: props.nodeClassName ?? defaultMiniMapNodesProps.nodeClassName,
    nodeBorderRadius:
      props.nodeBorderRadius ?? defaultMiniMapNodesProps.nodeBorderRadius,
    nodeStrokeWidth:
      props.nodeStrokeWidth ?? defaultMiniMapNodesProps.nodeStrokeWidth,
    nodeComponent: props.nodeComponent ?? defaultMiniMapNodesProps.nodeComponent,
  };
}

function _MiniMapNodes(props: MiniMapNodesType & { nodes: Node[] }) {
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
}

export const MiniMapNodes = memo(_MiniMapNodes);
