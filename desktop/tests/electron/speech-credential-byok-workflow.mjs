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

export async function rejectOpenAIVoiceCredentialReplacementThroughSettings(
  client,
  apiKey,
  timeoutMs = defaultTimeoutMs,
) {
  await openOpenAIVoiceCredentialSettings(client, timeoutMs);
  await waitForOpenAIVoiceCredentialState(
    client,
    (state) => state.statusLabel === "Connected" && state.replaceEnabled,
    timeoutMs,
  );
  await waitForState(
    client,
    driverCallExpression("clickButton", { kind: "text", value: "Replace" }),
    (state) => state.clicked,
    timeoutMs,
  );
  await enterCredentialCandidate(client, apiKey, timeoutMs);
  await waitForState(
    client,
    driverCallExpression("clickButton", { kind: "text", value: "Save and verify" }),
    (state) => state.clicked,
    timeoutMs,
  );
  const failed = await waitForOpenAIVoiceCredentialState(
    client,
    (state) =>
      state.statusLabel === "Save failed" &&
      state.inputVisible &&
      state.inputHasValue &&
      state.saveEnabled,
    timeoutMs,
  );
  return {
    inputValueLength: failed.inputValueLength,
    statusDetail: failed.statusDetail,
    statusLabel: failed.statusLabel,
  };
}

export async function replaceOpenAIVoiceCredentialThroughSettings(
  client,
  apiKey,
  timeoutMs = defaultTimeoutMs,
) {
  await openOpenAIVoiceCredentialSettings(client, timeoutMs);
  const state = await waitForOpenAIVoiceCredentialState(
    client,
    (candidate) => candidate.cardReady && candidate.statusLabel !== "Checking",
    timeoutMs,
  );
  if (state.statusLabel === "Connected" && state.replaceEnabled) {
    await waitForState(
      client,
      driverCallExpression("clickButton", { kind: "text", value: "Replace" }),
      (candidate) => candidate.clicked,
      timeoutMs,
    );
  } else if (state.statusLabel !== "Save failed") {
    throw new Error(`OpenAI credential was not replaceable: ${JSON.stringify(state)}`);
  }
  await enterCredentialCandidate(client, apiKey, timeoutMs);
  await waitForState(
    client,
    driverCallExpression("clickButton", { kind: "text", value: "Save and verify" }),
    (candidate) => candidate.clicked,
    timeoutMs,
  );
  const configured = await waitForOpenAIVoiceCredentialState(
    client,
    (candidate) =>
      candidate.statusLabel === "Connected" &&
      !candidate.inputVisible &&
      candidate.replaceVisible &&
      candidate.disconnectVisible,
    timeoutMs,
  );
  return {
    providerLabel: configured.providerLabel,
    statusLabel: configured.statusLabel,
  };
}

export async function disconnectOpenAIVoiceCredentialThroughSettings(
  client,
  timeoutMs = defaultTimeoutMs,
) {
  await openOpenAIVoiceCredentialSettings(client, timeoutMs);
  await waitForOpenAIVoiceCredentialState(
    client,
    (state) => state.statusLabel === "Connected" && state.disconnectEnabled,
    timeoutMs,
  );
  await waitForState(
    client,
    driverCallExpression("clickButton", { kind: "text", value: "Disconnect" }),
    (state) => state.clicked,
    timeoutMs,
  );
  const disconnected = await waitForOpenAIVoiceCredentialState(
    client,
    (state) => state.statusLabel === "Not connected" && state.inputVisible,
    timeoutMs,
  );
  return {
    providerLabel: disconnected.providerLabel,
    statusLabel: disconnected.statusLabel,
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

async function enterCredentialCandidate(client, apiKey, timeoutMs) {
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
}
