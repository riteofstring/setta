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

export async function waitForTerminalReady(client, timeoutMs) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) =>
      snapshot.exists &&
      snapshot.visible &&
      snapshot.xtermReady &&
      snapshot.sessionId.startsWith("terminal_") &&
      snapshot.statusText !== "" &&
      snapshot.statusText !== "Starting shell",
    timeoutMs,
  );
}

export async function waitForTerminalText(client, expectedText, timeoutMs) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) => snapshot.text.includes(expectedText),
    timeoutMs,
  );
}

export async function waitForTerminalTextInScrollback(client, expectedText, timeoutMs) {
  return waitForState(
    client,
    terminalScrollbackSearchExpression(expectedText),
    (snapshot) => snapshot.found,
    timeoutMs,
  );
}

export async function sendTerminalCommand(client, text) {
  await client.call("Input.insertText", { text });
  await pressTerminalEnter(client);
  await delay(100);
}

async function pressTerminalEnter(client) {
  await client.call("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    text: "\r",
    type: "keyDown",
    windowsVirtualKeyCode: 13,
  });
  await client.call("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    type: "keyUp",
    windowsVirtualKeyCode: 13,
  });
}
