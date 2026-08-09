import {
  DEFAULT_META_CONTROL_SIZE,
  DROPZONE_META_CONTROL_SIZE,
  TEXTAREA_META_CONTROL_SIZE,
  type WorkspaceDocumentInput,
  type WorkspaceItem,
  type WorkspaceItemControlPresentation,
  type WorkspaceSectionData,
  type WorkspaceSectionInput,
  type WorkspaceSectionItemTree,
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

// The item panel now uses the package-owned discriminated presentation directly. One explicit
// group keeps cross-parent movement reachable, while every scalar row exercises the accepted
// built-in ordinary controls without a host decoder or row renderer.
function makeBuiltInItem(
  id: string,
  label: string,
  control: WorkspaceItemControlPresentation,
  children: Array<string> = [],
): WorkspaceItem {
  return { id, children, presentation: { label, control } };
}

function makeCodeItem(id: string, label: string, value: string): WorkspaceItem {
  return makeBuiltInItem(id, label, {
    kind: "code",
    value,
    configuration: {
      autocomplete: "off",
      disabled: false,
      language: "python",
      placeholder: null,
      singleLine: false,
      wrapLines: true,
    },
  });
}

const itemPanelTree: WorkspaceSectionItemTree = {
  rootId: "item-root",
  items: {
    "item-root": {
      id: "item-root",
      children: [
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
        "item-password",
        "item-textarea",
        "item-date",
        "item-time",
        "item-dropzone",
        "item-enabled",
        "item-choice",
        "item-accent",
        "item-tint",
        "item-rename",
      ],
    },
    "item-alpha": makeCodeItem("item-alpha", "alpha", "0.001"),
    "item-beta": makeCodeItem("item-beta", "beta", "0.999"),
    "item-gamma": makeCodeItem("item-gamma", "gamma", "0.57721"),
    "item-delta": makeCodeItem("item-delta", "delta", "4096"),
    "item-epsilon": makeCodeItem("item-epsilon", "epsilon", "1e-8"),
    "item-options": makeBuiltInItem("item-options", "options", { kind: "group" }, [
      "item-momentum",
      "item-decay",
    ]),
    "item-momentum": makeCodeItem("item-momentum", "momentum", "0.9"),
    "item-decay": makeCodeItem("item-decay", "decay", "1e-4"),
    "item-eta": makeCodeItem("item-eta", "eta", "0.25"),
    "item-theta": makeCodeItem("item-theta", "theta", "1.618"),
    "item-iota": makeCodeItem("item-iota", "iota", "0.05"),
    "item-kappa": makeCodeItem("item-kappa", "kappa", "100"),
    "item-lambda": makeCodeItem("item-lambda", "lambda", "0.0005"),
    "item-slider": makeBuiltInItem("item-slider", "slider", {
      kind: "slider",
      value: "0",
      configuration: { disabled: false, min: 0, max: 100, step: 1 },
    }),
    "item-rotary": makeBuiltInItem("item-rotary", "rotary", {
      kind: "rotary",
      value: "0",
      configuration: { disabled: false, min: 0, max: 1, step: 0.1 },
    }),
    "item-date": makeBuiltInItem("item-date", "date", {
      kind: "date",
      value: "2026-08-12",
      configuration: {
        disabled: false,
        displayFormat: "iso",
        controlMode: "input",
        selectionMode: "single",
        weekStart: "sunday",
        includeTime: false,
        timeDisplayFormat: "twenty_four_hour",
      },
    }),
    "item-time": makeBuiltInItem("item-time", "time", {
      kind: "time",
      value: "13:45",
      configuration: {
        disabled: false,
        controlMode: "input",
        displayFormat: "twenty_four_hour",
        transparent: false,
        scale: 1,
        font: "monospace",
      },
    }),
    "item-password": makeBuiltInItem("item-password", "password", {
      kind: "password",
      value: "",
      configuration: { disabled: false, placeholder: null, savedValuePending: false },
    }),
    "item-textarea": makeBuiltInItem("item-textarea", "textarea", {
      kind: "textarea",
      value: "",
      configuration: {
        autocomplete: "off",
        disabled: false,
        language: null,
        placeholder: null,
      },
    }),
    "item-dropzone": makeBuiltInItem("item-dropzone", "dropzone", {
      kind: "dropzone",
      value: "",
      configuration: {
        disabled: false,
        attachments: [],
        policy: {
          maxAttachments: null,
          maxFileBytes: 26_214_400,
          maxTotalBytes: null,
          allowedMimePrefixes: [],
        },
        placeholder: "Drop a file here",
        pending: false,
        errorMessage: null,
      },
    }),
    "item-enabled": makeBuiltInItem("item-enabled", "enabled", {
      kind: "switch",
      value: "true",
      configuration: { disabled: false },
    }),
    "item-choice": makeBuiltInItem("item-choice", "choice", {
      kind: "dropdown",
      value: "",
      configuration: {
        disabled: false,
        choices: ["Alpha", "Beta", "Gamma"],
        placeholder: null,
      },
    }),
    "item-accent": makeBuiltInItem("item-accent", "accent", {
      kind: "color",
      value: "#22c55e",
      configuration: {
        disabled: false,
        choices: [
          { color: "#ef4444", description: "Red" },
          { color: "#22c55e", description: "Green" },
          { color: "#3b82f6", description: "Blue" },
        ],
      },
    }),
    "item-tint": makeBuiltInItem("item-tint", "tint", {
      kind: "color",
      value: "#afbacf",
      configuration: { disabled: false, choices: null },
    }),
    "item-rename": makeCodeItem("item-rename", "rename_me", ""),
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

function makeMetaControlSection(
  id: string,
  name: string,
  data: Record<string, WorkspaceSectionData>,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id,
    kind: "meta-control",
    name,
    // The package resolves omitted sizes from the projected control kind. The calendar fixture
    // alone keeps auto height so its live month grid can expand like frozen main.
    data,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

// The accepted Phase 1 chrome states (idle, locked, style-colored root leaves) plus Phase 3's
// representative recursive structure from the Phase 0 captures: the root group holds a nested
// leaf and a nested group, which holds a horizontal group with three leaves — three group
// levels with both child flows, leaves at the fourth. The freeform surface is the top-level
// workspace layout itself, exactly as the reference: groups flow their children in order.
// The workspace-shell milestone moves the item panel onto the typed built-in schema; the
// meta-control fixture remains host-owned opaque section data by design.
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
    "meta-button": makeMetaControlSection("meta-button", "Button", {
      control: "button",
      label: "Trigger",
      disabled: false,
      pending: false,
      showSectionTitle: false,
      actionCount: 0,
      editRequests: 0,
    }),
    "meta-text": makeMetaControlSection("meta-text", "Text", {
      control: "text",
      value: "",
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-dropdown": makeMetaControlSection("meta-dropdown", "Dropdown", {
      control: "dropdown",
      value: "",
      choices: ["Alpha", "Beta", "Gamma"],
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-slider": makeMetaControlSection("meta-slider", "Slider", {
      control: "slider",
      value: "0",
      min: 0,
      max: 100,
      step: 1,
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-rotary": makeMetaControlSection("meta-rotary", "Rotary", {
      control: "rotary",
      value: "0",
      min: 0,
      max: 1,
      step: 0.1,
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-switch": makeMetaControlSection("meta-switch", "Switch", {
      control: "switch",
      label: "thick_otter",
      value: "false",
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-date": makeMetaControlSection(
      "meta-date",
      "Date",
      {
        control: "date",
        value: '["2026-08-12"]',
        displayFormat: "iso",
        controlMode: "calendar",
        selectionMode: "multiple",
        weekStart: "sunday",
        includeTime: false,
        timeDisplayFormat: "twenty_four_hour",
        disabled: false,
        showSectionTitle: false,
        editRequests: 0,
      },
      { size: { width: DEFAULT_META_CONTROL_SIZE.width, height: "auto" } },
    ),
    "meta-time": makeMetaControlSection("meta-time", "Time", {
      control: "time",
      value: "13:45",
      controlMode: "input",
      displayFormat: "twenty_four_hour",
      transparent: false,
      scale: 1,
      font: "monospace",
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-textarea": makeMetaControlSection("meta-textarea", "TextArea", {
      control: "textarea",
      value: "first line\nsecond line",
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-password": makeMetaControlSection("meta-password", "Password", {
      control: "password",
      value: "",
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-color": makeMetaControlSection("meta-color", "Color", {
      control: "color",
      value: "#ef4444",
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
    "meta-dropzone": makeMetaControlSection("meta-dropzone", "Dropzone", {
      control: "dropzone",
      attachments: [],
      maxAttachments: null,
      maxFileBytes: 26_214_400,
      maxTotalBytes: null,
      allowedMimePrefixes: [],
      serverPicker: true,
      pending: false,
      errorMessage: "",
      disabled: false,
      showSectionTitle: false,
      editRequests: 0,
    }),
  },
  topLevelSections: {
    "idle-leaf": { x: 24, y: 24, w: 200, h: 122, zIndex: 0 },
    "locked-leaf": { x: 312, y: 24, w: 200, h: 122, zIndex: 1 },
    "styled-leaf": { x: 600, y: 24, w: 200, h: 122, zIndex: 2 },
    "root-group": { x: 24, y: 216, w: null, h: null, zIndex: 3 },
    // The recorded `/settings` Dict measurement (552 x 352) is the complete outer section;
    // document dimensions describe the inner surface the shell borders by 1 px per side.
    "item-panel": { x: 600, y: 216, w: 550, h: 350, zIndex: 4 },
    // The twelve controls follow frozen main's four-column by three-row fixture. Document
    // dimensions describe the inner surface; the package shell contributes one pixel per side.
    "meta-dropdown": {
      x: 1200,
      y: 24,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 5,
    },
    "meta-slider": {
      x: 1480,
      y: 24,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 6,
    },
    "meta-rotary": {
      x: 1760,
      y: 24,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 7,
    },
    "meta-switch": {
      x: 2040,
      y: 24,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 8,
    },
    "meta-text": {
      x: 1200,
      y: 110,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 9,
    },
    "meta-date": {
      x: 1480,
      y: 110,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: null,
      zIndex: 10,
    },
    "meta-time": {
      x: 1760,
      y: 110,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 11,
    },
    "meta-textarea": {
      x: 2040,
      y: 110,
      w: TEXTAREA_META_CONTROL_SIZE.width,
      h: TEXTAREA_META_CONTROL_SIZE.height,
      zIndex: 12,
    },
    "meta-password": {
      x: 1200,
      y: 220,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 13,
    },
    "meta-color": {
      x: 1480,
      y: 220,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 14,
    },
    "meta-button": {
      x: 1760,
      y: 220,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 15,
    },
    "meta-dropzone": {
      x: 2040,
      y: 220,
      w: DROPZONE_META_CONTROL_SIZE.width,
      h: DROPZONE_META_CONTROL_SIZE.height,
      zIndex: 16,
    },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
};
