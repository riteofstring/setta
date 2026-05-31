export async function assertRendererQueueMatchesBackend(client, queuedPrompt) {
  const body = await client.evaluate("document.body.innerText");
  if (!body.includes(queuedPrompt) || !body.includes("Queued")) {
    throw new Error(`renderer did not show queued state for ${queuedPrompt}: ${body}`);
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
  await waitForState(
    client,
    `(() => ({
      focused: document.activeElement?.getAttribute("aria-label") === "Ask Setta",
    }))()`,
    (value) => value.focused,
  );
}

export async function waitForModelPickerAbsent(waitForState, client) {
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('[data-testid="model-picker"]')) }))()`,
    (value) => !value.open,
  );
}

export async function dispatchDocumentEscape(client) {
  await client.evaluate(`(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  })()`);
}
