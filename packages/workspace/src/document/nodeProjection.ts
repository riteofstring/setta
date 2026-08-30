import type { CSSProperties } from "react";
import { deriveSectionStyleTheme } from "../section/sectionStyleColors";
import { getSectionOrThrow } from "./documentSelectors";
import { getVisibleTopLevelSectionIdsForDisplay } from "./savedViewDisplay";
import {
  getWorkspaceAppearanceStore,
  type NodeInternalsState,
  type WorkspaceDocumentState,
} from "./stores";
import type { WorkspaceHost } from "../workspaceHost";
import type { Node, TopLevelSectionLayout, WorkspaceSection } from "./types";

function getSectionNodeStyle(
  section: WorkspaceSection,
  darkMode: boolean,
): CSSProperties | undefined {
  const styleColor = section.styleColor;
  if (styleColor === null || styleColor.trim() === "") {
    return undefined;
  }
  const theme = deriveSectionStyleTheme(styleColor, darkMode);
  if (!theme) {
    throw new Error(
      `Section ${section.id} has an unparseable style color ${styleColor}.`,
    );
  }
  return { background: theme.bg };
}

function nodeStylesMatch(
  currentStyle: CSSProperties | undefined,
  nextStyle: CSSProperties | undefined,
): boolean {
  if (currentStyle === undefined || nextStyle === undefined) {
    return currentStyle === nextStyle;
  }
  return (
    Object.keys(currentStyle).length === 1 &&
    currentStyle.background === nextStyle.background
  );
}

export function reprojectNodeStylesForAppearance(
  host: WorkspaceHost,
  state: WorkspaceDocumentState,
  nodes: NodeInternalsState["x"],
): Map<string, Node> {
  const darkMode = getWorkspaceAppearanceStore(host).getState().darkMode;
  let nextNodes = nodes;

  for (const [sectionId, node] of nodes) {
    const nextStyle = getSectionNodeStyle(
      getSectionOrThrow(state, sectionId),
      darkMode,
    );
    if (nodeStylesMatch(node.style, nextStyle)) {
      continue;
    }
    if (nextNodes === nodes) {
      nextNodes = new Map(nodes);
    }
    nextNodes.set(sectionId, { ...node, style: nextStyle });
  }

  return nextNodes;
}

function buildTopLevelSectionNode(
  sectionId: string,
  layout: TopLevelSectionLayout,
  existingNode: Node | undefined,
  section: WorkspaceSection,
  darkMode: boolean,
): Node {
  return {
    id: sectionId,
    position: { x: layout.x, y: layout.y },
    width: existingNode?.width ?? layout.w,
    height: existingNode?.height ?? layout.h,
    zIndex: layout.zIndex,
    tempZIndex: layout.zIndex,
    kind: section.kind,
    style: getSectionNodeStyle(section, darkMode),
  };
}

export function createNodesMapFromDocumentChildren(
  host: WorkspaceHost,
  state: WorkspaceDocumentState,
  nodes: NodeInternalsState["x"],
): Map<string, Node> {
  const nodesMap: Map<string, Node> = new Map();
  const darkMode = getWorkspaceAppearanceStore(host).getState().darkMode;
  for (const sectionId of getVisibleTopLevelSectionIdsForDisplay(state)) {
    const layout = state.topLevelSections[sectionId];
    if (!layout) {
      throw new Error(`Missing top-level layout for section ${sectionId}.`);
    }
    nodesMap.set(
      sectionId,
      buildTopLevelSectionNode(
        sectionId,
        layout,
        nodes.get(sectionId),
        getSectionOrThrow(state, sectionId),
        darkMode,
      ),
    );
  }
  return nodesMap;
}
