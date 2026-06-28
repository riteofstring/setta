import { driverCallExpression } from "./cdp-client.mjs";

export async function assertRendererQueueMatchesBackend(client, queuedPrompt) {
  const body = await client.driver("bodyText");
  if (!body.body.includes(queuedPrompt)) {
    throw new Error(`renderer did not show queued prompt ${queuedPrompt}: ${body.body}`);
  }
}

export async function assertNoCriticalDiagnostics(backend, workspaceId, conversationId) {
  const diagnostics = await backend.post("/chat/diagnostics/list", {
    conversationId,
    runId: "",
    workspaceId,
  });
  const critical = diagnostics.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "critical",
  );
  if (critical.length > 0) {
    throw new Error(`critical diagnostics recorded: ${JSON.stringify(critical)}`);
  }
}

export async function waitForComposerFocus(waitForState, client) {
  await waitForState(client, driverCallExpression("composerFocus"), (value) => value.focused);
}

export async function waitForModelPicker(waitForState, client) {
  await waitForState(
    client,
    driverCallExpression("modelPicker"),
    (value) => value.ready && value.body.includes("scripted-fast"),
  );
}

export async function waitForModelPickerAbsent(waitForState, client) {
  await waitForState(client, driverCallExpression("modelPicker"), (value) => !value.open);
}

export async function waitForSelectedModel(waitForState, client, modelText) {
  await waitForState(
    client,
    driverCallExpression("selectedModelPickerItems", { attribute: "data-selected" }),
    (value) => value.selected.length === 1 && value.selected[0].includes(modelText),
  );
}

export async function waitForSelectedReasoningEffort(waitForState, client, effortText) {
  await waitForState(
    client,
    driverCallExpression("selectedModelPickerItems", {
      attribute: "data-reasoning-selected",
    }),
    (value) => value.selected.length === 1 && value.selected[0].includes(effortText),
  );
}

export async function clickModelByText(waitForState, client, modelText) {
  await waitForPickerButton(waitForState, client, modelText);
  await clickPickerButton(client, modelText, "model option");
}

export async function clickReasoningEffortByText(waitForState, client, effortText) {
  await waitForPickerButton(waitForState, client, effortText);
  await clickPickerButton(client, effortText, "reasoning effort option");
}

export async function dispatchDocumentEscape(client) {
  await client.driver("dispatchDocumentEscape");
}

async function waitForPickerButton(waitForState, client, text) {
  await waitForState(
    client,
    driverCallExpression("modelPickerButtonReady", { text }),
    (value) => value.ready,
  );
}

async function clickPickerButton(client, text, label) {
  const clicked = await client.driver("clickModelPickerButton", { text });
  if (!clicked) {
    throw new Error(`${label} was not clickable: ${text}`);
  }
}
