import {
  DESKTOP_VIEWPORT,
  WIDE_VIEWPORT,
  sectionSelector,
} from "./scenario-catalog-values.mjs";

export const PLAYGROUND_WINDOW_PARITY_SCENARIOS = Object.freeze([
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
