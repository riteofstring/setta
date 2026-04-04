import {
  selectSettingsGraphSubstrateCanaryLayoutSections,
  type GraphSubstrateCanaryLayoutSection,
} from "components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel";
import _ from "lodash";
import { memo, useMemo } from "react";
import { getNodes } from "state/actions/nodeInternals";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useTemporaryMiscState,
  type ZustandProjectState,
} from "state/definitions";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { useReactFlow } from "../core/store";
import { computeReadyToBeVisible } from "../core/store/utils";
import type { Node } from "../core/types";
import MiniMapNode from "./MiniMapNode";
import type { GetMiniMapNodeAttribute, MiniMapNodesType } from "./types";

function isMiniMapNodeRenderable(node: Node) {
  return !!(node.width && node.height);
}

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
    if (
      leftNode.id !== rightNode.id ||
      leftNode.position.x !== rightNode.position.x ||
      leftNode.position.y !== rightNode.position.y ||
      leftNode.width !== rightNode.width ||
      leftNode.height !== rightNode.height ||
      leftNode.zIndex !== rightNode.zIndex ||
      leftNode.tempZIndex !== rightNode.tempZIndex ||
      leftNode.type !== rightNode.type ||
      !areNodeStylesEqual(leftNode.style, rightNode.style)
    ) {
      return false;
    }
  }
  return true;
}

type MiniMapNodeVisual = {
  background: string | null;
  id: string;
  type: string | null | undefined;
};

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
    if ((state.parentSectionMap[sectionId] ?? null) !== null) {
      continue;
    }
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    if (!state.sectionImpls[variant.impl] || !state.sections[sectionId]) {
      continue;
    }
    const effectiveImpl = getCurrEffectiveSectionImpl(state, sectionId);
    const resolvedStyleColor =
      previewStyleColors[sectionId] === undefined
        ? effectiveImpl.styleColor
        : previewStyleColors[sectionId];
    const theme =
      resolvedStyleColor !== null &&
      resolvedStyleColor !== undefined &&
      resolvedStyleColor.trim() !== ""
        ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
        : null;
    visuals.push({
      id: sectionId,
      type: effectiveImpl.type,
      background: theme?.bg ?? null,
    });
  }
  visuals.sort((left, right) => left.id.localeCompare(right.id));
  return visuals;
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

export function resolveMiniMapRenderableNodes(
  nodes: Node[],
  canarySections: Array<GraphSubstrateCanaryLayoutSection>,
): Node[] {
  if (canarySections.length === 0) {
    return nodes.filter(isMiniMapNodeRenderable);
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const renderableNodes: Node[] = [];

  for (const canarySection of canarySections) {
    const sourceNode = nodesById.get(canarySection.sectionId);
    const width = sourceNode?.width ?? canarySection.width;
    const height = sourceNode?.height ?? canarySection.height;
    if (!width || !height) {
      continue;
    }
    renderableNodes.push({
      ...sourceNode,
      id: canarySection.sectionId,
      position: canarySection.position,
      width,
      height,
      zIndex: canarySection.zIndex,
      tempZIndex: sourceNode?.tempZIndex ?? canarySection.zIndex,
    });
  }

  return renderableNodes;
}

export function useMiniMapRenderableNodes() {
  const nodes = useNodeInternals(
    getNodes,
    areMiniMapNodesRenderableInputsEqual,
  );
  const canarySections = useProjectState(
    selectSettingsGraphSubstrateCanaryLayoutSections,
    _.isEqual,
  );

  return useMemo(() => {
    return resolveMiniMapRenderableNodes(nodes, canarySections);
  }, [canarySections, nodes]);
}

const getAttrFunction = (
  func: string | GetMiniMapNodeAttribute,
): GetMiniMapNodeAttribute => (typeof func === "function" ? func : () => func);

function _MiniMapNodesReactive(props: MiniMapNodesType) {
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const nodes = useMiniMapRenderableNodes();
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

function _MiniMapNodes({
  nodes,
  nodeStrokeColor = "transparent",
  nodeColor = "#e2e2e2",
  nodeClassName = "",
  nodeBorderRadius = 5,
  nodeStrokeWidth = 2,
  nodeComponent: NodeComponent = MiniMapNode,
  onClick,
}: MiniMapNodesType & { nodes: Node[] }) {
  const nodeColorFunc = getAttrFunction(nodeColor);
  const nodeStrokeColorFunc = getAttrFunction(nodeStrokeColor);
  const nodeClassNameFunc = getAttrFunction(nodeClassName);

  const isBrowser = typeof window !== "undefined";
  const isChrome = isBrowser && "chrome" in window;
  const shapeRendering =
    !isBrowser || isChrome ? "crispEdges" : "geometricPrecision";

  return (
    <>
      {nodes.map((node, idx) => {
        const { x, y } = node.position;

        return (
          <NodeComponent
            key={`${node.id ?? idx}`}
            x={x}
            y={y}
            width={node.width!}
            height={node.height!}
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
