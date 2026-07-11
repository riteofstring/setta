import { waitForState } from "./electron-cdp-harness.mjs";
import { easyButtonStateExpression, workflowTimeoutMs } from "./easy-button-pane-actions.mjs";

export function assertAcceptedSteeringFocusEvents(events, requestText, revisedText) {
  const runUpdates = events
    .filter((event) => event.type === "easyrun.run.updated")
    .map((event) => event.runUpdated?.run)
    .filter((run) => run?.requestText === requestText);
  const updatingIndex = runUpdates.findIndex(
    (run) =>
      run.currentFocus.status === "updating" &&
      run.currentFocus.revision === 0 &&
      run.currentFocus.text === requestText,
  );
  const revisedIndex = runUpdates.findIndex(
    (run, index) =>
      index > updatingIndex &&
      run.currentFocus.status === "current" &&
      run.currentFocus.revision === 1 &&
      run.currentFocus.text === revisedText,
  );
  const highlightEvents = events.filter((event) => event.type === "easyrun.highlight.created");
  if (updatingIndex < 0 || revisedIndex < 0 || highlightEvents.length !== 0) {
    throw new Error(
      `easy-button accepted steering focus events were wrong: ${JSON.stringify(events)}`,
    );
  }
}

export function assertRevisedCurrentFocus(state, text) {
  const focus = state.currentFocus;
  if (
    state.currentFocusText !== text ||
    state.focusLabelText !== "Current focus" ||
    state.focusStatus !== "current" ||
    focus?.revision !== 1 ||
    focus.status !== "current" ||
    focus.text !== text ||
    focus.updatedAt === ""
  ) {
    throw new Error(
      `easy-button snapshot did not carry revised current focus: ${JSON.stringify(state)}`,
    );
  }
}

export function assertRevisionZeroCurrentFocus(state, requestText) {
  const focus = state.currentFocus;
  if (
    focus?.revision !== 0 ||
    focus.status !== "current" ||
    focus.text !== requestText ||
    focus.updatedAt === ""
  ) {
    throw new Error(
      `easy-button snapshot did not carry revision-zero current focus: ${JSON.stringify(state)}`,
    );
  }
}

export function assertUpdatingCurrentFocus(state, requestText, steeringText) {
  assertStateFields(
    state,
    {
      currentFocusText: requestText,
      easyState: "working",
      focusLabelText: "Updating focus…",
      focusStatus: "updating",
      inputValue: "",
    },
    "easy-button updating focus presentation was wrong",
  );
  const focus = state.currentFocus;
  if (
    focus?.revision !== 0 ||
    focus.status !== "updating" ||
    focus.text !== requestText ||
    state.railText.includes(steeringText)
  ) {
    throw new Error(
      `easy-button updating focus did not preserve the last projection and narrator-only NOW: ${JSON.stringify(state)}`,
    );
  }
}

export function assertStaleCurrentFocus(state, requestText) {
  assertStateFields(
    state,
    {
      currentFocusText: requestText,
      focusLabelText: "Current focus",
      focusStatus: "stale",
      narratorStatusText: "Narration degraded — current focus may be outdated.",
    },
    "easy-button stale focus presentation was wrong",
  );
  const focus = state.currentFocus;
  if (
    focus?.revision !== 0 ||
    focus.status !== "stale" ||
    focus.text !== requestText ||
    state.railText.includes("Narrator failure evidence")
  ) {
    throw new Error(
      `easy-button stale focus did not preserve the last projection and narrator-only NOW: ${JSON.stringify(state)}`,
    );
  }
}

export function assertCurrentFocusConstrained(state, label, expectClamped) {
  const metrics = state.currentFocusMetrics;
  if (!metrics.exists || metrics.webkitLineClamp !== "4" || metrics.overflowWrap !== "anywhere") {
    throw new Error(
      `easy-button ${label} current focus was not constrained: ${JSON.stringify(state)}`,
    );
  }
  const maxClampedHeight = metrics.lineHeightPx * 4 + 4;
  if (
    metrics.clientHeight > maxClampedHeight ||
    (expectClamped && metrics.scrollHeight <= metrics.clientHeight)
  ) {
    throw new Error(`easy-button ${label} current focus did not clamp: ${JSON.stringify(state)}`);
  }
}

export function assertNarratorHealth(state, expectedNarration) {
  if (state.narratorStatusText !== "") {
    throw new Error(`easy-button narrator unexpectedly degraded: ${JSON.stringify(state)}`);
  }
  if (expectedNarration && !state.summaryText.includes(expectedNarration)) {
    throw new Error(`easy-button narrator summary was missing: ${JSON.stringify(state)}`);
  }
}

export function assertWorkingNarratorTerminalVisual(state) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      currentFocusText: "Finish the working narrator cadence.",
      easyState: "complete",
      focusLabelText: "Current focus",
      focusStatus: "current",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
      stopButtonVisible: false,
    },
    "easy-button working narrator terminal visual did not match Phase 4",
  );
  assertNarratorHealth(state, "The Easy Button run finished.");
  assertWorkingNarratorHighlights(state);
  if (!state.summaryText.includes("Done in") || !state.summaryText.includes("no artifacts")) {
    throw new Error(
      `easy-button working narrator terminal summary was wrong: ${JSON.stringify(state)}`,
    );
  }
}

export function assertWorkingNarratorHighlights(state) {
  const highlightTexts = state.highlights.map((highlight) => highlight.text);
  if (
    state.highlights.length !== 2 ||
    highlightTexts[0] !== "Working through the request shape" ||
    highlightTexts[1] !== "Preparing a visible result"
  ) {
    throw new Error(`easy-button working narrator highlights were wrong: ${JSON.stringify(state)}`);
  }
  if (state.railText.includes("Working narrator phase evidence")) {
    throw new Error(
      `easy-button working narrator leaked digest evidence: ${JSON.stringify(state)}`,
    );
  }
}

export async function waitForEasyButtonFocusStatus(client, requestText, focusStatus) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.runRequestText === requestText &&
      state.focusStatus === focusStatus &&
      state.currentFocus?.status === focusStatus &&
      state.currentFocusText !== "",
    workflowTimeoutMs,
  );
}

function assertStateFields(state, expected, message) {
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) {
      throw new Error(`${message}: ${JSON.stringify(state)}`);
    }
  }
}
