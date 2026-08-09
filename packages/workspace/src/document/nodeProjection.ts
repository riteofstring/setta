import type { CSSProperties } from "react";
import { deriveSectionStyleTheme } from "../section/sectionStyleColors";
import { getSectionOrThrow, getTopLevelSectionIdsForDisplay } from "./documentSelectors";
import {
  useWorkspaceAppearance,
  type NodeInternalsState,
  type WorkspaceDocumentState,
} from "./stores";
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
    throw new Error(`Section ${section.id} has an unparseable style color ${styleColor}.`);
  }
  return { background: theme.bg };
}

// Measured DOM size wins over the stored layout size once a node has rendered.
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
  state: WorkspaceDocumentState,
  nodes: NodeInternalsState["x"],
): Map<string, Node> {
  const nodesMap: Map<string, Node> = new Map();
  const darkMode = useWorkspaceAppearance.getState().darkMode;
  for (const sectionId of getTopLevelSectionIdsForDisplay(state)) {
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
