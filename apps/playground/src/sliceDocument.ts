import type { WorkspaceDocument, WorkspaceSection } from "@setta/workspace";

function makeLeafSection(
  id: string,
  name: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name,
    size: { width: 224, height: 96 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

// The Phase 1 chrome states as a workspace document: idle, locked, and style-colored leaves.
// Selection states are reached interactively instead of being hardcoded previews.
export const sliceDocument: WorkspaceDocument = {
  sections: {
    "idle-leaf": makeLeafSection("idle-leaf", "Idle leaf"),
    "locked-leaf": makeLeafSection("locked-leaf", "Locked leaf", {
      positionAndSizeLocked: true,
    }),
    "styled-leaf": makeLeafSection("styled-leaf", "Style-colored leaf", {
      styleColor: "#3b82f6",
    }),
  },
  topLevelSections: {
    "idle-leaf": { x: 24, y: 24, w: 224, h: 96, zIndex: 0 },
    "locked-leaf": { x: 312, y: 24, w: 224, h: 96, zIndex: 1 },
    "styled-leaf": { x: 600, y: 24, w: 224, h: 96, zIndex: 2 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
};
