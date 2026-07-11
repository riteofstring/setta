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
