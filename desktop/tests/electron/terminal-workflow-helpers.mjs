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
