// Pixel-match assertions for the Easy Button pane, split out of
// easy-button-pane-workflow.test.mjs to keep that file under the line cap.
//
// These are the guards for docs/plans/easy-button-pixel-match-20260709.md: they
// pin the parameters of the pane's motion and tone, which are static and
// inspectable, rather than trying to compare rendered frames.

export function opacityMatches(value, expected) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && Math.abs(parsed - expected) <= 0.01;
}

// The green check belongs to `completed` runs only; stopped and failed runs
// carry the same summary slot with no mark.
export function assertSummaryOkMark(state, summaryFact) {
  const expectsOkMark = summaryFact === "Done in";
  if (expectsOkMark !== state.summaryText.startsWith("✓")) {
    throw new Error(
      `easy-button terminal ok mark did not match the run status: ${JSON.stringify(state)}`,
    );
  }
}

export function assertRailLabelText(state, label) {
  const texts = state.railLabels.map((entry) => entry.text);
  if (texts.length !== 2 || texts[0] !== "Now" || texts[1] !== "Artifacts") {
    throw new Error(`easy-button ${label} rail labels were wrong: ${JSON.stringify(state)}`);
  }
}

// Expectations come from each rail's own content rather than a hardcoded pair,
// so this does not depend on whether a given scripted run also emits highlights.
export function railLabelsMatchContent(state) {
  const expected = [state.highlights.length > 0 ? 1 : 0, state.artifacts.length > 0 ? 1 : 0];
  return (
    state.railLabels.length === 2 &&
    state.railLabels.every((entry, index) => opacityMatches(entry.opacity, expected[index]))
  );
}

export function assertRailLabelsMatchContent(state, label) {
  assertRailLabelText(state, label);
  if (!railLabelsMatchContent(state)) {
    throw new Error(
      `easy-button ${label} rail labels did not fade with their content: ${JSON.stringify(state)}`,
    );
  }
}

// Guards the cascade bug: `animation-fill-mode: both` kept the arrival
// keyframe's `opacity: 1` applied forever, so the age fade never rendered.
export function assertHighlightCascade(state, expectedOpacities, label) {
  if (state.highlights.length !== expectedOpacities.length) {
    throw new Error(`easy-button ${label} highlight count was wrong: ${JSON.stringify(state)}`);
  }
  for (const [index, highlight] of state.highlights.entries()) {
    if (highlight.animationFillMode !== "none") {
      throw new Error(
        `easy-button ${label} highlight ${index + 1} filled its arrival keyframe: ${JSON.stringify(state)}`,
      );
    }
    if (!opacityMatches(highlight.opacity, expectedOpacities[index])) {
      throw new Error(
        `easy-button ${label} highlight ${index + 1} did not age-fade: ${JSON.stringify(state)}`,
      );
    }
  }
}

export function assertHighlightDotPulse(state, label) {
  const dots = state.highlights.map((highlight) => highlight.dotAnimationName);
  if (dots.at(-1) !== "easy-button-dot-pulse") {
    throw new Error(`easy-button ${label} newest dot did not pulse: ${JSON.stringify(state)}`);
  }
  if (dots.slice(0, -1).some((name) => name !== "none")) {
    throw new Error(`easy-button ${label} aged dots pulsed: ${JSON.stringify(state)}`);
  }
}

// `viewState` collapses completed/failed/stopped into `complete`. Only a
// `completed` run may wear the success visuals. The confirm pulse is transient,
// so its presence is proven by waitForEasyButtonConfirmPulse; what is asserted
// here is the invariant that matters — it must NEVER fire for the other two.
export function assertTerminalTone(state, expectedTone, label) {
  if (state.statusTone !== expectedTone) {
    throw new Error(
      `easy-button ${label} status tone was ${state.statusTone}, expected ${expectedTone}: ${JSON.stringify(state)}`,
    );
  }
  if (expectedTone === "completed") {
    return;
  }
  if (state.confirmActive !== "false" || state.controlAnimationName !== "none") {
    throw new Error(
      `easy-button ${label} fired the confirm pulse for a ${expectedTone} run: ${JSON.stringify(state)}`,
    );
  }
}

// Only meaningful on a state read after the control's 320ms border-color
// transition has settled: mid-flight, Chromium reports an interpolated
// `oklab(… / 0.998)` that equals neither endpoint.
export function assertControlBorderTone(state, restingBorderColor, expectRests, label) {
  if (expectRests !== (state.buttonBorderColor === restingBorderColor)) {
    throw new Error(
      `easy-button ${label} control border should ${expectRests ? "rest" : "be toned"}: ${JSON.stringify(state)}`,
    );
  }
}

// `toneKey` names a resolved design token, so this pins the tone to the token
// rather than to whatever string Chromium happens to serialize a color into.
export function assertNewestDotTone(state, toneKey, label) {
  const expected = state.toneColors[toneKey];
  if (!expected) {
    throw new Error(
      `easy-button ${label} could not resolve the ${toneKey} tone: ${JSON.stringify(state)}`,
    );
  }
  const dots = state.highlights.map((highlight) => highlight.dotBackgroundColor);
  if (dots.length === 0) {
    throw new Error(`easy-button ${label} had no highlight dot to tone: ${JSON.stringify(state)}`);
  }
  if (dots.at(-1) !== expected) {
    throw new Error(
      `easy-button ${label} newest dot was ${dots.at(-1)}, expected the ${toneKey} tone ${expected}: ${JSON.stringify(state)}`,
    );
  }
  for (const [index, dot] of dots.slice(0, -1).entries()) {
    if (dot !== state.toneColors.resting) {
      throw new Error(
        `easy-button ${label} aged dot ${index + 1} was not resting: ${JSON.stringify(state)}`,
      );
    }
  }
}

export function assertArtifactMotionParameters(state, label) {
  for (const [index, artifact] of state.artifacts.entries()) {
    if (
      artifact.animationName !== "easy-button-artifact-arrive" ||
      artifact.animationDuration !== "0.52s" ||
      artifact.animationTimingFunction !== "cubic-bezier(0.22, 1, 0.36, 1)" ||
      artifact.animationFillMode !== "none"
    ) {
      throw new Error(
        `easy-button ${label} artifact ${index + 1} arrival motion did not match the mockup: ${JSON.stringify(state)}`,
      );
    }
  }
}
