/* global HTMLButtonElement, HTMLElement, document, window */

// Drives docs/mockups/easy_button_pane_mockup.html so the pixel-match renderer
// can hold it still. The mockup is an interactive prototype, not a fixture: it
// stages its rails on timers and auto-advances `working` to `complete` about ten
// seconds in. Freezing its clock is what turns each state into a still.

(() => {
  const version = "setta-easy-button-mockup-driver-v1";
  const states = ["idle", "working", "complete"];

  // The demo schedules every rail arrival, and the working -> complete
  // auto-advance, through `after()`, which reads `setTimeout` off the global at
  // call time. Neutralising it leaves the state buttons, the CSS, and the
  // synchronous population path in `complete` intact, and removes the clock.
  function freezeDemoTimers() {
    window.setTimeout = () => 0;
    return true;
  }

  function gotoState(state) {
    if (!states.includes(state)) {
      throw new Error(`easy-button mockup state is not captured: ${state}`);
    }
    const button = document.querySelector(`[data-goto="${state}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`easy-button mockup has no control for ${state}`);
    }
    button.click();
    return paneState();
  }

  function paneState() {
    const pane = requirePane();
    return {
      artifacts: pane.querySelectorAll(".artifact").length,
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
