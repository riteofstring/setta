// Driver-call wrappers and waits shared by the Easy Button pane workflow and its
// pixel-match capture pass. Both drive the same pane through the same production
// paths; keeping the vocabulary in one module stops the two from drifting.

import { clickEnabledButtonByAria, waitForState } from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";

export const workflowTimeoutMs = 25_000;
export const desktopViewport = { deviceScaleFactor: 1, height: 900, mobile: false, width: 1440 };

export function easyButtonStateExpression() {
  return driverCallExpression("easyButtonPaneState");
}

export function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

export async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

export async function openEasyButtonFromShortcut(client) {
  const dispatched = await client.driver("easyButtonPaneOpenShortcut");
  if (!dispatched) {
    throw new Error("easy button shortcut was not dispatched");
  }
}

export async function submitEasyButtonRequest(client, requestText) {
  const submitted = await client.driver("easyButtonPaneSubmitRequest", requestText);
  if (!submitted) {
    throw new Error(`easy button request input was not submittable: ${requestText}`);
  }
}

export async function clickEasyButtonStop(client) {
  const clicked = await client.driver("easyButtonPaneClickStop");
  if (!clicked) {
    throw new Error("easy button stop control was not clickable");
  }
}

// The pane chrome title is written from a passive effect, so it lands one flush
// after `data-easy-button-state`. Every wait that precedes an assertion on it
// must gate on it too, or a poll can observe the half-applied commit.
export function easyButtonStateSettled(state, easyState) {
  return (
    state.exists &&
    state.surfaceKind === "easy-button" &&
    state.easyState === easyState &&
    state.paneChromeTitle === paneChromeTitleForState(easyState)
  );
}

export function paneChromeTitleForState(easyState) {
  return easyState === "idle" ? "Easy Button" : `Easy Button · ${easyState}`;
}
