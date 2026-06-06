export async function assertRendererQueueMatchesBackend(client, queuedPrompt) {
  const body = await client.evaluate("document.body.innerText");
  if (!body.includes(queuedPrompt)) {
    throw new Error(`renderer did not show queued prompt ${queuedPrompt}: ${body}`);
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
    `(() => {
      const active = document.activeElement;
      const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
      return {
        activeAriaLabel: active?.getAttribute("aria-label") ?? "",
        activeTagName: active?.tagName ?? "",
        activeTestId: active?.getAttribute("data-testid") ?? "",
        documentHasFocus: document.hasFocus(),
        focused: active?.getAttribute("aria-label") === "Ask Setta",
        textareaDisabled: textarea?.disabled ?? null,
        textareaExists: Boolean(textarea),
        textareaValue: textarea?.value ?? "",
      };
    })()`,
    (value) => value.focused,
  );
}

export async function waitForModelPicker(waitForState, client) {
  await waitForState(
    client,
    `(() => {
      const picker = document.querySelector('[data-testid="model-picker"]');
      return { body: document.body.innerText, ready: Boolean(picker) };
    })()`,
    (value) => value.ready && value.body.includes("scripted-fast"),
  );
}

export async function waitForModelPickerAbsent(waitForState, client) {
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('[data-testid="model-picker"]')) }))()`,
    (value) => !value.open,
  );
}

export async function waitForSelectedModel(waitForState, client, modelText) {
  await waitForState(
    client,
    `(() => {
      const picker = document.querySelector('[data-testid="model-picker"]');
      const selected = Array.from(picker?.querySelectorAll('[data-selected="true"]') ?? [])
        .map((button) => button.innerText);
      return { selected };
    })()`,
    (value) => value.selected.length === 1 && value.selected[0].includes(modelText),
  );
}

export async function waitForSelectedReasoningEffort(waitForState, client, effortText) {
  await waitForState(
    client,
    `(() => {
      const picker = document.querySelector('[data-testid="model-picker"]');
      const selected = Array.from(
        picker?.querySelectorAll('[data-reasoning-selected="true"]') ?? [],
      ).map((button) => button.innerText);
      return { selected };
    })()`,
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
  await client.evaluate(`(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  })()`);
}

async function waitForPickerButton(waitForState, client, text) {
  await waitForState(
    client,
    `(() => {
      const picker = document.querySelector('[data-testid="model-picker"]');
      const buttons = Array.from(picker?.querySelectorAll("button") ?? []);
      return {
        ready: buttons.some((button) => button.innerText.includes(${JSON.stringify(text)})),
      };
    })()`,
    (value) => value.ready,
  );
}

async function clickPickerButton(client, text, label) {
  const clicked = await client.evaluate(`(() => {
    const picker = document.querySelector('[data-testid="model-picker"]');
    const buttons = Array.from(picker?.querySelectorAll("button") ?? []);
    const button = buttons.find((candidate) =>
      candidate.innerText.includes(${JSON.stringify(text)})
    );
    if (!button || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`${label} was not clickable: ${text}`);
  }
}
