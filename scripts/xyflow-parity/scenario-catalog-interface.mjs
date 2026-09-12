import {
  DESKTOP_VIEWPORT,
  TALL_WIDE_VIEWPORT,
  WIDE_VIEWPORT,
  sectionSelector,
} from "./scenario-catalog-values.mjs";

export const PLAYGROUND_INTERFACE_PARITY_SCENARIOS = Object.freeze([
  {
    actions: [
      {
        id: "open-section-context-menu",
        kind: "context-menu",
        relativePoint: { x: 0.12, y: 0.72 },
        selector: '[data-section-id="styled-leaf"][role="group"]',
      },
    ],
    coverage: ["menus"],
    fixtureId: "playground-document",
    id: "section-context-menu-light",
    requiredSelectors: ['[role="menu"]'],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-workspace-navigator",
        selector: '[aria-label="Open workspace navigator"]',
      },
      {
        id: "select-find-mode",
        selector: '[role="tab"][id$="-find-tab"]',
      },
      {
        id: "find-idle-leaf",
        kind: "type",
        selector: '[aria-label="Find in workspace"]',
        text: "idle",
      },
    ],
    coverage: ["menus"],
    fixtureId: "playground-document",
    id: "workspace-find-light",
    requiredSelectors: [
      '[role="dialog"][aria-label="Workspace navigator"]',
      '[aria-label="Find in workspace"]',
      '[aria-label="Find results"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-actions",
        selector:
          '[data-section-id="styled-leaf"][role="group"] button[aria-label="Open section actions"]',
      },
    ],
    coverage: ["menus", "overlay"],
    fixtureId: "playground-document",
    id: "section-actions-popover-light",
    requiredSelectors: ['[role="menu"]'],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [],
    coverage: ["controls", "sections"],
    fixtureId: "playground-document",
    id: "registered-section-families-wide-light",
    requiredSelectors: [
      sectionSelector("idle-leaf"),
      '[data-id="root-group"]',
      sectionSelector("item-panel"),
      sectionSelector("meta-button"),
      sectionSelector("meta-color"),
      sectionSelector("code-editor"),
      sectionSelector("text-rendered"),
      sectionSelector("text-source"),
    ],
    theme: "light",
    viewport: WIDE_VIEWPORT,
    viewportId: "wide",
  },
  {
    actions: [
      {
        delta: { x: 84, y: 48 },
        id: "resize-styled-leaf",
        kind: "drag",
        selector:
          '[data-section-id="styled-leaf"] .section-resize-handle-bottom-right',
      },
    ],
    coverage: ["sections", "sizing"],
    fixtureId: "playground-document",
    id: "section-resized-light",
    requiredSelectors: [
      '[data-section-id="styled-leaf"] .section-resize-handle-bottom-right',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "stack-root-group-children",
        selector:
          '[data-id="root-group"] button[aria-label="Flow children horizontally"]',
      },
    ],
    coverage: ["sections"],
    fixtureId: "playground-document",
    id: "group-orientation-vertical-light",
    requiredSelectors: [
      '[data-id="root-group"] button[aria-label="Stack children vertically"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-saved-views-pane",
        selector: '[data-workspace-shell-tab="leading:saved-views"]',
      },
    ],
    coverage: ["panes", "saved-views"],
    fixtureId: "playground-document",
    id: "saved-views-pane-light",
    requiredSelectors: [
      '[data-pane="leading"][data-visible="true"]',
      ".setta-workspace-saved-views-heading",
      '[data-workspace-saved-view-id="overview"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-saved-views-pane",
        selector: '[data-workspace-shell-tab="leading:saved-views"]',
      },
      {
        id: "edit-saved-views",
        selector: '[aria-label="Edit saved view"]',
      },
    ],
    coverage: ["panes", "saved-views"],
    fixtureId: "playground-document",
    id: "saved-views-edit-light",
    requiredSelectors: [
      '[aria-label="Finish editing saved view"][aria-pressed="true"]',
      '[data-testid="workspace-saved-view-drag-handle"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-saved-views-pane",
        selector: '[data-workspace-shell-tab="leading:saved-views"]',
      },
      {
        id: "activate-content-saved-view",
        selector:
          '[data-workspace-saved-view-id="content"] button[aria-pressed="false"]',
      },
    ],
    coverage: ["saved-views", "viewport"],
    fixtureId: "playground-document",
    id: "saved-view-content-active-light",
    requiredSelectors: [
      '[data-workspace-saved-view-id="content"] button[aria-pressed="true"]',
      '[data-testid="workspace-saved-view-tabs"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "disable-snap-to-grid",
        selector: '[aria-label="toggle snap to grid"]',
      },
    ],
    coverage: ["controls", "selection"],
    fixtureId: "playground-document",
    id: "controls-snap-toggle-focus-light",
    requiredSelectors: [
      '[aria-label="toggle snap to grid"][aria-pressed="false"]:focus',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "hide-minimap",
        selector: '[aria-label="toggle minimap"]',
      },
    ],
    absentSelectors: ['[data-testid="rf__minimap"]'],
    coverage: ["controls", "minimap"],
    fixtureId: "playground-document",
    id: "controls-minimap-hidden-light",
    requiredSelectors: ['[aria-label="toggle minimap"][aria-pressed="false"]'],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "move-minimap-to-right",
        selector: '[data-testid="rf__toggle-minimap-side"]',
      },
    ],
    coverage: ["controls", "minimap"],
    fixtureId: "playground-document",
    id: "minimap-right-light",
    requiredSelectors: [
      '[aria-label="move minimap to left"]',
      '[data-testid="rf__minimap"]',
    ],
    visibleSelectors: ['[data-testid="rf__minimap"]'],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-pane-creation-menu",
        kind: "context-menu",
        relativePoint: { x: 0.56, y: 0.56 },
        selector: ".react-flow__pane",
      },
    ],
    coverage: ["menus", "panes"],
    fixtureId: "playground-document",
    id: "pane-creation-menu-light",
    requiredSelectors: ['[role="menu"]', '[role="menuitem"]'],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "focus-item-panel",
        kind: "section-click",
        sectionId: "item-panel",
      },
      {
        id: "select-alpha-item",
        modifiers: ["meta", "shift"],
        relativePoint: { x: 0.08, y: 0.5 },
        selector:
          '[data-section-id="item-panel"] [data-workspace-item-id="item-alpha"]',
      },
    ],
    coverage: ["selection"],
    fixtureId: "playground-document",
    id: "item-selection-light",
    requiredSelectors: [
      '[data-workspace-item-id="item-alpha"][class*="!bg-blue-700"]',
    ],
    theme: "light",
    viewport: TALL_WIDE_VIEWPORT,
    viewportId: "tall-wide",
  },
  {
    actions: [
      {
        delta: { x: 86, y: 0 },
        id: "resize-alpha-item-columns",
        kind: "drag",
        selector:
          '[data-section-id="item-panel"] [data-workspace-item-id="item-alpha"] [data-item-column-resize-handle="true"]',
      },
    ],
    coverage: ["sizing"],
    fixtureId: "playground-document",
    id: "item-columns-resized-light",
    requiredSelectors: [
      '[data-section-id="item-panel"] [data-item-column-resize-handle="true"]',
    ],
    theme: "light",
    viewport: TALL_WIDE_VIEWPORT,
    viewportId: "tall-wide",
  },
  {
    actions: [
      {
        deltaY: 500,
        id: "scroll-item-panel-to-choice",
        kind: "wheel",
        selector:
          '[data-section-id="item-panel"] .section-args-nested.setta-native-wheel-y',
      },
      {
        id: "open-item-dropdown",
        selector:
          '[data-section-id="item-panel"] [aria-label="Open choice value choices"]',
      },
    ],
    coverage: ["control-popovers", "overlay"],
    fixtureId: "playground-document",
    id: "item-dropdown-popover-light",
    requiredSelectors: ['[role="listbox"][aria-label="choice value choices"]'],
    visibleSelectors: ['[role="listbox"][aria-label="choice value choices"]'],
    theme: "light",
    viewport: TALL_WIDE_VIEWPORT,
    viewportId: "tall-wide",
  },
  {
    actions: [
      {
        deltaY: 500,
        id: "scroll-item-panel-to-color",
        kind: "wheel",
        selector:
          '[data-section-id="item-panel"] .section-args-nested.setta-native-wheel-y',
      },
      {
        id: "open-item-color-popover",
        selector:
          '[data-section-id="item-panel"] [aria-label="accent value: Green"]',
      },
    ],
    coverage: ["control-popovers", "overlay"],
    fixtureId: "playground-document",
    id: "item-color-popover-light",
    requiredSelectors: [
      '[role="dialog"][aria-label="accent value choices"]',
      '[role="listbox"][aria-label="accent value choices"]',
    ],
    visibleSelectors: ['[role="dialog"][aria-label="accent value choices"]'],
    theme: "light",
    viewport: TALL_WIDE_VIEWPORT,
    viewportId: "tall-wide",
  },
  {
    actions: [
      {
        id: "focus-meta-dropdown",
        selector: '[data-section-id="meta-dropdown"] input[role="combobox"]',
      },
      {
        code: "ArrowDown",
        id: "open-meta-dropdown",
        kind: "key",
        key: "ArrowDown",
        windowsVirtualKeyCode: 40,
      },
    ],
    coverage: ["control-popovers", "overlay"],
    fixtureId: "playground-document",
    id: "meta-dropdown-popover-light",
    requiredSelectors: [
      '[role="listbox"][aria-label="Dropdown value choices"]',
    ],
    visibleSelectors: ['[role="listbox"][aria-label="Dropdown value choices"]'],
    theme: "light",
    viewport: TALL_WIDE_VIEWPORT,
    viewportId: "tall-wide",
  },
  {
    actions: [],
    coverage: ["control-popovers", "controls"],
    fixtureId: "playground-document",
    id: "meta-date-calendar-light",
    requiredSelectors: [
      '[data-section-id="meta-date"] [role="grid"][aria-label*="Date value"]',
    ],
    visibleSelectors: [
      '[data-section-id="meta-date"] [role="grid"][aria-label*="Date value"]',
    ],
    theme: "light",
    viewport: TALL_WIDE_VIEWPORT,
    viewportId: "tall-wide",
  },
]);
