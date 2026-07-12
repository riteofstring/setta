import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  captureScreenshot,
  clickEnabledButtonByAria,
  dispatchKeyEvent,
  waitForSelector,
  waitForState,
} from "./electron-cdp-harness.mjs";

export async function exerciseMasterOverlayEntryPoints({
  artifactDirectory,
  client,
  text,
  timeoutMs,
  workspaceId,
}) {
  await assertFixedMasterLauncher(client);
  await openFromSidebarAndRetainDraft(client, text, timeoutMs);
  await collapseProjectSidebar(client, timeoutMs);
  await openFromAppChrome(client, text, timeoutMs);
  await openFromGlobalShortcut(client, text, timeoutMs);

  await clickEnabledButtonByAria(client, "Send to Setta", timeoutMs);
  await assertMasterHistory(client, [text], timeoutMs);
  const recorded = await waitForRecordedMasterOverlayInput(artifactDirectory, text, timeoutMs);
  assertRecordedTypedMasterInput(recorded, workspaceId);

  await clickEnabledButtonByAria(client, "Close Ask Setta", timeoutMs);
  await waitForMasterOverlayClosed(client, timeoutMs);
  await clickEnabledButtonByAria(client, "Show project sidebar", timeoutMs);
  await waitForSelector(client, '[data-testid="master-sidebar-launcher"]', timeoutMs);
  return recorded;
}

async function assertFixedMasterLauncher(client) {
  const state = await client.evaluate(`(() => {
    const launcher = document.querySelector('[data-testid="master-sidebar-launcher"]');
    const scroll = document.querySelector('[data-testid="sidebar-scrollable-sections"]');
    return {
      available: launcher instanceof HTMLButtonElement && !launcher.disabled,
      insideScrollableNavigator: Boolean(launcher && scroll?.contains(launcher)),
    };
  })()`);
  if (!state.available || state.insideScrollableNavigator) {
    throw new Error(
      `master sidebar launcher is not fixed above navigation: ${JSON.stringify(state)}`,
    );
  }
}

async function openFromSidebarAndRetainDraft(client, text, timeoutMs) {
  await clickMasterSurfaceEntry(client, "master-sidebar-launcher");
  await waitForMasterOverlay(client, { draft: "", focused: true }, timeoutMs);
  await setMasterOverlayDraft(client, text, timeoutMs);
  await clickEnabledButtonByAria(client, "Close Ask Setta", timeoutMs);
  await waitForMasterOverlayClosed(client, timeoutMs);
}

async function collapseProjectSidebar(client, timeoutMs) {
  await clickEnabledButtonByAria(client, "Hide project sidebar", timeoutMs);
  await waitForState(
    client,
    `(() => ({
      launcherPresent: Boolean(document.querySelector('[data-testid="master-sidebar-launcher"]')),
      reopenAvailable: Boolean(document.querySelector('[aria-label="Show project sidebar"]')),
    }))()`,
    (state) => !state.launcherPresent && state.reopenAvailable,
    timeoutMs,
  );
}

async function openFromAppChrome(client, text, timeoutMs) {
  await clickMasterSurfaceEntry(client, "master-overlay-button");
  await waitForMasterOverlay(client, { draft: text, focused: true }, timeoutMs);
  await clickEnabledButtonByAria(client, "Close Ask Setta", timeoutMs);
  await waitForMasterOverlayClosed(client, timeoutMs);
}

async function openFromGlobalShortcut(client, text, timeoutMs) {
  await dispatchKeyEvent(client, { code: "KeyK", key: "k", modifiers: 2 });
  await dispatchKeyEvent(client, {
    code: "KeyK",
    key: "k",
    modifiers: 2,
    type: "keyUp",
  });
  const state = await waitForMasterOverlay(client, { draft: text, focused: true }, timeoutMs);
  if (!state.shellInert || !state.nativeViewsOccluded) {
    throw new Error(`master overlay did not isolate shell/native panes: ${JSON.stringify(state)}`);
  }
}

async function clickMasterSurfaceEntry(client, testId) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`master surface entry was not clickable: ${testId}`);
  }
}

async function setMasterOverlayDraft(client, text, timeoutMs) {
  const updated = await client.evaluate(`(() => {
    const textarea = document.querySelector('[data-testid="master-overlay"] textarea[aria-label="Ask Setta"]');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, ${JSON.stringify(text)});
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  if (!updated) {
    throw new Error("master overlay draft could not be updated");
  }
  await waitForMasterOverlay(client, { draft: text, focused: true }, timeoutMs);
}

async function waitForMasterOverlay(client, { draft, focused }, timeoutMs) {
  return waitForState(
    client,
    `(() => {
      const overlay = document.querySelector('[data-testid="master-overlay"]');
      const textarea = overlay?.querySelector('textarea[aria-label="Ask Setta"]');
      const shell = document.querySelector('[aria-hidden="true"][inert]');
      const workspace = document.querySelector('[data-testid="workspace-layout-area"]');
      return {
        draft: textarea instanceof HTMLTextAreaElement ? textarea.value : null,
        focused: textarea === document.activeElement,
        nativeViewsOccluded: workspace?.getAttribute("data-native-view-overlay-active") === "true",
        open: Boolean(overlay),
        shellInert: Boolean(shell),
      };
    })()`,
    (state) => state.open && state.draft === draft && state.focused === focused,
    timeoutMs,
  );
}

async function waitForMasterOverlayClosed(client, timeoutMs) {
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('[data-testid="master-overlay"]')) }))()`,
    (state) => !state.open,
    timeoutMs,
  );
}

async function assertMasterHistory(client, expectedTexts, timeoutMs) {
  const history = await waitForState(
    client,
    `(() => ({
      open: Boolean(document.querySelector('[data-testid="master-overlay"]')),
      entries: Array.from(document.querySelectorAll('[data-master-input-state="accepted"]'))
        .map((state) => state.closest('[data-master-input-id]')?.querySelector('[data-master-speaker="user"] p')?.textContent ?? ""),
    }))()`,
    (state) => state.open && expectedTexts.every((text) => state.entries.includes(text)),
    timeoutMs,
  );
  if (history.entries.length !== new Set(history.entries).size) {
    throw new Error(
      `master overlay rendered duplicate accepted inputs: ${JSON.stringify(history)}`,
    );
  }
  return history;
}

export async function captureMasterHistory({ artifactPath, client, expectedTexts, timeoutMs }) {
  await assertMasterHistory(client, expectedTexts, timeoutMs);
  await captureScreenshot(client, artifactPath);
}

export async function closeMasterOverlay(client, timeoutMs) {
  await clickEnabledButtonByAria(client, "Close Ask Setta", timeoutMs);
  await waitForMasterOverlayClosed(client, timeoutMs);
}

async function waitForRecordedMasterOverlayInput(artifactDirectory, text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const starts = events.filter(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "master:submit-input" &&
        event.args?.[0]?.input?.text === text,
    );
    if (starts.length > 1) {
      throw new Error(`typed master overlay input was submitted more than once: ${starts.length}`);
    }
    const start = starts[0];
    const finish = start
      ? events.find(
          (event) =>
            event.type === "ipc_finish" &&
            event.channel === "master:submit-input" &&
            event.id === start.id,
        )
      : null;
    if (start && finish) {
      return { accepted: finish.result, request: start.args[0] };
    }
    await delay(20);
  }
  throw new Error("timed out waiting for typed master overlay input");
}

function assertRecordedTypedMasterInput(recorded, workspaceId) {
  const { accepted, request } = requiredRecordedMasterInput(recorded);
  assertTypedMasterRequest(request, workspaceId, recorded);
  if (
    accepted.input.id !== request.input.id ||
    accepted.replyDelivery.showInMasterOverlay !== true
  ) {
    throw new Error(`typed master overlay receipt drifted: ${JSON.stringify(recorded)}`);
  }
}

function requiredRecordedMasterInput(recorded) {
  if (!recorded.request) {
    throw new Error(
      `typed master overlay input receipt is incomplete: ${JSON.stringify(recorded)}`,
    );
  }
  if (!recorded.accepted) {
    throw new Error(
      `typed master overlay input receipt is incomplete: ${JSON.stringify(recorded)}`,
    );
  }
  return { accepted: recorded.accepted, request: recorded.request };
}

function assertTypedMasterRequest(request, workspaceId, recorded) {
  const input = request.input;
  if (
    input.source !== "shell" ||
    input.modality !== "text" ||
    input.focusedWorkspaceId !== workspaceId
  ) {
    throw new Error(`typed master overlay request drifted: ${JSON.stringify(recorded)}`);
  }
}

export async function readJsonLinesWhileAppending(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const events = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    try {
      events.push(JSON.parse(line));
    } catch {
      break;
    }
  }
  return events;
}
