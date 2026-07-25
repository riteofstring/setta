import { isDeepStrictEqual } from "node:util";

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
    expectedConversationIds,
  );
}

async function assertPersistedEasyButtonBindings(backend, workspaceId, expectedConversationIds) {
  void workspaceId;
  const result = await backend.get("/app/panes/layout");
  if (!result.layout) {
    throw new Error(`app pane layout was not persisted: ${JSON.stringify(result)}`);
  }
  const conversationPanes = result.layout.panes.filter(
    (pane) => pane.surfaceKind === "conversation",
  );
  for (const pane of conversationPanes) {
    const conversationId = pane.conversationConfig?.conversationId;
    if (!conversationId || conversationId.trim() !== conversationId) {
      throw new Error(`persisted conversation pane is unbound: ${JSON.stringify(pane)}`);
    }
  }
  for (const conversationId of expectedConversationIds) {
    if (
      !conversationPanes.some((pane) => pane.conversationConfig?.conversationId === conversationId)
    ) {
      throw new Error(
        `persisted app pane layout is missing conversation binding ${conversationId}: ${JSON.stringify(result.layout)}`,
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
  expectedConversationIds,
) {
  let invalidated = false;
  const invalidLayout = {
    ...validLayout,
    panes: validLayout.panes.map((pane) => {
      if (
        !invalidated &&
        pane.surfaceKind === "conversation" &&
        pane.conversationConfig?.conversationId === conversationId
      ) {
        invalidated = true;
        return { ...pane, conversationConfig: null };
      }
      return pane;
    }),
  };
  if (!invalidated) {
    throw new Error(`could not find persisted Easy Button binding ${conversationId}`);
  }
  const response = await backend.request("POST", "/app/panes/layout/save", {
    layout: invalidLayout,
  });
  const payload = await response.json();
  if (
    response.status !== 500 ||
    payload?.error?.code !== "corrupt_app_pane_layout_state" ||
    !payload.error.message.includes("conversationConfig is required for conversation panes")
  ) {
    throw new Error(
      `invalid conversation binding save did not fail explicitly: ${JSON.stringify({ payload, status: response.status })}`,
    );
  }
  const persistedLayout = await assertPersistedEasyButtonBindings(
    backend,
    workspaceId,
    expectedConversationIds,
  );
  if (!isDeepStrictEqual(persistedLayout, validLayout)) {
    throw new Error(
      `invalid Easy Button binding save replaced the valid layout: ${JSON.stringify({ persistedLayout, validLayout })}`,
    );
  }
}
