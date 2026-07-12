export async function assertEasyButtonBindingPersistence(
  backend,
  workspaceId,
  expectedConversationIds,
  invalidConversationId,
) {
  const layout = await assertPersistedEasyButtonBindings(
    backend,
    workspaceId,
    expectedConversationIds,
  );
  await assertInvalidEasyButtonBindingSaveRejected(
    backend,
    workspaceId,
    layout,
    invalidConversationId,
  );
}

async function assertPersistedEasyButtonBindings(backend, workspaceId, expectedConversationIds) {
  const result = await backend.post("/workspaces/ui/layout/read", { workspaceId });
  if (!result.layout) {
    throw new Error(`workspace layout was not persisted: ${JSON.stringify(result)}`);
  }
  const easyButtonPanes = result.layout.panes.filter((pane) => pane.surfaceKind === "easy-button");
  for (const pane of easyButtonPanes) {
    const conversationId = pane.easyButtonConfig?.conversationId;
    if (!conversationId || conversationId.trim() !== conversationId) {
      throw new Error(`persisted Easy Button pane is unbound: ${JSON.stringify(pane)}`);
    }
  }
  for (const conversationId of expectedConversationIds) {
    if (!easyButtonPanes.some((pane) => pane.easyButtonConfig?.conversationId === conversationId)) {
      throw new Error(
        `persisted workspace layout is missing conversation binding ${conversationId}: ${JSON.stringify(result.layout)}`,
      );
    }
  }
  return result.layout;
}

async function assertInvalidEasyButtonBindingSaveRejected(
  backend,
  workspaceId,
  validLayout,
  conversationId,
) {
  let invalidated = false;
  const invalidLayout = {
    ...validLayout,
    panes: validLayout.panes.map((pane) => {
      if (
        !invalidated &&
        pane.surfaceKind === "easy-button" &&
        pane.easyButtonConfig?.conversationId === conversationId
      ) {
        invalidated = true;
        return { ...pane, easyButtonConfig: null };
      }
      return pane;
    }),
  };
  if (!invalidated) {
    throw new Error(`could not find persisted Easy Button binding ${conversationId}`);
  }
  const response = await backend.request("POST", "/workspaces/ui/layout/save", {
    layout: invalidLayout,
  });
  const payload = await response.json();
  if (
    response.status !== 500 ||
    payload?.error?.code !== "corrupt_workspace_ui_state" ||
    !payload.error.message.includes("easyButtonConfig is required for easy-button panes")
  ) {
    throw new Error(
      `invalid Easy Button binding save did not fail explicitly: ${JSON.stringify({ payload, status: response.status })}`,
    );
  }
  await assertPersistedEasyButtonBindings(backend, workspaceId, [conversationId]);
}
