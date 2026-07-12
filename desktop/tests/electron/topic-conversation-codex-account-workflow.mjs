import { clickButtonByAria, waitForText, waitForTexts } from "./electron-workflow-harness.mjs";
import { runCodexAccountWorkflow } from "./codex-account-workflow.mjs";
import { clickEnabledButtonByAria } from "./electron-cdp-harness.mjs";

export async function exerciseCodexAccountNotificationWorkflow({ backend, client, timeoutMs }) {
  await runCodexAccountWorkflow({
    backend,
    clickButtonByAria,
    client,
    waitForText,
    waitForTexts,
  });
  await clickEnabledButtonByAria(client, "Close pane", timeoutMs);
}
