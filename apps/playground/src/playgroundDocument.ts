import type {
  WorkspaceDocumentInput,
  WorkspaceItem,
  WorkspaceSectionInput,
  WorkspaceSectionItemTree,
} from "@setta/workspace";

function makeLeafSection(
  id: string,
  name: string,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id,
    kind: "leaf",
    name,
    // The body text is the leaf kind's opaque data; the size comes from the kind's registered
    // default (the accepted 200 x 122 leaf geometry).
    data: { body: name },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

// The item panel's rows: the label/value/group shape is this host's opaque item data — the
// package sees only ids, ordered children, and selection. One nested group keeps cross-parent
// item movement reachable.
function makeItem(
  id: string,
  data: Record<string, string | boolean>,
  children: Array<string> = [],
): WorkspaceItem {
  return { id, children, data };
}

const itemPanelTree: WorkspaceSectionItemTree = {
  rootId: "item-root",
  items: {
    "item-root": makeItem("item-root", {}, ["item-alpha", "item-options", "item-beta"]),
    "item-alpha": makeItem("item-alpha", { label: "alpha", value: "0.001" }),
    "item-options": makeItem("item-options", { label: "options", group: true }, [
      "item-momentum",
      "item-decay",
    ]),
    "item-momentum": makeItem("item-momentum", { label: "momentum", value: "0.9" }),
    "item-decay": makeItem("item-decay", { label: "decay", value: "1e-4" }),
    "item-beta": makeItem("item-beta", { label: "beta", value: "0.999" }),
  },
  selectedItemIds: [],
};

// Groups have no registered kind; without an explicit size they load at the reference's
// auto/auto default.
function makeGroupSection(
  id: string,
  name: string,
  children: Array<string>,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id,
    kind: "group",
    name,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children,
    ...overrides,
  };
}

// The accepted Phase 1 chrome states (idle, locked, style-colored root leaves) plus Phase 3's
// representative recursive structure from the Phase 0 captures: the root group holds a nested
// leaf and a nested group, which holds a horizontal group with three leaves — three group
// levels with both child flows, leaves at the fourth. The freeform surface is the top-level
// workspace layout itself, exactly as the reference: groups flow their children in order.
// Phase 4 adds the item panel: a section whose registered kind renders the package item list
// from this host's opaque item data.
export const playgroundDocument: WorkspaceDocumentInput = {
  sections: {
    "idle-leaf": makeLeafSection("idle-leaf", "Idle leaf"),
    "locked-leaf": makeLeafSection("locked-leaf", "Locked leaf", {
      positionAndSizeLocked: true,
    }),
    "styled-leaf": makeLeafSection("styled-leaf", "Style-colored leaf", {
      styleColor: "#3b82f6",
    }),
    "root-group": makeGroupSection("root-group", "Root group", ["nested-leaf", "middle-group"]),
    "nested-leaf": makeLeafSection("nested-leaf", "Nested leaf"),
    "middle-group": makeGroupSection("middle-group", "Nested group", ["inner-group"]),
    "inner-group": makeGroupSection(
      "inner-group",
      "Horizontal group",
      ["first-row-leaf", "second-row-leaf", "third-row-leaf"],
      { isHorizontalOrientation: true },
    ),
    "first-row-leaf": makeLeafSection("first-row-leaf", "First row leaf"),
    "second-row-leaf": makeLeafSection("second-row-leaf", "Second row leaf"),
    "third-row-leaf": makeLeafSection("third-row-leaf", "Third row leaf"),
    "item-panel": {
      id: "item-panel",
      kind: "item-list",
      name: "Item panel",
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      tagColor: null,
      children: [],
      itemTree: itemPanelTree,
    },
  },
  topLevelSections: {
    "idle-leaf": { x: 24, y: 24, w: 200, h: 122, zIndex: 0 },
    "locked-leaf": { x: 312, y: 24, w: 200, h: 122, zIndex: 1 },
    "styled-leaf": { x: 600, y: 24, w: 200, h: 122, zIndex: 2 },
    "root-group": { x: 24, y: 216, w: null, h: null, zIndex: 3 },
    "item-panel": { x: 600, y: 216, w: 280, h: 240, zIndex: 4 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
};
