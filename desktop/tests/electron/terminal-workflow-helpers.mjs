import { setTimeout as delay } from "node:timers/promises";

import { dispatchKeyEvent, waitForState } from "./electron-cdp-harness.mjs";

const cdpAltMetaModifier = 5;
const emptyTerminalSnapshot = {
  exists: false,
  focused: false,
  maximized: false,
  paneId: "",
  profileId: "",
  sessionId: "",
  statusText: "",
  terminalLost: false,
  text: "",
  titleText: "",
  visible: false,
  xtermReady: false,
};

export function terminalSnapshotExpression({ paneId = null } = {}) {
  const requiredPaneId = requirePaneId(paneId, "terminalSnapshotExpression");
  return `(() => {
    const snapshots = globalThis.__settaE2EDriver?.terminalSnapshots ? globalThis.__settaE2EDriver.terminalSnapshots() : [];
    return snapshots.find((snapshot) => snapshot.paneId === ${JSON.stringify(requiredPaneId)}) ?? ${JSON.stringify(
      emptyTerminalSnapshot,
    )};
  })()`;
}

export function terminalSnapshotsExpression() {
  return "globalThis.__settaE2EDriver?.terminalSnapshots ? globalThis.__settaE2EDriver.terminalSnapshots() : []";
}

export function terminalScrollbackSearchExpression(expectedText, { paneId = null } = {}) {
  const requiredPaneId = requirePaneId(paneId, "terminalScrollbackSearchExpression");
  return `globalThis.__settaE2EDriver?.terminalScrollbackSearch ? globalThis.__settaE2EDriver.terminalScrollbackSearch(${JSON.stringify(
    {
      expectedText,
      paneId: requiredPaneId,
    },
  )}) : ${JSON.stringify({
    ...emptyTerminalSnapshot,
    found: false,
    source: "driver-unavailable",
  })}`;
}

export async function openTerminalFromShortcut(client, timeoutMs) {
  await client.installDriver();
  const beforeSnapshots = await client.evaluate(terminalSnapshotsExpression());
  const beforePaneIds = new Set(
    Array.isArray(beforeSnapshots)
      ? beforeSnapshots
          .map((snapshot) => snapshot?.paneId)
          .filter((paneId) => typeof paneId === "string" && paneId !== "")
      : [],
  );
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
  const snapshots = await waitForState(
    client,
    terminalSnapshotsExpression(),
    (candidateSnapshots) => newTerminalSnapshot(candidateSnapshots, beforePaneIds) !== null,
    timeoutMs,
  );
  const snapshot = newTerminalSnapshot(snapshots, beforePaneIds);
  if (!snapshot) {
    throw new Error(
      `terminal shortcut did not produce an explicit pane: ${JSON.stringify(snapshots)}`,
    );
  }
  return snapshot;
}

export async function focusTerminal(client, timeoutMs, { paneId = null } = {}) {
  const requiredPaneId = requirePaneId(paneId, "focusTerminal");
  await client.installDriver();
  await waitForState(
    client,
    terminalSnapshotExpression({ paneId: requiredPaneId }),
    (snapshot) => snapshot.exists && snapshot.visible && snapshot.xtermReady,
    timeoutMs,
  );
  const point = await client.driver("terminalPaneFocusPoint", { paneId: requiredPaneId });
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
    terminalSnapshotExpression({ paneId: requiredPaneId }),
    (snapshot) => snapshot.focused,
    timeoutMs,
  );
  await waitForTerminalPaneStageContained(client, requiredPaneId, timeoutMs);
  const result = await client.driver("focusTerminalTextarea", { paneId: requiredPaneId });
  if (!result.ok) {
    throw new Error(`terminal focus failed: ${JSON.stringify(result)}`);
  }
}

export async function waitForTerminalReady(client, timeoutMs, { paneId = null } = {}) {
  const requiredPaneId = requirePaneId(paneId, "waitForTerminalReady");
  return waitForState(
    client,
    terminalSnapshotExpression({ paneId: requiredPaneId }),
    (snapshot) =>
      snapshot.exists &&
      snapshot.visible &&
      snapshot.xtermReady &&
      snapshot.sessionId.startsWith("terminal_") &&
      snapshot.statusText !== "" &&
      snapshot.statusText !== "Starting shell" &&
      snapshot.titleText === snapshot.statusText,
    timeoutMs,
  );
}

export async function waitForTerminalText(client, expectedText, timeoutMs, { paneId = null } = {}) {
  const requiredPaneId = requirePaneId(paneId, "waitForTerminalText");
  return waitForState(
    client,
    terminalSnapshotExpression({ paneId: requiredPaneId }),
    (snapshot) => snapshot.text.includes(expectedText),
    timeoutMs,
  );
}

export async function waitForTerminalTextInScrollback(
  client,
  expectedText,
  timeoutMs,
  { paneId = null } = {},
) {
  const requiredPaneId = requirePaneId(paneId, "waitForTerminalTextInScrollback");
  return waitForState(
    client,
    terminalScrollbackSearchExpression(expectedText, { paneId: requiredPaneId }),
    (snapshot) => snapshot.found,
    timeoutMs,
  );
}

export async function sendTerminalCommand(client, paneId, text, timeoutMs = 5_000) {
  const requiredPaneId = requirePaneId(paneId, "sendTerminalCommand");
  await waitForState(
    client,
    terminalSnapshotExpression({ paneId: requiredPaneId }),
    (snapshot) => snapshot.focused && snapshot.visible && snapshot.xtermReady,
    timeoutMs,
  );
  await client.call("Input.insertText", { text });
  await pressTerminalEnter(client);
  await delay(100);
}

export async function waitForTerminalPaneStageContained(client, paneId, timeoutMs) {
  const requiredPaneId = requirePaneId(paneId, "waitForTerminalPaneStageContained");
  return waitForState(
    client,
    `globalThis.__settaE2EDriver?.terminalPaneStageState ? globalThis.__settaE2EDriver.terminalPaneStageState(${JSON.stringify(
      { paneId: requiredPaneId },
    )}) : { ok: false, reason: "driver-unavailable" }`,
    (state) => state.ok && state.visible && state.contained,
    timeoutMs,
  );
}

export async function closeTerminalPaneFromChrome(client, timeoutMs, { accept = true } = {}) {
  void timeoutMs;
  await client.installDriver();
  const removeDialogListener = client.on("Page.javascriptDialogOpening", () => {
    void client.call("Page.handleJavaScriptDialog", { accept });
  });
  try {
    const result = await client.driver("closeTerminalPane");
    if (!result.ok) {
      throw new Error(`terminal pane close failed: ${JSON.stringify(result)}`);
    }
  } finally {
    removeDialogListener();
  }
}

function newTerminalSnapshot(snapshots, beforePaneIds) {
  if (!Array.isArray(snapshots)) {
    return null;
  }
  return snapshots.find((snapshot) => isNewReadyTerminalSnapshot(snapshot, beforePaneIds)) ?? null;
}

function isNewReadyTerminalSnapshot(snapshot, beforePaneIds) {
  return (
    hasTerminalPaneId(snapshot) &&
    !beforePaneIds.has(snapshot.paneId) &&
    snapshot.focused &&
    snapshot.visible &&
    terminalSnapshotReady(snapshot)
  );
}

function hasTerminalPaneId(snapshot) {
  return Boolean(snapshot && typeof snapshot.paneId === "string" && snapshot.paneId !== "");
}

function terminalSnapshotReady(snapshot) {
  return (
    snapshot.xtermReady &&
    typeof snapshot.sessionId === "string" &&
    snapshot.sessionId.startsWith("terminal_") &&
    terminalSnapshotTitleReady(snapshot)
  );
}

function terminalSnapshotTitleReady(snapshot) {
  return (
    snapshot.statusText !== "" &&
    snapshot.statusText !== "Starting shell" &&
    snapshot.titleText === snapshot.statusText
  );
}

function requirePaneId(paneId, caller) {
  if (typeof paneId === "string" && paneId !== "") {
    return paneId;
  }
  throw new Error(`${caller} requires an explicit terminal pane id`);
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
