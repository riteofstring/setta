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

// The approved Phase 1 slice is one root leaf plus one root group with a nested leaf. The two
// extra root leaves add no features: they only pre-instantiate the slice-reachable locked and
// style-colored chrome states so the side-by-side gate can compare them without scripted
// setup. Selection states are reached interactively.
export const sliceDocument: WorkspaceDocument = {
  sections: {
    "idle-leaf": makeLeafSection("idle-leaf", "Idle leaf"),
    "locked-leaf": makeLeafSection("locked-leaf", "Locked leaf", {
      positionAndSizeLocked: true,
    }),
    "styled-leaf": makeLeafSection("styled-leaf", "Style-colored leaf", {
      styleColor: "#3b82f6",
    }),
    "root-group": {
      id: "root-group",
      kind: "group",
      name: "Root group",
      size: { width: "auto", height: "auto" },
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      tagColor: null,
      children: ["nested-leaf"],
    },
    "nested-leaf": makeLeafSection("nested-leaf", "Nested leaf"),
  },
  topLevelSections: {
    "idle-leaf": { x: 24, y: 24, w: 224, h: 96, zIndex: 0 },
    "locked-leaf": { x: 312, y: 24, w: 224, h: 96, zIndex: 1 },
    "styled-leaf": { x: 600, y: 24, w: 224, h: 96, zIndex: 2 },
    "root-group": { x: 24, y: 216, w: null, h: null, zIndex: 3 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
};
