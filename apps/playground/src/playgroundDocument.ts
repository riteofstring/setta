import type {
  WorkspaceDocumentInput,
  WorkspaceItem,
  WorkspaceSectionData,
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

// The item panel's rows: the label/value/group/control shape is this host's opaque item data —
// the package sees only ids, ordered children, and selection. One nested group keeps
// cross-parent item movement reachable, and the leaf count fills the recorded 552 x 352 outer
// geometry so the repeated 20 px row rhythm stays inspectable against the frozen `/settings`
// Dict. The item-controls rows exercise every built-in control the milestone has landed: the
// switch at the captured `enabled` fixture, the empty dropdown over the captured
// Alpha/Beta/Gamma choices, the configured color trigger over the captured Red/Green/Blue
// choices, the native color input at the `/settings` recorded value, and the captured editable
// `rename_me` name seam. The remaining-controls continuation adds the captured ordinary slider
// (0..100 by 1) and rotary (0..1 by 0.1) rows through the same opaque configuration shape. Name
// validation remains host-owned opaque-data policy.
function makeItem(
  id: string,
  data: Record<string, WorkspaceSectionData>,
  children: Array<string> = [],
): WorkspaceItem {
  return { id, children, data };
}

const itemPanelTree: WorkspaceSectionItemTree = {
  rootId: "item-root",
  items: {
    "item-root": makeItem("item-root", {}, [
      "item-alpha",
      "item-beta",
      "item-gamma",
      "item-delta",
      "item-epsilon",
      "item-options",
      "item-eta",
      "item-theta",
      "item-iota",
      "item-kappa",
      "item-lambda",
      "item-slider",
      "item-rotary",
      "item-enabled",
      "item-choice",
      "item-accent",
      "item-tint",
      "item-rename",
    ]),
    "item-alpha": makeItem("item-alpha", { label: "alpha", value: "0.001" }),
    "item-beta": makeItem("item-beta", { label: "beta", value: "0.999" }),
    "item-gamma": makeItem("item-gamma", { label: "gamma", value: "0.57721" }),
    "item-delta": makeItem("item-delta", { label: "delta", value: "4096" }),
    "item-epsilon": makeItem("item-epsilon", { label: "epsilon", value: "1e-8" }),
    "item-options": makeItem("item-options", { label: "options", group: true }, [
      "item-momentum",
      "item-decay",
    ]),
    "item-momentum": makeItem("item-momentum", { label: "momentum", value: "0.9" }),
    "item-decay": makeItem("item-decay", { label: "decay", value: "1e-4" }),
    "item-eta": makeItem("item-eta", { label: "eta", value: "0.25" }),
    "item-theta": makeItem("item-theta", { label: "theta", value: "1.618" }),
    "item-iota": makeItem("item-iota", { label: "iota", value: "0.05" }),
    "item-kappa": makeItem("item-kappa", { label: "kappa", value: "100" }),
    "item-lambda": makeItem("item-lambda", { label: "lambda", value: "0.0005" }),
    "item-slider": makeItem("item-slider", {
      label: "slider",
      value: "0",
      control: "slider",
      min: 0,
      max: 100,
      step: 1,
    }),
    "item-rotary": makeItem("item-rotary", {
      label: "rotary",
      value: "0",
      control: "rotary",
      min: 0,
      max: 1,
      step: 0.1,
    }),
    "item-enabled": makeItem("item-enabled", {
      label: "enabled",
      value: "true",
      control: "switch",
    }),
    "item-choice": makeItem("item-choice", {
      label: "choice",
      value: "",
      control: "dropdown",
      choices: ["Alpha", "Beta", "Gamma"],
    }),
    "item-accent": makeItem("item-accent", {
      label: "accent",
      value: "#22c55e",
      control: "color",
      choices: [
        { color: "#ef4444", description: "Red" },
        { color: "#22c55e", description: "Green" },
        { color: "#3b82f6", description: "Blue" },
      ],
    }),
    "item-tint": makeItem("item-tint", { label: "tint", value: "#afbacf", control: "color" }),
    "item-rename": makeItem("item-rename", {
      label: "rename_me",
      value: "",
      editableName: true,
    }),
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
    // The recorded `/settings` Dict measurement (552 x 352) is the complete outer section;
    // document dimensions describe the inner surface the shell borders by 1 px per side.
    "item-panel": { x: 600, y: 216, w: 550, h: 350, zIndex: 4 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
};
