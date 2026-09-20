import {
  createWorkspaceCodeSectionData,
  createWorkspaceSavedViewsState,
  createWorkspaceTextSectionData,
  DEFAULT_META_CONTROL_SIZE,
  DROPZONE_META_CONTROL_SIZE,
  TEXTAREA_META_CONTROL_SIZE,
  WORKSPACE_CODE_SECTION_KIND,
  WORKSPACE_TEXT_SECTION_KIND,
  type WorkspaceDocumentInput,
  type WorkspaceItem,
  type WorkspaceItemControlPresentation,
  type WorkspaceSectionData,
  type WorkspaceSectionInput,
  type WorkspaceSectionItemTree,
  type WorkspaceSavedView,
  type WorkspaceSavedViewsState,
  type WorkspaceTextSectionData,
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

    data: { body: name },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

const PLAYGROUND_MARKDOWN = [
  "# Release notes",
  "",
  "## Highlights",
  "",
  "The workspace now ships a **text section** with an [editor](https://example.com) and a",
  "rendered surface. Long prose lines wrap inside the section rather than scrolling sideways,",
  "which keeps a narrow section readable at any width.",
  "",
  "### Checklist",
  "",
  "- [x] Plain text and Markdown",
  "- [ ] Host-supplied defaults",
  "",
  "1. Author the text",
  "2. Render it with `Render Markdown`",
  "",
  "| Format   | Editor   | Rendered |",
  "| -------- | -------- | -------- |",
  "| Markdown | CodeMirror | prose  |",
  "| Plain    | CodeMirror | pre    |",
  "",
  "> Locking a section leaves it readable and scrollable.",
  "",
  "The scale factor is $E = mc^2$, applied per section.",
  "",
  "```python",
  "def render(text: str) -> None:",
  "    print(text)",
  "```",
  "",
].join("\n");

function makeTextSection(
  id: string,
  name: string,
  data: Partial<WorkspaceTextSectionData>,
): WorkspaceSectionInput {
  return {
    id,
    kind: WORKSPACE_TEXT_SECTION_KIND,
    name,
    data: createWorkspaceTextSectionData({
      format: "markdown",
      text: PLAYGROUND_MARKDOWN,
      ...data,
    }),
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function makeBuiltInItem(
  id: string,
  label: string,
  labelEditable: boolean,
  control: WorkspaceItemControlPresentation,
  options: { children?: Array<string>; helpText?: string } = {},
): WorkspaceItem {
  const { children = [], helpText } = options;
  return {
    id,
    children,
    presentation: {
      label,
      labelEditable,
      ...(helpText === undefined ? {} : { helpText }),
      control,
    },
  };
}

function makeCodeItem(
  id: string,
  label: string,
  labelEditable: boolean,
  value: string,
  helpText?: string,
): WorkspaceItem {
  return makeBuiltInItem(
    id,
    label,
    labelEditable,
    {
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
    },
    { helpText },
  );
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
    "item-alpha": makeCodeItem(
      "item-alpha",
      "alpha",
      true,
      "0.001",
      "Sets the initial learning rate.\nUse a smaller value when updates become unstable.",
    ),
    "item-beta": makeCodeItem("item-beta", "beta", true, "0.999"),
    "item-gamma": makeCodeItem("item-gamma", "gamma", true, "0.57721"),
    "item-delta": makeCodeItem("item-delta", "delta", false, "4096"),
    "item-epsilon": makeCodeItem("item-epsilon", "epsilon", true, "1e-8"),
    "item-options": makeBuiltInItem(
      "item-options",
      "options",
      true,
      { kind: "group" },
      {
        children: ["item-momentum", "item-decay"],
      },
    ),
    "item-momentum": makeCodeItem(
      "item-momentum",
      "momentum",
      true,
      "0.9",
      "Controls how strongly previous updates influence the next step.",
    ),
    "item-decay": makeCodeItem("item-decay", "decay", true, "1e-4"),
    "item-eta": makeCodeItem("item-eta", "eta", true, "0.25"),
    "item-theta": makeCodeItem("item-theta", "theta", true, "1.618"),
    "item-iota": makeCodeItem("item-iota", "iota", false, "0.05"),
    "item-kappa": makeCodeItem("item-kappa", "kappa", true, "100"),
    "item-lambda": makeCodeItem("item-lambda", "lambda", true, "0.0005"),
    "item-slider": makeBuiltInItem("item-slider", "slider", true, {
      kind: "slider",
      value: "0",
      configuration: { disabled: false, min: 0, max: 100, step: 1 },
    }),
    "item-rotary": makeBuiltInItem("item-rotary", "rotary", true, {
      kind: "rotary",
      value: "0",
      configuration: { disabled: false, min: 0, max: 1, step: 0.1 },
    }),
    "item-date": makeBuiltInItem("item-date", "date", true, {
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
    "item-time": makeBuiltInItem("item-time", "time", true, {
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
    "item-password": makeBuiltInItem("item-password", "password", true, {
      kind: "password",
      value: "",
      configuration: {
        disabled: false,
        placeholder: null,
        savedValuePending: false,
      },
    }),
    "item-textarea": makeBuiltInItem("item-textarea", "textarea", true, {
      kind: "textarea",
      value: "",
      configuration: {
        autocomplete: "off",
        disabled: false,
        language: null,
        placeholder: null,
      },
    }),
    "item-dropzone": makeBuiltInItem("item-dropzone", "dropzone", true, {
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
    "item-enabled": makeBuiltInItem("item-enabled", "enabled", true, {
      kind: "switch",
      value: "true",
      configuration: { disabled: false },
    }),
    "item-choice": makeBuiltInItem("item-choice", "choice", true, {
      kind: "dropdown",
      value: "",
      configuration: {
        disabled: false,
        choices: ["Alpha", "Beta", "Gamma"],
        placeholder: null,
      },
    }),
    "item-accent": makeBuiltInItem("item-accent", "accent", true, {
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
    "item-tint": makeBuiltInItem("item-tint", "tint", true, {
      kind: "color",
      value: "#afbacf",
      configuration: { disabled: false, choices: null },
    }),
    "item-rename": makeCodeItem("item-rename", "rename_me", true, ""),
  },
  selectedItemIds: [],
};

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
    overflowMode: false,
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

    data,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

const playgroundDocumentBase: WorkspaceDocumentInput = {
  sections: {
    "idle-leaf": makeLeafSection("idle-leaf", "Idle leaf", {
      tagColor: "#0f766e",
    }),
    "locked-leaf": makeLeafSection("locked-leaf", "Locked leaf", {
      positionAndSizeLocked: true,
    }),
    "styled-leaf": makeLeafSection("styled-leaf", "Style-colored leaf", {
      styleColor: "#3b82f6",
    }),
    "root-group": makeGroupSection(
      "root-group",
      "Root group",
      ["nested-leaf", "middle-group"],
      {
        overflowMode: true,
        size: { width: 520, height: 360 },
      },
    ),
    "nested-leaf": makeLeafSection("nested-leaf", "Nested leaf", {
      tagColor: "#f97316",
    }),
    "middle-group": makeGroupSection("middle-group", "Nested group", [
      "inner-group",
    ]),
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
      overflowMode: false,
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

    "code-editor": {
      id: "code-editor",
      kind: WORKSPACE_CODE_SECTION_KIND,
      name: "train.py",
      data: createWorkspaceCodeSectionData({
        code: [
          "import setta",
          "",
          "",
          "def train(alpha: float = 0.001, beta: float = 0.99) -> None:",
          '    """Run one training pass."""',
          "    for step in range(10):",
          "        print(step, alpha * beta)",
          "",
        ].join("\n"),
      }),
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      overflowMode: false,
      tagColor: null,
      children: [],
    },

    "text-rendered": makeTextSection("text-rendered", "Release notes", {
      displayMode: "render",
    }),
    "text-source": makeTextSection("text-source", "Release notes source", {
      displayMode: "edit",
    }),
  },
  topLevelSections: {
    "idle-leaf": { x: 24, y: 24, w: 200, h: 122, zIndex: 0 },
    "locked-leaf": { x: 312, y: 24, w: 200, h: 122, zIndex: 1 },
    "styled-leaf": { x: 600, y: 24, w: 200, h: 122, zIndex: 2 },
    "root-group": { x: 24, y: 216, w: null, h: null, zIndex: 3 },

    "item-panel": { x: 600, y: 216, w: 550, h: 350, zIndex: 4 },

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

    "code-editor": { x: 2320, y: 24, w: 500, h: null, zIndex: 17 },

    "text-rendered": { x: 2320, y: 420, w: 500, h: 260, zIndex: 18 },
    "text-source": { x: 2860, y: 420, w: 500, h: 260, zIndex: 19 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
  savedViews: null,
};

function createPlaygroundSavedView(
  overview: WorkspaceSavedView,
  document: WorkspaceDocumentInput,
  {
    id,
    name,
    sectionIds,
    topLevelSections,
    viewport,
  }: {
    id: string;
    name: string;
    sectionIds: ReadonlySet<string>;
    topLevelSections: WorkspaceSavedView["topLevelSections"];
    viewport: WorkspaceSavedView["viewport"];
  },
): WorkspaceSavedView {
  return {
    ...overview,
    id,
    name,
    sectionVisibility: Object.fromEntries(
      Object.keys(document.sections).map((sectionId) => [
        sectionId,
        sectionIds.has(sectionId),
      ]),
    ),
    sortIndex: 0,
    topLevelSections,
    viewport,
  };
}

function createPlaygroundSavedViews(
  document: WorkspaceDocumentInput,
): WorkspaceSavedViewsState {
  const overviewState = createWorkspaceSavedViewsState(document, {
    id: "overview",
    isTab: true,
    name: "Overview",
  });
  const overview = overviewState.views.overview;
  if (overview === undefined) {
    throw new Error("The playground Overview view is unavailable.");
  }
  const content = createPlaygroundSavedView(overview, document, {
    id: "content",
    name: "Content",
    sectionIds: new Set([
      "item-panel",
      "code-editor",
      "text-rendered",
      "text-source",
    ]),
    topLevelSections: {
      ...overview.topLevelSections,
      "item-panel": { h: 350, w: 550, x: 24, y: 24, zIndex: 0 },
      "code-editor": { h: null, w: 500, x: 624, y: 24, zIndex: 1 },
      "text-rendered": { h: 260, w: 500, x: 624, y: 420, zIndex: 2 },
      "text-source": { h: 260, w: 500, x: 1_164, y: 420, zIndex: 3 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  const controls = createPlaygroundSavedView(overview, document, {
    id: "controls",
    name: "Controls",
    sectionIds: new Set(
      Object.keys(document.sections).filter((sectionId) =>
        sectionId.startsWith("meta-"),
      ),
    ),
    topLevelSections: {
      ...overview.topLevelSections,
      "meta-dropdown": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 24,
        y: 24,
        zIndex: 0,
      },
      "meta-slider": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 304,
        y: 24,
        zIndex: 1,
      },
      "meta-rotary": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 584,
        y: 24,
        zIndex: 2,
      },
      "meta-switch": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 864,
        y: 24,
        zIndex: 3,
      },
      "meta-text": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 24,
        y: 110,
        zIndex: 4,
      },
      "meta-date": {
        h: null,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 304,
        y: 110,
        zIndex: 5,
      },
      "meta-time": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 584,
        y: 110,
        zIndex: 6,
      },
      "meta-textarea": {
        h: TEXTAREA_META_CONTROL_SIZE.height,
        w: TEXTAREA_META_CONTROL_SIZE.width,
        x: 864,
        y: 110,
        zIndex: 7,
      },
      "meta-password": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 24,
        y: 220,
        zIndex: 8,
      },
      "meta-color": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 304,
        y: 220,
        zIndex: 9,
      },
      "meta-button": {
        h: DEFAULT_META_CONTROL_SIZE.height,
        w: DEFAULT_META_CONTROL_SIZE.width,
        x: 584,
        y: 220,
        zIndex: 10,
      },
      "meta-dropzone": {
        h: DROPZONE_META_CONTROL_SIZE.height,
        w: DROPZONE_META_CONTROL_SIZE.width,
        x: 864,
        y: 220,
        zIndex: 11,
      },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  return {
    activeViewId: overview.id,
    views: {
      [overview.id]: overview,
      [content.id]: { ...content, sortIndex: 1 },
      [controls.id]: { ...controls, sortIndex: 2 },
    },
  };
}

export const playgroundDocument: WorkspaceDocumentInput = {
  ...playgroundDocumentBase,
  savedViews: createPlaygroundSavedViews(playgroundDocumentBase),
};
