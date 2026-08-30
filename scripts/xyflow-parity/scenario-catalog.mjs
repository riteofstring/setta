const DESKTOP_VIEWPORT = Object.freeze({ height: 696, width: 1_492 });
const COMPACT_VIEWPORT = Object.freeze({ height: 364, width: 630 });
const WIDE_VIEWPORT = Object.freeze({ height: 720, width: 3_440 });
const TALL_WIDE_VIEWPORT = Object.freeze({ height: 1_200, width: 3_440 });

const sectionSelector = (sectionId) => `[data-section-id="${sectionId}"]`;
const ACTION_KINDS = new Set([
  "click",
  "context-menu",
  "drag",
  "hover",
  "key",
  "section-click",
  "section-drag",
  "type",
  "wheel",
]);
const MODIFIERS = new Set(["alt", "control", "meta", "shift"]);

export const SCENARIO_CATALOG_VERSION = "3";

export const REQUIRED_SCENARIO_COVERAGE = Object.freeze([
  "docking",
  "controls",
  "control-popovers",
  "locks",
  "marquee",
  "menus",
  "minimap",
  "minimize",
  "overlay",
  "panes",
  "saved-views",
  "sections",
  "selection",
  "sizing",
  "themes",
  "viewport",
  "window-spaces",
  "windows",
]);

export const PLAYGROUND_PARITY_UNSUPPORTED_STATES = Object.freeze([
  {
    id: "browser-native-picker-surfaces",
    reason:
      "Chrome-owned native color and file picker surfaces are outside Page.captureScreenshot.",
  },
  {
    id: "workspace-tooltip-surface",
    reason:
      "The mounted Playground fixture does not render WorkspaceTooltip, so control tooltip handlers have no document surface to capture.",
  },
  {
    id: "generic-window-title-drag",
    reason:
      "The mounted generic Playground windows reject layout movement, so no visible committed state is available.",
  },
  {
    id: "snap-preview-overlay",
    reason:
      "The mounted renderer exposes committed snap state but no stable preview overlay selector during a held drag.",
  },
]);

export const PLAYGROUND_PARITY_COVERAGE_LEDGER = Object.freeze([
  {
    state: "pane-leading-trailing-and-none",
    scenarios: [
      "pane-leading-only-light",
      "pane-both-light",
      "pane-trailing-only-light",
      "pane-none-light",
    ],
  },
  {
    state: "pane-saved-views",
    scenarios: [
      "saved-views-pane-light",
      "saved-views-edit-light",
      "saved-view-content-active-light",
    ],
  },
  {
    state: "pane-window-spaces",
    scenarios: [
      "window-spaces-pane-light",
      "window-space-saved-light",
      "window-space-restored-light",
    ],
  },
  {
    state: "pane-creation-menu",
    scenarios: ["pane-creation-menu-light"],
  },
  {
    state: "minimap-focus-drag-and-theme",
    scenarios: [
      "minimap-focused-light",
      "minimap-dragged-light",
      "minimap-focused-dark-compact",
    ],
  },
  {
    state: "minimap-side-and-hidden",
    scenarios: ["minimap-right-light", "controls-minimap-hidden-light"],
  },
  {
    state: "section-family-leaf-group-item-meta-code-text",
    scenarios: ["registered-section-families-wide-light"],
  },
  {
    state: "section-orientation-and-drag",
    scenarios: ["group-orientation-vertical-light", "section-dragged-light"],
  },
  {
    state: "section-resize-lock-minimize-restore",
    scenarios: [
      "section-resized-light",
      "section-locked-light",
      "section-minimized-light",
      "section-restored-light",
    ],
  },
  {
    state: "section-selection-and-marquee",
    scenarios: [
      "section-multiselection-light",
      "marquee-in-progress-light",
      "marquee-completed-light",
    ],
  },
  {
    state: "item-selection-and-column-resize",
    scenarios: ["item-selection-light", "item-columns-resized-light"],
  },
  {
    state: "item-dropdown-color-and-date-surfaces",
    scenarios: [
      "item-dropdown-popover-light",
      "item-color-popover-light",
      "meta-dropdown-popover-light",
      "meta-date-calendar-light",
    ],
  },
  {
    state: "native-picker-surfaces",
    unsupportedState: "browser-native-picker-surfaces",
  },
  {
    state: "workspace-controls-focus-toggle-and-snap",
    scenarios: [
      "controls-snap-toggle-focus-light",
      "snap-committed-section-drag-light",
    ],
  },
  {
    state: "workspace-control-tooltip",
    unsupportedState: "workspace-tooltip-surface",
  },
  {
    state: "snap-preview",
    unsupportedState: "snap-preview-overlay",
  },
  {
    state: "canvas-pan-zoom-and-light-dark",
    scenarios: ["viewport-zoom-pan-light", "canvas-wide-dark"],
  },
  {
    state: "section-context-menu-find-and-action-popover",
    scenarios: [
      "section-context-menu-light",
      "workspace-find-light",
      "section-actions-popover-light",
    ],
  },
  {
    state: "section-and-window-overlay-wheel",
    scenarios: ["section-overlay-wheel-light", "window-overlay-wheel-light"],
  },
  {
    state: "floating-window-focus-move-and-resize",
    scenarios: [
      "floating-focused-light",
      "floating-unfocused-light",
      "floating-moved-light",
      "floating-resized-light",
    ],
  },
  {
    state: "floating-window-maximize",
    scenarios: ["floating-maximized-light"],
  },
  {
    state: "generic-window-move",
    unsupportedState: "generic-window-title-drag",
  },
  {
    state: "generic-window-minimize-and-reopen",
    scenarios: [
      "generic-window-minimized-light",
      "generic-window-reopened-light",
    ],
  },
  {
    state: "section-window-handoff",
    scenarios: ["section-window-handoff-light"],
  },
  {
    state: "dock-place-minimize-recovery-and-resize",
    scenarios: [
      "floating-docked-light",
      "section-window-docked-light",
      "section-window-dock-minimized-light",
      "section-window-dock-restored-light",
      "dock-resized-light",
    ],
  },
]);

export const PLAYGROUND_PARITY_SETUP_ACTIONS = Object.freeze([
  {
    id: "close-reference-note-window",
    selector:
      '[data-workspace-window-id="playground-reference-note-window"] [data-testid="workspace-window-close"]',
  },
  {
    id: "close-checklist-window",
    selector:
      '[data-workspace-window-id="playground-checklist-window"] [data-testid="workspace-window-close"]',
  },
]);

export const PLAYGROUND_PARITY_SCENARIOS = Object.freeze([
  {
    actions: [],
    coverage: ["panes", "minimap", "sections"],
    fixtureId: "playground-document",
    id: "overview-light",
    requiredSelectors: [
      '[data-workspace-shell="true"]',
      ".react-flow",
      '[data-testid="rf__minimap"]',
      sectionSelector("idle-leaf"),
      sectionSelector("locked-leaf"),
      '[data-id="root-group"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [],
    coverage: ["panes"],
    fixtureId: "playground-document",
    id: "pane-leading-only-light",
    requiredSelectors: ['[data-pane="leading"][data-visible="true"]'],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-trailing-inspector",
        selector: '[data-workspace-shell-tab="trailing:inspector"]',
      },
    ],
    coverage: ["panes"],
    fixtureId: "playground-document",
    id: "pane-both-light",
    requiredSelectors: [
      '[data-pane="leading"][data-visible="true"]',
      '[data-pane="trailing"][data-visible="true"]',
      '[aria-label="Workspace Inspector selection"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "close-leading-outline",
        selector: '[data-workspace-shell-tab="leading:outline"]',
      },
      {
        id: "open-trailing-inspector",
        selector: '[data-workspace-shell-tab="trailing:inspector"]',
      },
    ],
    coverage: ["panes"],
    fixtureId: "playground-document",
    id: "pane-trailing-only-light",
    requiredSelectors: [
      '[data-pane="leading"][data-visible="false"]',
      '[data-pane="trailing"][data-visible="true"]',
      '[aria-label="Workspace Inspector selection"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "close-leading-outline",
        selector: '[data-workspace-shell-tab="leading:outline"]',
      },
    ],
    coverage: ["panes"],
    fixtureId: "playground-document",
    id: "pane-none-light",
    requiredSelectors: [
      '[data-pane="leading"][data-visible="false"]',
      '[data-pane="trailing"][data-visible="false"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "focus-minimap",
        relativePoint: { x: 0.5, y: 0.5 },
        selector: '[data-testid="rf__minimap"] svg',
      },
    ],
    coverage: ["minimap"],
    fixtureId: "playground-document",
    id: "minimap-focused-light",
    requiredSelectors: ['[data-testid="rf__minimap"] svg:focus'],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        endRelativePoint: { x: 0.78, y: 0.6 },
        id: "drag-minimap",
        kind: "drag",
        selector: '[data-testid="rf__minimap"] svg',
        startRelativePoint: { x: 0.25, y: 0.6 },
      },
    ],
    coverage: ["minimap", "viewport"],
    fixtureId: "playground-document",
    id: "minimap-dragged-light",
    requiredSelectors: [
      '[data-testid="rf__minimap"] svg[aria-label*="Workspace minimap"]',
      ".react-flow__viewport",
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "focus-dark-minimap",
        relativePoint: { x: 0.5, y: 0.5 },
        selector: '[data-testid="rf__minimap"] svg',
      },
    ],
    coverage: ["minimap"],
    fixtureId: "playground-document",
    id: "minimap-focused-dark-compact",
    requiredSelectors: ["html.dark", '[data-testid="rf__minimap"] svg:focus'],
    theme: "dark",
    viewport: COMPACT_VIEWPORT,
    viewportId: "compact",
  },
  {
    actions: [
      {
        deltaY: -280,
        id: "zoom-canvas",
        kind: "wheel",
        selector: ".react-flow__pane",
      },
      {
        delta: { x: 110, y: 52 },
        id: "pan-canvas",
        kind: "drag",
        selector: ".react-flow__pane",
        startRelativePoint: { x: 0.88, y: 0.84 },
      },
    ],
    coverage: ["viewport"],
    fixtureId: "playground-document",
    id: "viewport-zoom-pan-light",
    requiredSelectors: [".react-flow__viewport"],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "focus-styled-leaf",
        kind: "section-click",
        sectionId: "styled-leaf",
      },
      {
        endRelativePoint: { x: 0.76, y: 0.98 },
        hold: true,
        id: "start-marquee",
        kind: "drag",
        modifiers: ["shift"],
        selector: ".react-flow__pane",
        startRelativePoint: { x: 0.335, y: 0.278 },
      },
    ],
    coverage: ["marquee", "selection"],
    fixtureId: "playground-document",
    id: "marquee-in-progress-light",
    requiredSelectors: [".react-flow__selection"],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "focus-styled-leaf",
        kind: "section-click",
        sectionId: "styled-leaf",
      },
      {
        endRelativePoint: { x: 0.76, y: 0.98 },
        id: "complete-marquee",
        kind: "drag",
        modifiers: ["shift"],
        selector: ".react-flow__pane",
        startRelativePoint: { x: 0.335, y: 0.278 },
      },
    ],
    coverage: ["marquee", "selection"],
    fixtureId: "playground-document",
    id: "marquee-completed-light",
    requiredSelectors: [".react-flow__nodesselection-rect"],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "select-styled-leaf",
        kind: "section-click",
        sectionId: "styled-leaf",
      },
      {
        id: "add-locked-leaf-to-selection",
        kind: "section-click",
        modifiers: ["meta"],
        sectionId: "locked-leaf",
      },
    ],
    coverage: ["selection"],
    fixtureId: "playground-document",
    id: "section-multiselection-light",
    requiredSelectors: [
      `${sectionSelector("styled-leaf")}[data-section-active="true"]`,
      `${sectionSelector("locked-leaf")}[data-section-active="true"]`,
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    coverage: ["sections"],
    fixtureId: "playground-document",
    id: "section-dragged-light",
    actions: [
      {
        delta: { x: 94, y: 48 },
        id: "drag-styled-leaf",
        kind: "section-drag",
        sectionId: "styled-leaf",
      },
    ],
    requiredSelectors: [sectionSelector("styled-leaf")],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "lock-styled-leaf",
        selector:
          '[data-section-id="styled-leaf"] button[aria-label="Lock position and size"]',
      },
    ],
    coverage: ["locks", "sections"],
    fixtureId: "playground-document",
    id: "section-locked-light",
    requiredSelectors: [
      '[data-section-id="styled-leaf"] button[aria-label="Unlock position and size"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "minimize-styled-leaf",
        selector:
          '[data-section-id="styled-leaf"] button[aria-label="Minimize section"]',
      },
    ],
    coverage: ["minimize", "sections"],
    fixtureId: "playground-document",
    id: "section-minimized-light",
    requiredSelectors: [
      '[data-section-id="styled-leaf"] button[aria-label="Expand section"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "minimize-styled-leaf",
        selector:
          '[data-section-id="styled-leaf"] button[aria-label="Minimize section"]',
      },
      {
        id: "restore-styled-leaf",
        selector:
          '[data-section-id="styled-leaf"] button[aria-label="Expand section"]',
      },
    ],
    coverage: ["minimize", "sections"],
    fixtureId: "playground-document",
    id: "section-restored-light",
    requiredSelectors: [
      '[data-section-id="styled-leaf"] button[aria-label="Minimize section"]',
      '[data-section-id="styled-leaf"] [data-setta-workspace-section-title-display="true"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-focused-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
    ],
    coverage: ["windows"],
    fixtureId: "playground-document",
    id: "floating-focused-light",
    requiredSelectors: [
      '[data-workspace-window-id="workspace-section-window:styled-leaf"][data-focused="true"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [],
    coverage: ["windows"],
    fixtureId: "playground-document",
    fixtureSetup: false,
    id: "floating-unfocused-light",
    requiredSelectors: [
      '[data-workspace-window-id="playground-reference-note-window"][data-focused="false"]',
      '[data-workspace-window-id="playground-checklist-window"][data-focused="true"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
      {
        delta: { x: 112, y: 58 },
        id: "move-styled-leaf-window",
        kind: "drag",
        selector:
          '[data-workspace-window-id="workspace-section-window:styled-leaf"] [data-testid="workspace-window-title-drag-handle"]',
      },
    ],
    coverage: ["windows"],
    fixtureId: "playground-document",
    id: "floating-moved-light",
    requiredSelectors: [
      '[data-workspace-window-id="workspace-section-window:styled-leaf"][data-focused="true"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
      {
        delta: { x: 96, y: 54 },
        id: "resize-styled-leaf-window",
        kind: "drag",
        selector:
          '[data-workspace-window-id="workspace-section-window:styled-leaf"] [data-testid="workspace-window-free-resize-handle"][data-direction="bottom_right"]',
      },
    ],
    coverage: ["windows"],
    fixtureId: "playground-document",
    id: "floating-resized-light",
    requiredSelectors: [
      '[data-workspace-window-id="workspace-section-window:styled-leaf"][data-focused="true"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
      {
        id: "dock-styled-leaf-window",
        selector:
          '[data-workspace-window-id="workspace-section-window:styled-leaf"] [data-testid="workspace-window-dock"]',
      },
    ],
    coverage: ["docking", "windows"],
    fixtureId: "playground-document",
    id: "floating-docked-light",
    requiredSelectors: [
      '[data-testid="workspace-bottom-dock-window-panel"]',
      '[data-testid="workspace-bottom-dock"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
    ],
    coverage: ["windows"],
    fixtureId: "playground-document",
    id: "section-window-floating-light",
    requiredSelectors: [
      '[data-testid="section-canvas-window-placeholder"][data-workspace-section-id="styled-leaf"]',
      '[data-testid="workspace-window-manager-window"] [data-testid="section-window-surface"][data-section-id="styled-leaf"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
      {
        id: "dock-styled-leaf-window",
        selector:
          '[data-testid="section-window-surface"][data-section-id="styled-leaf"] [data-testid="workspace-window-dock"]',
      },
    ],
    coverage: ["docking", "windows"],
    fixtureId: "playground-document",
    id: "section-window-docked-light",
    requiredSelectors: [
      '[data-testid="workspace-bottom-dock-window-panel"] [data-testid="section-window-surface"][data-section-id="styled-leaf"]',
      '[data-testid="workspace-bottom-dock"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
      {
        id: "dock-styled-leaf-window",
        selector:
          '[data-testid="section-window-surface"][data-section-id="styled-leaf"] [data-testid="workspace-window-dock"]',
      },
      {
        id: "minimize-docked-styled-leaf-window",
        selector:
          '[data-testid="section-window-surface"][data-section-id="styled-leaf"] [data-testid="workspace-bottom-dock-window-minimize"]',
      },
    ],
    coverage: ["docking", "minimize", "windows"],
    fixtureId: "playground-document",
    id: "section-window-dock-minimized-light",
    requiredSelectors: [
      '[aria-label="Restore Style-colored leaf"]',
      '[data-testid="workspace-bottom-dock-strip"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
      {
        id: "dock-styled-leaf-window",
        selector:
          '[data-testid="section-window-surface"][data-section-id="styled-leaf"] [data-testid="workspace-window-dock"]',
      },
      {
        id: "minimize-docked-styled-leaf-window",
        selector:
          '[data-testid="section-window-surface"][data-section-id="styled-leaf"] [data-testid="workspace-bottom-dock-window-minimize"]',
      },
      {
        id: "restore-docked-styled-leaf-window",
        selector: '[aria-label="Restore Style-colored leaf"]',
      },
    ],
    coverage: ["docking", "minimize", "windows"],
    fixtureId: "playground-document",
    id: "section-window-dock-restored-light",
    requiredSelectors: [
      '[data-testid="workspace-bottom-dock-window-panel"] [data-testid="section-window-surface"][data-section-id="styled-leaf"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        deltaY: 236,
        id: "scroll-item-panel-overlay",
        kind: "wheel",
        selector:
          '[data-section-id="item-panel"] .section-args-nested.setta-native-wheel-y',
      },
    ],
    coverage: ["overlay", "sections"],
    fixtureId: "playground-document",
    id: "section-overlay-wheel-light",
    requiredSelectors: [
      '[data-section-id="item-panel"] .section-args-nested.setta-native-wheel-y',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-item-panel-window",
        selector:
          '[data-section-id="item-panel"] [data-testid="section-window-toggle"]',
      },
      {
        deltaY: 236,
        id: "scroll-item-panel-window-overlay",
        kind: "wheel",
        selector:
          '[data-testid="section-window-surface"][data-section-id="item-panel"] .section-args-nested.setta-native-wheel-y',
      },
    ],
    coverage: ["overlay", "windows"],
    fixtureId: "playground-document",
    id: "window-overlay-wheel-light",
    requiredSelectors: [
      '[data-testid="section-window-surface"][data-section-id="item-panel"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
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
  {
    actions: [],
    coverage: ["minimap", "sections", "themes"],
    fixtureId: "playground-document",
    id: "canvas-wide-dark",
    requiredSelectors: [
      "html.dark",
      '[data-testid="rf__minimap"]',
      sectionSelector("item-panel"),
      sectionSelector("meta-color"),
    ],
    theme: "dark",
    viewport: WIDE_VIEWPORT,
    viewportId: "wide",
  },
  {
    actions: [
      {
        delta: { x: 83, y: 43 },
        id: "move-section-with-snap-committed",
        kind: "section-drag",
        sectionId: "styled-leaf",
      },
    ],
    coverage: ["controls", "sections"],
    fixtureId: "playground-document",
    id: "snap-committed-section-drag-light",
    requiredSelectors: [
      '[aria-label="toggle snap to grid"][aria-pressed="true"]',
      sectionSelector("styled-leaf"),
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "maximize-reference-note",
        selector:
          '[data-workspace-window-id="playground-reference-note-window"] [data-testid="workspace-window-maximize"]',
      },
    ],
    coverage: ["windows"],
    fixtureId: "playground-document",
    fixtureSetup: false,
    id: "floating-maximized-light",
    requiredSelectors: [
      '[data-workspace-window-id="playground-reference-note-window"][data-workspace-window-maximized="true"]',
      '[data-testid="workspace-window-restore"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "minimize-reference-note",
        selector:
          '[data-workspace-window-id="playground-reference-note-window"] [data-testid="workspace-window-minimize"]',
      },
    ],
    absentSelectors: [
      '[data-workspace-window-id="playground-reference-note-window"][data-testid="workspace-window-manager-window"]',
    ],
    coverage: ["minimize", "windows"],
    fixtureId: "playground-document",
    fixtureSetup: false,
    id: "generic-window-minimized-light",
    requiredSelectors: ['[aria-label="Restore Reference note"]'],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "minimize-reference-note",
        selector:
          '[data-workspace-window-id="playground-reference-note-window"] [data-testid="workspace-window-minimize"]',
      },
      {
        id: "restore-reference-note",
        selector: '[aria-label="Restore Reference note"]',
      },
    ],
    absentSelectors: ['[aria-label="Restore Reference note"]'],
    coverage: ["minimize", "windows"],
    fixtureId: "playground-document",
    fixtureSetup: false,
    id: "generic-window-reopened-light",
    requiredSelectors: [
      '[data-workspace-window-id="playground-reference-note-window"][data-testid="workspace-window-manager-window"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
      {
        id: "show-styled-leaf-in-canvas",
        selector:
          '[data-workspace-window-id="workspace-section-window:styled-leaf"] [data-testid="workspace-window-show-in-canvas"]',
      },
    ],
    invisibleSelectors: [
      '[data-workspace-window-id="workspace-section-window:styled-leaf"][data-testid="workspace-window-manager-window"]',
    ],
    coverage: ["sections", "windows"],
    fixtureId: "playground-document",
    id: "section-window-handoff-light",
    requiredSelectors: [
      '[data-section-id="styled-leaf"][role="group"]',
      '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-styled-leaf-window",
        selector:
          '[data-section-id="styled-leaf"] [data-testid="section-window-toggle"]',
      },
      {
        id: "dock-styled-leaf-window",
        selector:
          '[data-workspace-window-id="workspace-section-window:styled-leaf"] [data-testid="workspace-window-dock"]',
      },
      {
        delta: { x: 0, y: -84 },
        id: "resize-bottom-dock",
        kind: "drag",
        selector:
          '[data-workspace-window-id="workspace-section-window:styled-leaf"] [data-testid="workspace-bottom-dock-resize-handle"][data-direction="top"]',
      },
    ],
    coverage: ["docking", "sizing", "windows"],
    fixtureId: "playground-document",
    id: "dock-resized-light",
    requiredSelectors: [
      '[data-workspace-window-id="workspace-section-window:styled-leaf"][data-testid="workspace-bottom-dock-window-panel"]',
      '[data-testid="workspace-bottom-dock-resize-handle"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-window-spaces-pane",
        selector: '[data-workspace-shell-tab="trailing:host-window-spaces"]',
      },
    ],
    coverage: ["panes", "window-spaces"],
    fixtureId: "playground-document",
    fixtureSetup: false,
    id: "window-spaces-pane-light",
    requiredSelectors: [
      '[data-pane="trailing"][data-visible="true"]',
      '[data-testid="workspace-window-space-save"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-window-spaces-pane",
        selector: '[data-workspace-shell-tab="trailing:host-window-spaces"]',
      },
      {
        id: "save-window-space",
        selector: '[data-testid="workspace-window-space-save"]',
      },
    ],
    coverage: ["window-spaces", "windows"],
    fixtureId: "playground-document",
    fixtureSetup: false,
    id: "window-space-saved-light",
    requiredSelectors: [
      '[data-workspace-window-space-id="playground-window-space-1"]',
      '[data-testid="workspace-window-space-restore"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
  {
    actions: [
      {
        id: "open-window-spaces-pane",
        selector: '[data-workspace-shell-tab="trailing:host-window-spaces"]',
      },
      {
        id: "save-window-space",
        selector: '[data-testid="workspace-window-space-save"]',
      },
      {
        id: "restore-window-space",
        selector:
          '[data-workspace-window-space-id="playground-window-space-1"] [data-testid="workspace-window-space-restore"]',
      },
    ],
    coverage: ["window-spaces", "windows"],
    fixtureId: "playground-document",
    fixtureSetup: false,
    id: "window-space-restored-light",
    requiredSelectors: [
      '[data-workspace-window-space-id="playground-window-space-1"]',
      '[data-testid="workspace-window-manager-window"]',
    ],
    theme: "light",
    viewport: DESKTOP_VIEWPORT,
    viewportId: "desktop",
  },
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateRelativePoint(value, context) {
  assert(
    value !== null &&
      typeof value === "object" &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      value.x >= 0 &&
      value.x <= 1 &&
      value.y >= 0 &&
      value.y <= 1,
    `${context} has an invalid relative point.`,
  );
}

function validateDelta(value, context) {
  assert(
    value !== null &&
      typeof value === "object" &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y),
    `${context} has an invalid drag delta.`,
  );
}

function validateActions(actions, context) {
  assert(Array.isArray(actions), `${context} has invalid actions.`);
  for (const action of actions) {
    assert(
      typeof action.id === "string" && action.id.length > 0,
      `${context} has an action without an id.`,
    );
    const kind = action.kind ?? "click";
    assert(
      ACTION_KINDS.has(kind),
      `${context} action ${action.id} has an unsupported kind.`,
    );
    if (
      ["click", "context-menu", "drag", "hover", "type", "wheel"].includes(
        kind,
      ) &&
      action.sectionId === undefined
    ) {
      assert(
        typeof action.selector === "string" && action.selector.length > 0,
        `${context} action ${action.id} has no selector.`,
      );
    }
    if (["section-click", "section-drag"].includes(kind)) {
      assert(
        typeof action.sectionId === "string" && action.sectionId.length > 0,
        `${context} action ${action.id} has no section id.`,
      );
    }
    if (action.modifiers !== undefined) {
      assert(
        Array.isArray(action.modifiers) &&
          action.modifiers.every((modifier) => MODIFIERS.has(modifier)),
        `${context} action ${action.id} has unsupported modifiers.`,
      );
    }
    if (action.relativePoint !== undefined) {
      validateRelativePoint(
        action.relativePoint,
        `${context} action ${action.id}`,
      );
    }
    if (action.startRelativePoint !== undefined) {
      validateRelativePoint(
        action.startRelativePoint,
        `${context} action ${action.id}`,
      );
    }
    if (action.endRelativePoint !== undefined) {
      validateRelativePoint(
        action.endRelativePoint,
        `${context} action ${action.id}`,
      );
    }
    if (action.delta !== undefined) {
      validateDelta(action.delta, `${context} action ${action.id}`);
    }
    if (kind === "drag" || kind === "section-drag") {
      assert(
        action.endSelector !== undefined ||
          action.endRelativePoint !== undefined ||
          action.delta !== undefined,
        `${context} action ${action.id} needs a drag end point.`,
      );
      if (action.steps !== undefined) {
        assert(
          isPositiveInteger(action.steps),
          `${context} action ${action.id} has invalid drag steps.`,
        );
      }
      if (action.hold !== undefined) {
        assert(
          typeof action.hold === "boolean",
          `${context} action ${action.id} has invalid hold state.`,
        );
      }
    }
    if (kind === "wheel") {
      assert(
        Number.isFinite(action.deltaY),
        `${context} action ${action.id} needs a wheel delta.`,
      );
    }
    if (kind === "type") {
      assert(
        typeof action.text === "string",
        `${context} action ${action.id} needs text.`,
      );
    }
    if (kind === "key") {
      assert(
        typeof action.code === "string" &&
          typeof action.key === "string" &&
          isPositiveInteger(action.windowsVirtualKeyCode),
        `${context} action ${action.id} has an invalid key description.`,
      );
      if (action.hold !== undefined) {
        assert(
          typeof action.hold === "boolean",
          `${context} action ${action.id} has invalid hold state.`,
        );
      }
    }
  }
}

export function validateScenarioCatalog(
  scenarios = PLAYGROUND_PARITY_SCENARIOS,
) {
  const ids = new Set();
  const coverage = new Set();
  validateActions(PLAYGROUND_PARITY_SETUP_ACTIONS, "Parity fixture setup");
  for (const scenario of scenarios) {
    assert(
      typeof scenario.id === "string" && /^[a-z0-9-]+$/.test(scenario.id),
      "Every parity scenario needs a lowercase kebab-case id.",
    );
    assert(
      !ids.has(scenario.id),
      `Duplicate parity scenario id: ${scenario.id}.`,
    );
    ids.add(scenario.id);
    assert(
      scenario.theme === "light" || scenario.theme === "dark",
      `Parity scenario ${scenario.id} has an unsupported theme.`,
    );
    assert(
      scenario.fixtureSetup === undefined ||
        typeof scenario.fixtureSetup === "boolean",
      `Parity scenario ${scenario.id} has an invalid fixture setup state.`,
    );
    assert(
      isPositiveInteger(scenario.viewport.width) &&
        isPositiveInteger(scenario.viewport.height),
      `Parity scenario ${scenario.id} has an invalid viewport.`,
    );
    assert(
      Array.isArray(scenario.requiredSelectors) &&
        scenario.requiredSelectors.length > 0,
      `Parity scenario ${scenario.id} needs at least one required selector.`,
    );
    assert(
      scenario.absentSelectors === undefined ||
        (Array.isArray(scenario.absentSelectors) &&
          scenario.absentSelectors.every(
            (selector) => typeof selector === "string" && selector.length > 0,
          )),
      `Parity scenario ${scenario.id} has invalid absent selectors.`,
    );
    assert(
      scenario.visibleSelectors === undefined ||
        (Array.isArray(scenario.visibleSelectors) &&
          scenario.visibleSelectors.every(
            (selector) => typeof selector === "string" && selector.length > 0,
          )),
      `Parity scenario ${scenario.id} has invalid visible selectors.`,
    );
    assert(
      scenario.invisibleSelectors === undefined ||
        (Array.isArray(scenario.invisibleSelectors) &&
          scenario.invisibleSelectors.every(
            (selector) => typeof selector === "string" && selector.length > 0,
          )),
      `Parity scenario ${scenario.id} has invalid invisible selectors.`,
    );
    validateActions(scenario.actions, `Parity scenario ${scenario.id}`);
    assert(
      Array.isArray(scenario.coverage) && scenario.coverage.length > 0,
      `Parity scenario ${scenario.id} needs coverage labels.`,
    );
    for (const label of scenario.coverage) {
      coverage.add(label);
    }
  }
  for (const label of REQUIRED_SCENARIO_COVERAGE) {
    assert(
      coverage.has(label),
      `Parity scenario catalog is missing ${label} coverage.`,
    );
  }
  const unsupportedIds = new Set();
  for (const state of PLAYGROUND_PARITY_UNSUPPORTED_STATES) {
    assert(
      state !== null &&
        typeof state === "object" &&
        typeof state.id === "string" &&
        /^[a-z0-9-]+$/.test(state.id) &&
        typeof state.reason === "string" &&
        state.reason.length > 0,
      "Every unsupported parity state needs a kebab-case id and reason.",
    );
    assert(
      !unsupportedIds.has(state.id),
      `Duplicate unsupported parity state id: ${state.id}.`,
    );
    unsupportedIds.add(state.id);
  }
  const ledgerStates = new Set();
  for (const entry of PLAYGROUND_PARITY_COVERAGE_LEDGER) {
    assert(
      entry !== null &&
        typeof entry === "object" &&
        typeof entry.state === "string" &&
        /^[a-z0-9-]+$/.test(entry.state),
      "Every parity coverage ledger entry needs a kebab-case state.",
    );
    assert(
      !ledgerStates.has(entry.state),
      `Duplicate parity coverage ledger state: ${entry.state}.`,
    );
    ledgerStates.add(entry.state);
    const scenarioIds = entry.scenarios;
    const hasScenarios = Array.isArray(scenarioIds) && scenarioIds.length > 0;
    const hasUnsupportedState =
      typeof entry.unsupportedState === "string" &&
      entry.unsupportedState.length > 0;
    assert(
      hasScenarios !== hasUnsupportedState,
      `Parity coverage ledger entry ${entry.state} must map to scenarios or one unsupported state.`,
    );
    if (hasScenarios) {
      for (const scenarioId of scenarioIds) {
        assert(
          typeof scenarioId === "string" && ids.has(scenarioId),
          `Parity coverage ledger entry ${entry.state} has an unknown scenario.`,
        );
      }
    }
    if (hasUnsupportedState) {
      assert(
        unsupportedIds.has(entry.unsupportedState),
        `Parity coverage ledger entry ${entry.state} has an unknown unsupported state.`,
      );
    }
  }
  return {
    coverage: [...coverage].sort(),
    coverageLedger: PLAYGROUND_PARITY_COVERAGE_LEDGER,
    scenarioCount: scenarios.length,
    unsupportedStates: PLAYGROUND_PARITY_UNSUPPORTED_STATES,
  };
}

export function selectParityScenarios(selectedIds) {
  if (selectedIds.length === 0) {
    return PLAYGROUND_PARITY_SCENARIOS;
  }
  const byId = new Map(
    PLAYGROUND_PARITY_SCENARIOS.map((scenario) => [scenario.id, scenario]),
  );
  const scenarios = [];
  for (const id of selectedIds) {
    const scenario = byId.get(id);
    if (!scenario) {
      throw new Error(`Unknown parity scenario: ${id}.`);
    }
    if (!scenarios.includes(scenario)) {
      scenarios.push(scenario);
    }
  }
  return scenarios;
}
