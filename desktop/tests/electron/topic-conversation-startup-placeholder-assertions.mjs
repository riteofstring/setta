import { driverCallExpression } from "./cdp-client.mjs";
import { waitForState } from "./electron-cdp-harness.mjs";

export async function assertImmediateInitialEasyButtonPlaceholder(
  client,
  workspaceOpenStartedAt,
  budgetMs,
) {
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationStartupState", { conversationId: "" }),
    (candidate) => candidate.startupPanePresent || initialEasyButtonPaneAlreadyReady(candidate),
    budgetMs,
  );
  const latencyMs = Date.now() - workspaceOpenStartedAt;
  if (latencyMs > budgetMs) {
    throw new Error(
      `initial Easy Button placeholder missed its ${budgetMs}ms budget: ${latencyMs}ms`,
    );
  }
  return {
    latencyMs,
    observedStartupPane: state.startupPanePresent,
    startupState: state.startupPanePresent ? state.startupState : "already-ready",
  };
}

function initialEasyButtonPaneAlreadyReady(state) {
  return [
    !state.createControlPresent,
    !state.searchControlPresent,
    !state.startupPanePresent,
    state.topBarSpeechStatusPresent,
    state.visiblePaneCount === 2,
    state.easyButtonPaneCount === 1,
    state.emptyFramePaneCount === 1,
  ].every(Boolean);
}
