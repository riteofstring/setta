import { waitForState } from "./electron-cdp-harness.mjs";
import { easyButtonStateExpression, workflowTimeoutMs } from "./easy-button-pane-actions.mjs";

export function assertIdleControls(state) {
  const expected = {
    buttonAriaLabel: "Focus Easy Button request input",
    confirmActive: "false",
    inputDisabled: false,
    paneChromeTitle: "Easy Button",
    speechOutputMode: "off",
    speechOutputPlayback: "idle",
    speechOutputStatus: "not_configured",
    speechStatus: "unavailable",
    stopButtonVisible: false,
    voiceOffChipAriaLabel: "Explain why voice is off",
    voiceOffChipText: "Voice off",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) {
      throw new Error(`easy-button idle controls were incorrect: ${JSON.stringify(state)}`);
    }
  }
}

export async function assertVoiceOffExplanation(client) {
  await client.driver("easyButtonPaneClickVoiceOff");
  const state = await waitForState(
    client,
    easyButtonStateExpression(),
    (candidate) => candidate.voiceOffPopoverText !== "",
    workflowTimeoutMs,
  );
  if (
    state.voiceOffPopoverText !==
    "Voice needs OPENAI_API_KEY on the runtime. Typed requests work either way."
  ) {
    throw new Error(`easy-button Voice off explanation was incorrect: ${JSON.stringify(state)}`);
  }
  await client.driver("easyButtonPaneClickVoiceOff");
}

export function highlightSynthesisIsPending(state, requestText) {
  return (
    state.runRequestText === requestText &&
    state.easyState === "working" &&
    state.highlights.length === 2 &&
    state.speechOutputPlayback === "synthesizing"
  );
}

export function assertHeldFirstHighlight({
  firstHighlight,
  provider,
  secondHighlight,
  snapshot,
  synthesisCount,
  synthesizing,
}) {
  if (
    !firstHighlight ||
    !secondHighlight ||
    provider.synthesisInputs.length !== synthesisCount + 1 ||
    provider.synthesisInputs.at(-1) !== firstHighlight.text
  ) {
    throw new Error(
      `terminal-priority fixture did not hold the first persisted highlight: ${JSON.stringify({ snapshot, synthesizing })}`,
    );
  }
}

export function assertTerminalPriorityInputs({
  firstHighlight,
  persisted,
  priorityInputs,
  secondHighlight,
  speaking,
}) {
  if (
    priorityInputs.length === 2 &&
    priorityInputs[0] === firstHighlight.text &&
    priorityInputs[1] === persisted.latestRun.summary &&
    !priorityInputs.includes(secondHighlight.text)
  ) {
    return;
  }
  throw new Error(
    `terminal summary did not replace queued highlight speech: ${JSON.stringify({ priorityInputs, speaking })}`,
  );
}
