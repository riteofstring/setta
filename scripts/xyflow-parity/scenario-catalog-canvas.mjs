import {
  COMPACT_VIEWPORT,
  DESKTOP_VIEWPORT,
  sectionSelector,
} from "./scenario-catalog-values.mjs";

export const PLAYGROUND_CANVAS_PARITY_SCENARIOS = Object.freeze([
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
]);
