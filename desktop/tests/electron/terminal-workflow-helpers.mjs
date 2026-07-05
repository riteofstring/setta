import { setTimeout as delay } from "node:timers/promises";

import { dispatchKeyEvent, waitForState } from "./electron-cdp-harness.mjs";

const cdpAltMetaModifier = 5;

export function terminalSnapshotExpression() {
  return "globalThis.__settaE2EDriver.terminalSnapshot()";
}

export function terminalScrollbackSearchExpression(expectedText) {
  return `globalThis.__settaE2EDriver.terminalScrollbackSearch(${JSON.stringify({
    expectedText,
  })})`;
}

export async function openTerminalFromShortcut(client, timeoutMs) {
  await client.installDriver();
  await dispatchKeyEvent(client, {
    code: "KeyT",
    key: "t",
    modifiers: cdpAltMetaModifier,
    type: "rawKeyDown",
  });
  await dispatchKeyEvent(client, {
    code: "KeyT",
    key: "t",
    modifiers: cdpAltMetaModifier,
    type: "keyUp",
  });
  await waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) => snapshot.exists && snapshot.focused && snapshot.visible && snapshot.xtermReady,
    timeoutMs,
  );
}

export async function focusTerminal(client, timeoutMs) {
  await client.installDriver();
  await waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) => snapshot.exists && snapshot.visible && snapshot.xtermReady,
    timeoutMs,
  );
  const point = await client.driver("terminalPaneFocusPoint");
  if (!point.ok) {
    throw new Error(`terminal pane focus point unavailable: ${JSON.stringify(point)}`);
  }
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
  await waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) => snapshot.focused,
    timeoutMs,
  );
  const result = await client.driver("focusTerminalTextarea");
  if (!result.ok) {
    throw new Error(`terminal focus failed: ${JSON.stringify(result)}`);
  }
}

export async function closeTerminalPaneFromChrome(
  client,
  timeoutMs,
  { accept = true, expectDialog = null } = {},
) {
  await client.installDriver();
  const dialogs = [];
  let resolveFirstDialog;
  const firstDialog = new Promise((resolve) => {
    resolveFirstDialog = resolve;
  });
  const startedAt = Date.now();
  const removeDialogListener = client.on("Page.javascriptDialogOpening", (event) => {
    dialogs.push({
      message: event.message ?? "",
      type: event.type ?? "",
    });
    resolveFirstDialog();
    void client.call("Page.handleJavaScriptDialog", { accept });
  });
  try {
    const result = await client.driver("closeTerminalPane");
    if (!result.ok) {
      throw new Error(`terminal pane close failed: ${JSON.stringify(result)}`);
    }
    if (expectDialog === true) {
      await waitForExpectedTerminalCloseDialog(firstDialog, timeoutMs);
    }
    if (expectDialog === false) {
      await delay(500);
      if (dialogs.length > 0) {
        throw new Error(`terminal close opened unexpected dialog: ${JSON.stringify(dialogs)}`);
      }
    }
    return {
      dialogCount: dialogs.length,
      dialogs,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    removeDialogListener();
  }
}

async function waitForExpectedTerminalCloseDialog(firstDialog, timeoutMs) {
  const opened = await Promise.race([
    firstDialog.then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
  if (!opened) {
    throw new Error("terminal close did not open the expected confirmation dialog");
  }
}
