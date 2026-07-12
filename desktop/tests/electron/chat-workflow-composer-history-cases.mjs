import { pasteImageIntoComposer } from "./chat-workflow-image-attachment-cases.mjs";

const promptHistoryPNGBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAG0lEQVR4nGL6z8DA8J+BiZHh/38GBkAAAAD//x0hBAKGdL17AAAAAElFTkSuQmCC";

export async function runComposerPromptHistoryWorkflow({
  backend,
  clickButtonByAria,
  clickButtonContainingText,
  client,
  createChat,
  setInputValue,
  submitComposer,
  waitForRunWithPrompt,
  waitForState,
  waitForTexts,
  workspaceId,
}) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "history first prompt", "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "history first prompt",
    "completed",
  );
  await submitComposer(client, "history second prompt", "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "history second prompt",
    "completed",
  );
  await waitForTexts(client, ["history first prompt", "history second prompt"]);
  await assertComposerPromptHistoryProjection(client, workspaceId, conversationId, [
    "history second prompt",
    "history first prompt",
  ]);

  await clearComposer(client, waitForState);
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, "history second prompt");
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, "history first prompt");
  await pressComposerArrow(client, waitForState, "ArrowDown");
  await waitForComposerValue(client, waitForState, "history second prompt");
  await pressComposerArrow(client, waitForState, "ArrowDown");
  await waitForComposerValue(client, waitForState, "");

  await setComposerValueWithCaret(
    client,
    waitForState,
    "line one\nline two",
    "line one\nline two".length,
  );
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, "line one\nline two");

  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', "/goal");
  await waitForState(
    client,
    `Boolean(document.querySelector('[data-testid="command-palette"]'))`,
    Boolean,
  );
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, "/goal");

  await clearComposer(client, waitForState);
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, "history second prompt");
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', "history second prompt edited");
  await clickButtonByAria(client, "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "history second prompt edited",
    "completed",
  );
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, "history second prompt edited");

  const multilinePrompt = "history multiline\nprompt";
  const multilinePromptSummary = "history multiline prompt";
  await clearComposer(client, waitForState);
  await submitComposer(client, multilinePrompt, "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    multilinePromptSummary,
    "completed",
  );
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, multilinePrompt);
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, multilinePrompt);

  await clearComposer(client, waitForState);
  await pasteImageIntoComposer(client, waitForState, "history-image.png", promptHistoryPNGBase64);
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', "history image prompt");
  await clickButtonByAria(client, "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "history image prompt",
    "completed",
  );
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, "history image prompt");
  await waitForHistoryImageChip(client, waitForState, "history-image.png");

  await clearComposer(client, waitForState);
  await createChat(client, backend, workspaceId);
  await clickButtonContainingText(client, "history first prompt");
  await waitForState(
    client,
    selectedConversationExpression(),
    (value) => value.selectedConversationId === conversationId,
  );
  await pressComposerArrow(client, waitForState, "ArrowUp");
  await waitForComposerValue(client, waitForState, "history image prompt");
  await waitForHistoryImageChip(client, waitForState, "history-image.png");
}

export async function assertComposerPromptHistoryProjection(
  client,
  workspaceId,
  conversationId,
  expectedPrompts,
) {
  const history = await client.evaluate(
    `window.setta.chat.listComposerPromptHistory(${JSON.stringify(workspaceId)}, ${JSON.stringify(conversationId)}, 0, ${expectedPrompts.length})`,
  );
  const prompts = history.entries.map((entry) => historyEntryText(entry));
  if (JSON.stringify(prompts) !== JSON.stringify(expectedPrompts)) {
    throw new Error(
      `composer prompt history = ${JSON.stringify(prompts)}, want ${JSON.stringify(expectedPrompts)}`,
    );
  }
  for (const entry of history.entries) {
    if (entry.conversationId !== conversationId) {
      throw new Error(
        `composer prompt history entry has conversation ${entry.conversationId}, want ${conversationId}`,
      );
    }
    if (entry.attachments.length !== 0) {
      throw new Error(
        `text prompt history entry unexpectedly had attachments: ${JSON.stringify(entry.attachments)}`,
      );
    }
  }
}

function historyEntryText(entry) {
  return entry.input.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text.text)
    .join("");
}

async function clearComposer(client, waitForState) {
  await setComposerValueWithCaret(client, waitForState, "", 0);
}

async function pressComposerArrow(client, waitForState, key) {
  await waitForState(client, composerReadyExpression(), (value) => value.ready);
  const focused = await client.evaluate(`(() => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    if (!textarea || textarea.disabled) {
      return false;
    }
    textarea.focus();
    return document.activeElement === textarea;
  })()`);
  if (!focused) {
    throw new Error(`composer could not be focused before ${key}`);
  }
  const code = key;
  const nativeVirtualKeyCode = key === "ArrowUp" ? 38 : 40;
  await client.call("Input.dispatchKeyEvent", {
    code,
    key,
    nativeVirtualKeyCode,
    type: "keyDown",
    windowsVirtualKeyCode: nativeVirtualKeyCode,
  });
  await client.call("Input.dispatchKeyEvent", {
    code,
    key,
    nativeVirtualKeyCode,
    type: "keyUp",
    windowsVirtualKeyCode: nativeVirtualKeyCode,
  });
}

async function setComposerValueWithCaret(client, waitForState, value, caret) {
  const changed = await client.driver("setComposerValueWithCaret", { caret, value });
  if (!changed) {
    throw new Error("composer value could not be changed");
  }
  await waitForComposerValue(client, waitForState, value);
}

async function waitForComposerValue(client, waitForState, value) {
  await waitForState(client, composerValueExpression(), (state) => state.value === value);
}

async function waitForHistoryImageChip(client, waitForState, fileName) {
  await waitForState(
    client,
    `Array.from(document.images).some((image) => image.alt === ${JSON.stringify(fileName)} && image.dataset.attachmentVariantKind === "thumbnail" && image.src.endsWith("/thumbnail"))`,
    Boolean,
  );
}

function composerReadyExpression() {
  return `(() => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    return { ready: Boolean(textarea && !textarea.disabled) };
  })()`;
}

function composerValueExpression() {
  return `(() => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    return { value: textarea?.value ?? "" };
  })()`;
}

function selectedConversationExpression() {
  return `(() => {
    const panel = document.querySelector('[data-testid="chat-detail-pane"]');
    return { selectedConversationId: panel?.getAttribute("data-conversation-id") ?? "" };
  })()`;
}
