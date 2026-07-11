/* global HTMLButtonElement, HTMLElement, HTMLInputElement, document, window */

// Drives docs/mockups/easy_button_pane_mockup.html so the pixel-match renderer
// can hold it still. The mockup is an interactive prototype, not a fixture: it
// stages its rails on timers and auto-advances `working` to `complete` about ten
// seconds in. Freezing its clock is what turns each state into a still.

(() => {
  const version = "setta-easy-button-mockup-driver-v2";
  const runStates = {
    completedArtifacts: { base: "complete", terminal: "completed" },
    completedHighlights: { base: "complete", terminal: "completed" },
    failed: { base: "complete", terminal: "failed" },
    idle: { base: "idle" },
    stopped: { base: "complete", terminal: "stopped" },
    working: { base: "working" },
  };
  const captureStates = {
    captureFailure: "failed",
    committing: "committing",
    connecting: "connecting",
    listening: "listening",
    requestingPermission: "requesting-permission",
  };

  // The demo schedules every rail arrival, and the working -> complete
  // auto-advance, through `after()`, which reads `setTimeout` off the global at
  // call time. Neutralising it leaves the state buttons, the CSS, and the
  // synchronous population path in `complete` intact, and removes the clock.
  function freezeDemoTimers() {
    window.setTimeout = () => 0;
    window.setInterval = () => 0;
    return true;
  }

  function gotoState(state, fixture = {}) {
    if (!(state in runStates) && !(state in captureStates)) {
      throw new Error(`easy-button mockup state is not captured: ${state}`);
    }
    const runState = state in captureStates ? runStates.idle : runStates[state];
    const baseState = runState.base;
    clickControl("goto", baseState);
    if (runState.terminal) {
      clickControl("terminal", runState.terminal);
    }
    if (state in captureStates) {
      enterCaptureState(captureStates[state], fixture);
    }
    applyFixture(fixture);
    const actual = paneState();
    const expectedCapture = state in captureStates ? captureStates[state] : "off";
    assertStateAxes(state, actual, baseState, expectedCapture);
    assertFixtureCopy(state, actual, fixture);
    return { ...actual, stateKey: state };
  }

  function assertStateAxes(state, actual, baseState, expectedCapture) {
    if (actual.dataState !== baseState || actual.capture !== expectedCapture) {
      throw new Error(
        `easy-button mockup did not enter ${state}: ${JSON.stringify({ actual, baseState, expectedCapture })}`,
      );
    }
  }

  function assertFixtureCopy(state, actual, fixture) {
    const expected = fixtureState(fixture);
    const mismatches = Object.entries(expected).filter(([key, value]) => {
      return JSON.stringify(actual[key]) !== JSON.stringify(value);
    });
    if (mismatches.length > 0) {
      throw new Error(
        `easy-button mockup did not apply the ${state} fixture: ${JSON.stringify({ actual, expected, mismatches })}`,
      );
    }
  }

  function fixtureState(fixture) {
    return Object.fromEntries(
      [
        "agentChipText",
        "artifactCount",
        "captureError",
        "captureText",
        "currentFocusText",
        "focusLabelText",
        "focusStatus",
        "helperText",
        "highlights",
        "inputPlaceholder",
        "narratorStatusText",
        "outputMode",
        "playback",
        "statusTone",
        "summaryText",
      ]
        .filter((key) => key in fixture)
        .map((key) => [key, fixture[key]]),
    );
  }

  function applyFixture(fixture) {
    setText(".agent-chip", fixture.agentChipText);
    setText("#currentFocus", fixture.currentFocusText);
    setText("#focusLabel", fixture.focusLabelText);
    setText("#helper", fixture.helperText);
    setText("#narratorStatus", fixture.narratorStatusText);
    setText("#summaryText", fixture.summaryText);
    const input = document.getElementById("textInput");
    if (input instanceof HTMLInputElement && typeof fixture.inputPlaceholder === "string") {
      input.placeholder = fixture.inputPlaceholder;
    }
    if (Array.isArray(fixture.highlights)) {
      replaceHighlights(fixture.highlights);
    }
    if (Number.isInteger(fixture.artifactCount)) {
      replaceArtifactCount(fixture.artifactCount);
    }
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement && typeof value === "string") {
      element.textContent = value;
    }
  }

  function replaceHighlights(items) {
    const list = document.getElementById("highlights");
    if (!(list instanceof HTMLElement)) {
      throw new Error("easy-button mockup highlights are not present");
    }
    list.replaceChildren(...items.map(createHighlight));
  }

  function createHighlight(item) {
    const row = document.createElement("li");
    row.className = "hl";
    const dot = document.createElement("span");
    dot.className = "hl-dot";
    dot.append(
      document.createElement("i"),
      document.createElement("i"),
      document.createElement("i"),
    );
    const text = document.createElement("span");
    text.className = "hl-text";
    text.textContent = item.text;
    const time = document.createElement("span");
    time.className = "hl-time";
    time.textContent = item.time;
    row.append(dot, text, time);
    return row;
  }

  function replaceArtifactCount(count) {
    const stack = document.getElementById("artifacts");
    if (!(stack instanceof HTMLElement)) {
      throw new Error("easy-button mockup artifacts are not present");
    }
    const templates = Array.from(stack.querySelectorAll(".artifact"));
    if (count === 0) {
      stack.replaceChildren();
      return;
    }
    if (templates.length === 0) {
      throw new Error("easy-button mockup has no artifact template");
    }
    stack.replaceChildren(
      ...Array.from({ length: count }, (_, index) =>
        templates[index % templates.length].cloneNode(true),
      ),
    );
  }

  function clickControl(axis, value) {
    const button = document.querySelector(`[data-${axis}="${value}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`easy-button mockup has no ${axis} control for ${value}`);
    }
    button.click();
  }

  function enterCaptureState(capture, fixture) {
    if (capture === "committing") {
      clickControl("capture", "listening");
    }
    if (capture === "failed") {
      clickControl("fail", "provider");
    } else {
      clickControl("capture", capture);
    }
    const captureLine = document.getElementById("captureLine");
    if (captureLine instanceof HTMLElement && typeof fixture.captureText === "string") {
      captureLine.textContent = fixture.captureText;
    }
    const captureError = document.getElementById("captureError");
    if (captureError instanceof HTMLElement && typeof fixture.captureError === "string") {
      captureError.textContent = fixture.captureError;
    }
  }

  function paneState() {
    const pane = requirePane();
    return {
      agentChipText: textForSelector(pane, ".agent-chip"),
      artifactCount: pane.querySelectorAll(".artifact").length,
      capture: datasetValue(pane, "capture"),
      captureError: textForId("captureError"),
      captureText: textForId("captureLine"),
      currentFocusText: textForId("currentFocus"),
      dataState: datasetValue(pane, "state"),
      focusLabelText: textForId("focusLabel"),
      focusStatus: datasetValue(pane, "focus"),
      helperText: textForId("helper"),
      highlights: highlightStates(pane),
      inputPlaceholder: attributeForId("textInput", "placeholder"),
      narratorStatusText: textForId("narratorStatus"),
      outputMode: datasetValue(pane, "outputMode"),
      playback: datasetValue(pane, "playback"),
      statusTone: datasetValue(pane, "status"),
      summaryText: textForId("summaryText"),
    };
  }

  function highlightStates(pane) {
    return Array.from(pane.querySelectorAll(".hl")).map((row) => ({
      text: textForSelector(row, ".hl-text"),
      time: textForSelector(row, ".hl-time"),
    }));
  }

  function textForId(id) {
    return textOf(document.getElementById(id));
  }

  function textForSelector(root, selector) {
    return textOf(root.querySelector(selector));
  }

  function textOf(element) {
    return element?.textContent?.trim() ?? "";
  }

  function attributeForId(id, name) {
    return document.getElementById(id)?.getAttribute(name) ?? "";
  }

  function datasetValue(element, key) {
    return element.dataset[key] ?? "";
  }

  function measure() {
    return probe().measure(requirePane(), "mockup");
  }

  function pin(timeMs) {
    return probe().pin(requirePane(), timeMs);
  }

  function probe() {
    const installed = globalThis.__settaEasyButtonPixelMatch;
    if (!installed) {
      throw new Error("easy-button pixel-match probe is not installed");
    }
    return installed;
  }

  function requirePane() {
    const pane = document.getElementById("pane");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("easy-button mockup pane is not present");
    }
    return pane;
  }

  globalThis.__settaEasyButtonMockup = {
    freezeDemoTimers,
    gotoState,
    measure,
    paneState,
    pin,
    version,
  };
})();
