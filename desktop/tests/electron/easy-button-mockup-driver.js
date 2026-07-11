/* global HTMLButtonElement, HTMLElement, document, window */

// Drives docs/mockups/easy_button_pane_mockup.html so the pixel-match renderer
// can hold it still. The mockup is an interactive prototype, not a fixture: it
// stages its rails on timers and auto-advances `working` to `complete` about ten
// seconds in. Freezing its clock is what turns each state into a still.

(() => {
  const version = "setta-easy-button-mockup-driver-v2";
  const baseStates = ["idle", "working", "complete"];
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
    if (!baseStates.includes(state) && !(state in captureStates)) {
      throw new Error(`easy-button mockup state is not captured: ${state}`);
    }
    const baseState = state in captureStates ? "idle" : state;
    clickControl("goto", baseState);
    if (state in captureStates) {
      enterCaptureState(captureStates[state], fixture);
    }
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
    if (
      (typeof fixture.captureText === "string" && actual.captureText !== fixture.captureText) ||
      (typeof fixture.captureError === "string" && actual.captureError !== fixture.captureError)
    ) {
      throw new Error(
        `easy-button mockup did not apply the ${state} fixture: ${JSON.stringify({ actual, fixture })}`,
      );
    }
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
      artifacts: pane.querySelectorAll(".artifact").length,
      capture: pane.dataset.capture ?? "",
      captureError: document.getElementById("captureError")?.textContent ?? "",
      captureText: document.getElementById("captureLine")?.textContent ?? "",
      dataState: pane.dataset.state ?? "",
      highlights: pane.querySelectorAll(".hl").length,
    };
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
