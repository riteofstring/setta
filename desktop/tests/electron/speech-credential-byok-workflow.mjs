import { driverCallExpression } from "./cdp-client.mjs";
import { waitForSelector, waitForState } from "./electron-cdp-harness.mjs";

const defaultTimeoutMs = 30_000;
const credentialCardSelector = '[data-testid="openai-voice-connection-card"]';
const apiKeyInputSelector = 'input[aria-label="OpenAI API key"]';

export async function saveOpenAIVoiceCredentialThroughSettings(
  client,
  apiKey,
  timeoutMs = defaultTimeoutMs,
) {
  await openOpenAIVoiceCredentialSettings(client, timeoutMs);
  const initial = await waitForOpenAIVoiceCredentialState(
    client,
    (state) => state.statusLabel === "Not connected" && state.inputVisible,
    timeoutMs,
  );
  if (initial.inputType !== "password") {
    throw new Error(`OpenAI credential input type was ${initial.inputType || "missing"}`);
  }

  await client.installDriver();
  const changed = await client.driver("setInputValue", {
    selector: apiKeyInputSelector,
    value: apiKey,
  });
  if (!changed) {
    throw new Error("OpenAI credential input was not editable");
  }
  await waitForOpenAIVoiceCredentialState(
    client,
    (state) => state.inputHasValue && state.saveEnabled,
    timeoutMs,
  );
  await waitForState(
    client,
    driverCallExpression("clickButton", { kind: "text", value: "Save and verify" }),
    (state) => state.clicked,
    timeoutMs,
  );
  const configured = await waitForOpenAIVoiceCredentialState(
    client,
    (state) =>
      state.statusLabel === "Connected" &&
      !state.inputVisible &&
      state.replaceVisible &&
      state.disconnectVisible,
    timeoutMs,
  );
  return {
    initialStatusLabel: initial.statusLabel,
    providerLabel: configured.providerLabel,
    statusLabel: configured.statusLabel,
  };
}

export async function openOpenAIVoiceCredentialSettings(client, timeoutMs = defaultTimeoutMs) {
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("speechCredentialOpenSettingsPane"),
    (state) => state.ready,
    timeoutMs,
  );
  await waitForState(
    client,
    driverCallExpression("speechCredentialOpenVoicesSubtab"),
    (state) => state.ready,
    timeoutMs,
  );
  await waitForSelector(client, credentialCardSelector, timeoutMs);
  await waitForOpenAIVoiceCredentialState(
    client,
    (state) => state.cardReady && state.statusLabel !== "Checking",
    timeoutMs,
  );
}

export function waitForOpenAIVoiceCredentialState(client, ready, timeoutMs = defaultTimeoutMs) {
  return waitForState(client, driverCallExpression("speechCredentialCardState"), ready, timeoutMs);
}
