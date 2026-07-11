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

export function assertEqualDesktopRailGeometry(state) {
  if (state.surfaceRect.width <= 720) {
    return;
  }
  const widthDelta = Math.abs(state.leftRailRect.width - state.rightRailRect.width);
  const surfaceMidpoint = state.surfaceRect.left + state.surfaceRect.width / 2;
  const centerMidpoint = state.centerRect.left + state.centerRect.width / 2;
  if (
    state.leftRailRect.width === 0 ||
    state.rightRailRect.width === 0 ||
    widthDelta > 1 ||
    Math.abs(surfaceMidpoint - centerMidpoint) > 1
  ) {
    throw new Error(
      `easy-button desktop rails did not keep the center stage geometrically centered: ${JSON.stringify(state)}`,
    );
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

// Layer geometry is fixed; only the periods change between states, so the two
// state-specific expectations are just the duration triples.
const swirlLayerNames = [
  "easy-button-swirl-spin-cw",
  "easy-button-swirl-spin-ccw",
  "easy-button-swirl-spin-cw",
];
const swirlLayerOpacities = [0.62, 0.5, 0.4];
const swirlWorkingDurations = ["18s", "29s", "41s"];
const swirlCompleteDurations = ["54s", "87s", "123s"];

function assertSwirlField(state, label) {
  const { swirl } = state;
  if (!swirl.exists) {
    throw new Error(`easy-button ${label} has no swirl field: ${JSON.stringify(state)}`);
  }
  if (!swirl.filter.includes("blur(") || !swirl.filter.includes("saturate(1.3)")) {
    throw new Error(
      `easy-button ${label} swirl lost its blur/saturate stack — without a filter the layers screen-blend against the pane: ${JSON.stringify(swirl)}`,
    );
  }
  if (!swirl.maskImage.includes("radial-gradient")) {
    throw new Error(`easy-button ${label} swirl lost its radial mask: ${JSON.stringify(swirl)}`);
  }
  if (swirl.layers.length !== 3) {
    throw new Error(`easy-button ${label} swirl layer count was wrong: ${JSON.stringify(swirl)}`);
  }
  assertSwirlPaints(swirl, label);
}

// The arms are relative colors over design tokens. A parse failure drops the
// whole gradient, so the layer paints nothing while every timing parameter above
// still reports exactly what the stylesheet asked for — a silently empty field.
function assertSwirlPaints(swirl, label) {
  if (!swirl.coreBackgroundImage.includes("radial-gradient")) {
    throw new Error(`easy-button ${label} swirl core painted nothing: ${JSON.stringify(swirl)}`);
  }
  for (const [index, layer] of swirl.layers.entries()) {
    if (!layer.backgroundImage.includes("conic-gradient")) {
      throw new Error(
        `easy-button ${label} swirl layer ${index + 1} painted nothing: ${JSON.stringify(swirl)}`,
      );
    }
  }
}

// `playState` and `willChange` carry the idle-cost guarantee: `opacity: 0` does
// not stop an animation, so an unpaused idle swirl still rotates and composites.
function assertSwirlMotion(state, expectations, label) {
  assertSwirlField(state, label);
  assertSwirlBreathe(state.swirl, expectations.playState, label);
  assertSwirlLayers(state.swirl, expectations, label);
}

function assertSwirlBreathe(swirl, playState, label) {
  if (
    swirl.inner.animationName !== "easy-button-swirl-breathe" ||
    swirl.inner.animationDuration !== "17s" ||
    swirl.inner.animationPlayState !== playState
  ) {
    throw new Error(
      `easy-button ${label} swirl breathe did not match the mockup: ${JSON.stringify(swirl)}`,
    );
  }
}

function assertSwirlLayers(swirl, expectations, label) {
  for (const [index, layer] of swirl.layers.entries()) {
    if (!swirlLayerMatches(layer, index, expectations)) {
      throw new Error(
        `easy-button ${label} swirl layer ${index + 1} did not match the mockup: ${JSON.stringify(swirl)}`,
      );
    }
  }
}

function swirlLayerMatches(layer, index, { durations, playState, willChange }) {
  return (
    layer.animationName === swirlLayerNames[index] &&
    layer.animationDuration === durations[index] &&
    layer.animationPlayState === playState &&
    layer.mixBlendMode === "screen" &&
    layer.willChange === willChange &&
    opacityMatches(layer.opacity, swirlLayerOpacities[index])
  );
}

export function assertSwirlIdle(state, label) {
  assertSwirlMotion(
    state,
    { durations: swirlWorkingDurations, playState: "paused", willChange: "auto" },
    label,
  );
  if (!opacityMatches(state.swirl.opacity, 0)) {
    throw new Error(`easy-button ${label} swirl was visible at idle: ${JSON.stringify(state)}`);
  }
}

// Called only on states whose opacity transition has settled: the swirl fades
// over 1600ms, so a state read the instant `working` lands reports an
// interpolated opacity that equals neither endpoint.
export function assertSwirlWorking(state, label) {
  assertSwirlMotion(
    state,
    { durations: swirlWorkingDurations, playState: "running", willChange: "transform" },
    label,
  );
  if (!opacityMatches(state.swirl.opacity, 0.85)) {
    throw new Error(
      `easy-button ${label} swirl did not reach full field: ${JSON.stringify(state)}`,
    );
  }
}

export function assertSwirlComplete(state, label) {
  assertSwirlMotion(
    state,
    { durations: swirlCompleteDurations, playState: "running", willChange: "auto" },
    label,
  );
  if (!opacityMatches(state.swirl.opacity, 0.2)) {
    throw new Error(`easy-button ${label} swirl did not settle: ${JSON.stringify(state)}`);
  }
}

export function assertSwirlFrozen(state, label) {
  const playStates = [
    state.swirl.inner.animationPlayState,
    ...state.swirl.layers.map((layer) => layer.animationPlayState),
  ];
  if (playStates.some((playState) => playState !== "paused")) {
    throw new Error(
      `easy-button ${label} swirl kept animating while frozen: ${JSON.stringify(state.swirl)}`,
    );
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
