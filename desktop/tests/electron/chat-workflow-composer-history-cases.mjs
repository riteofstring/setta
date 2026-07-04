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
