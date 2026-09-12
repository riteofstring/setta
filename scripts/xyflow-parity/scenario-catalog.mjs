import { PLAYGROUND_CANVAS_PARITY_SCENARIOS } from "./scenario-catalog-canvas.mjs";
import { PLAYGROUND_INTERFACE_PARITY_SCENARIOS } from "./scenario-catalog-interface.mjs";
import { PLAYGROUND_WINDOW_PARITY_SCENARIOS } from "./scenario-catalog-windows.mjs";

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
const SELECTOR_ACTION_KINDS = new Set([
  "click",
  "context-menu",
  "drag",
  "hover",
  "type",
  "wheel",
]);
const SECTION_ACTION_KINDS = new Set(["section-click", "section-drag"]);
const DRAG_ACTION_KINDS = new Set(["drag", "section-drag"]);

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
  ...PLAYGROUND_CANVAS_PARITY_SCENARIOS,
  ...PLAYGROUND_INTERFACE_PARITY_SCENARIOS,
  ...PLAYGROUND_WINDOW_PARITY_SCENARIOS,
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isKebabCaseString(value) {
  return isNonEmptyString(value) && /^[a-z0-9-]+$/.test(value);
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

function validateOptionalBoolean(value, message) {
  assert(value === undefined || typeof value === "boolean", message);
}

function validateActionTarget(action, kind, context) {
  if (SELECTOR_ACTION_KINDS.has(kind) && action.sectionId === undefined) {
    assert(isNonEmptyString(action.selector), `${context} has no selector.`);
  }
  if (SECTION_ACTION_KINDS.has(kind)) {
    assert(isNonEmptyString(action.sectionId), `${context} has no section id.`);
  }
}

function validateActionModifiers(action, context) {
  if (action.modifiers === undefined) {
    return;
  }
  assert(
    Array.isArray(action.modifiers) &&
      action.modifiers.every((modifier) => MODIFIERS.has(modifier)),
    `${context} has unsupported modifiers.`,
  );
}

function validateOptionalActionValue(value, validator, context) {
  if (value !== undefined) {
    validator(value, context);
  }
}

function validateActionCoordinates(action, context) {
  for (const field of [
    "relativePoint",
    "startRelativePoint",
    "endRelativePoint",
  ]) {
    validateOptionalActionValue(action[field], validateRelativePoint, context);
  }
  validateOptionalActionValue(action.delta, validateDelta, context);
}

function validateDragAction(action, context) {
  assert(
    action.endSelector !== undefined ||
      action.endRelativePoint !== undefined ||
      action.delta !== undefined,
    `${context} needs a drag end point.`,
  );
  if (action.steps !== undefined) {
    assert(
      isPositiveInteger(action.steps),
      `${context} has invalid drag steps.`,
    );
  }
  validateOptionalBoolean(action.hold, `${context} has invalid hold state.`);
}

function validateWheelAction(action, context) {
  assert(Number.isFinite(action.deltaY), `${context} needs a wheel delta.`);
}

function validateTypeAction(action, context) {
  assert(typeof action.text === "string", `${context} needs text.`);
}

function validateKeyAction(action, context) {
  assert(
    typeof action.code === "string" &&
      typeof action.key === "string" &&
      isPositiveInteger(action.windowsVirtualKeyCode),
    `${context} has an invalid key description.`,
  );
  validateOptionalBoolean(action.hold, `${context} has invalid hold state.`);
}

const ACTION_VALIDATORS = new Map([
  ["key", validateKeyAction],
  ["type", validateTypeAction],
  ["wheel", validateWheelAction],
]);

function validateAction(action, context) {
  assert(
    isNonEmptyString(action.id),
    `${context} has an action without an id.`,
  );
  const actionContext = `${context} action ${action.id}`;
  const kind = action.kind ?? "click";
  assert(ACTION_KINDS.has(kind), `${actionContext} has an unsupported kind.`);
  validateActionTarget(action, kind, actionContext);
  validateActionModifiers(action, actionContext);
  validateActionCoordinates(action, actionContext);
  if (DRAG_ACTION_KINDS.has(kind)) {
    validateDragAction(action, actionContext);
  }
  const validator = ACTION_VALIDATORS.get(kind);
  if (validator !== undefined) {
    validator(action, actionContext);
  }
}

function validateActions(actions, context) {
  assert(Array.isArray(actions), `${context} has invalid actions.`);
  for (const action of actions) {
    validateAction(action, context);
  }
}

function validateOptionalStringArray(value, message) {
  assert(
    value === undefined ||
      (Array.isArray(value) && value.every(isNonEmptyString)),
    message,
  );
}

function validateScenarioIdentity(scenario, ids) {
  assert(
    isKebabCaseString(scenario.id),
    "Every parity scenario needs a lowercase kebab-case id.",
  );
  assert(
    !ids.has(scenario.id),
    `Duplicate parity scenario id: ${scenario.id}.`,
  );
  ids.add(scenario.id);
}

function validateScenarioConfiguration(scenario) {
  const context = `Parity scenario ${scenario.id}`;
  assert(
    scenario.theme === "light" || scenario.theme === "dark",
    `${context} has an unsupported theme.`,
  );
  validateOptionalBoolean(
    scenario.fixtureSetup,
    `${context} has an invalid fixture setup state.`,
  );
  assert(
    isPositiveInteger(scenario.viewport.width) &&
      isPositiveInteger(scenario.viewport.height),
    `${context} has an invalid viewport.`,
  );
  assert(
    Array.isArray(scenario.requiredSelectors) &&
      scenario.requiredSelectors.length > 0,
    `${context} needs at least one required selector.`,
  );
  validateOptionalStringArray(
    scenario.absentSelectors,
    `${context} has invalid absent selectors.`,
  );
  validateOptionalStringArray(
    scenario.visibleSelectors,
    `${context} has invalid visible selectors.`,
  );
  validateOptionalStringArray(
    scenario.invisibleSelectors,
    `${context} has invalid invisible selectors.`,
  );
}

function validateScenario(scenario, ids, coverage) {
  validateScenarioIdentity(scenario, ids);
  validateScenarioConfiguration(scenario);
  validateActions(scenario.actions, `Parity scenario ${scenario.id}`);
  assert(
    Array.isArray(scenario.coverage) && scenario.coverage.length > 0,
    `Parity scenario ${scenario.id} needs coverage labels.`,
  );
  for (const label of scenario.coverage) {
    coverage.add(label);
  }
}

function validateRequiredCoverage(coverage) {
  for (const label of REQUIRED_SCENARIO_COVERAGE) {
    assert(
      coverage.has(label),
      `Parity scenario catalog is missing ${label} coverage.`,
    );
  }
}

function collectUnsupportedIds() {
  const unsupportedIds = new Set();
  for (const state of PLAYGROUND_PARITY_UNSUPPORTED_STATES) {
    assert(
      state !== null &&
        typeof state === "object" &&
        isKebabCaseString(state.id) &&
        isNonEmptyString(state.reason),
      "Every unsupported parity state needs a kebab-case id and reason.",
    );
    assert(
      !unsupportedIds.has(state.id),
      `Duplicate unsupported parity state id: ${state.id}.`,
    );
    unsupportedIds.add(state.id);
  }
  return unsupportedIds;
}

function validateLedgerScenarioIds(entry, scenarioIds, ids) {
  for (const scenarioId of scenarioIds) {
    assert(
      typeof scenarioId === "string" && ids.has(scenarioId),
      `Parity coverage ledger entry ${entry.state} has an unknown scenario.`,
    );
  }
}

function validateLedgerMapping(entry, ids, unsupportedIds) {
  const scenarioIds = entry.scenarios;
  const hasScenarios = Array.isArray(scenarioIds) && scenarioIds.length > 0;
  const hasUnsupportedState = isNonEmptyString(entry.unsupportedState);
  assert(
    hasScenarios !== hasUnsupportedState,
    `Parity coverage ledger entry ${entry.state} must map to scenarios or one unsupported state.`,
  );
  if (hasScenarios) {
    validateLedgerScenarioIds(entry, scenarioIds, ids);
    return;
  }
  assert(
    unsupportedIds.has(entry.unsupportedState),
    `Parity coverage ledger entry ${entry.state} has an unknown unsupported state.`,
  );
}

function validateCoverageLedger(ids, unsupportedIds) {
  const ledgerStates = new Set();
  for (const entry of PLAYGROUND_PARITY_COVERAGE_LEDGER) {
    assert(
      entry !== null &&
        typeof entry === "object" &&
        isKebabCaseString(entry.state),
      "Every parity coverage ledger entry needs a kebab-case state.",
    );
    assert(
      !ledgerStates.has(entry.state),
      `Duplicate parity coverage ledger state: ${entry.state}.`,
    );
    ledgerStates.add(entry.state);
    validateLedgerMapping(entry, ids, unsupportedIds);
  }
}

export function validateScenarioCatalog(
  scenarios = PLAYGROUND_PARITY_SCENARIOS,
) {
  const ids = new Set();
  const coverage = new Set();
  validateActions(PLAYGROUND_PARITY_SETUP_ACTIONS, "Parity fixture setup");
  for (const scenario of scenarios) {
    validateScenario(scenario, ids, coverage);
  }
  validateRequiredCoverage(coverage);
  const unsupportedIds = collectUnsupportedIds();
  validateCoverageLedger(ids, unsupportedIds);
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
