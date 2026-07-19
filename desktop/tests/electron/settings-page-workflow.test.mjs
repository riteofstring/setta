#!/usr/bin/env node
/* global AbortSignal, console, fetch, setTimeout, URL */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  dispatchKeyEvent,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  repoRoot,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;
const desktopViewport = { deviceScaleFactor: 1, height: 900, mobile: false, width: 1440 };
const mobileViewport = { deviceScaleFactor: 1, height: 700, mobile: false, width: 390 };

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/settings-page-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("settings-page-workflow");
await writeLatestRecordingPointer("settings-page-workflow", artifactDir);
const fixture = await createElectronFixture("settings-page-workflow");
let context = null;
let remoteRoot = "";
let remoteServe = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    fixture,
    visible: options.visible,
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", desktopViewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const emptyBeforeOpen = await waitForEmptyWorkspace(context.client);
  await clickDesktopSettingsButton(context.client);
  const noWorkspaceSettings = await waitForSettingsPageWithoutWorkspace(context.client);
  await captureScreenshot(context.client, join(artifactDir, "no-workspace-settings-open.png"));
  await clickBackToWorkspace(context.client);
  await waitForEmptyWorkspaceRestored(context.client, emptyBeforeOpen);

  const workspaceId = await ensureWorkspaceOpen(context.client);

  await persistAppPaneLayoutWithoutSettings(context.client);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const beforeOpen = await waitForLayoutWithoutSettings(context.client, workspaceId);
  const savedLayoutBeforeOpen = await readPersistedAppPaneLayout(context.client);
  await captureScreenshot(context.client, join(artifactDir, "before-settings-open.png"));

  await clickDesktopSettingsButton(context.client);
  const afterOpen = await waitForSettingsPage(context.client, beforeOpen);
  const savedLayoutWhileOpen = await assertPersistedAppPaneLayoutUnchanged(
    context.client,
    savedLayoutBeforeOpen,
    "desktop Settings open",
  );
  const shortcutWhileHidden = await assertWorkspaceShortcutsSuppressed(context.client, beforeOpen);
  await captureScreenshot(context.client, join(artifactDir, "after-settings-open.png"));

  await clickBackToWorkspace(context.client);
  const afterBack = await waitForWorkspaceRestored(context.client, beforeOpen);
  const savedLayoutAfterBack = await assertPersistedAppPaneLayoutUnchanged(
    context.client,
    savedLayoutBeforeOpen,
    "desktop Settings return",
  );
  await captureScreenshot(context.client, join(artifactDir, "after-settings-back.png"));

  const targetedVoiceSettings = await openShellVoiceCredentialSettings(context.client, afterBack);
  await captureScreenshot(context.client, join(artifactDir, "voice-settings-open.png"));
  await clickBackToWorkspace(context.client);
  const afterVoiceSettingsBack = await waitForWorkspaceRestored(context.client, afterBack);

  await context.client.call("Emulation.setDeviceMetricsOverride", mobileViewport);
  const mobileBeforeOpen = await waitForMobileWorkspace(context.client, afterVoiceSettingsBack);
  await clickMobileSettingsButton(context.client);
  const mobileSettings = await waitForSettingsPage(context.client, mobileBeforeOpen);
  await captureScreenshot(context.client, join(artifactDir, "mobile-settings-open.png"));
  await clickBackToWorkspace(context.client);
  const afterMobileSettingsBack = await waitForWorkspaceRestored(context.client, mobileBeforeOpen);

  await openMobileProjectPane(context.client);
  const mobileProjectPaneOpen = await waitForMobileProjectPaneOpen(
    context.client,
    afterMobileSettingsBack,
  );
  await clickMobileProjectSettingsButton(context.client);
  const mobileProjectSettings = await waitForSettingsPage(context.client, mobileProjectPaneOpen);
  await captureScreenshot(context.client, join(artifactDir, "mobile-project-settings-open.png"));
  await clickBackToWorkspace(context.client);
  const afterMobileProjectSettingsBack = await waitForWorkspaceRestored(
    context.client,
    mobileProjectPaneOpen,
  );

  await context.client.call("Emulation.setDeviceMetricsOverride", desktopViewport);
  const desktopAfterMobile = await waitForDesktopWorkspace(
    context.client,
    afterMobileProjectSettingsBack,
  );

  await openBrowserPane(context.client);
  const browserOpened = await waitForBrowserPane(context.client, workspaceId, desktopAfterMobile);
  const nativeBrowserVisible = await waitForNativeBrowserVisible(context.client, browserOpened);
  await clickDesktopSettingsButton(context.client);
  const browserSettingsOpen = await waitForSettingsPage(context.client, browserOpened);
  assertNativeBrowserOccluded(browserSettingsOpen);
  await captureScreenshot(context.client, join(artifactDir, "browser-settings-open.png"));
  await clickBackToWorkspace(context.client);
  const afterBrowserSettingsBack = await waitForWorkspaceRestored(context.client, browserOpened);
  const nativeBrowserRestored = await waitForNativeBrowserVisible(
    context.client,
    afterBrowserSettingsBack,
  );

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const browserRestored = await waitForBrowserLayoutRestored(context.client, browserOpened);
  await captureScreenshot(context.client, join(artifactDir, "browser-restored.png"));

  remoteRoot = await mkdtemp(join(tmpdir(), "setta-settings-page-remote-"));
  remoteServe = await startRemoteRuntime(join(remoteRoot, "app-data"));
  const localRuntime = await activeRuntime(context.client);
  const remoteConnected = await addRuntimeThroughPicker(context.client, remoteServe.pairingURL);
  await clickEnabledButtonByAria(context.client, `Switch to ${localRuntime.displayName}`);
  await waitForRuntimeStatus(context.client, "connected", { runtimeId: localRuntime.runtimeId });
  await stopProcess(remoteServe.child);
  await waitForRemoteRuntimeStopped(remoteConnected.baseUrl);
  remoteServe = null;
  await clickEnabledButtonByAria(context.client, `Switch to ${remoteConnected.displayName}`);
  const unavailableRuntime = await waitForRuntimeStatus(context.client, "unreachable", {
    runtimeId: remoteConnected.runtimeId,
  });
  await clickDesktopSettingsButton(context.client);
  const unavailableRuntimeSettings = await waitForSettingsPageWithRuntimeStatus(
    context.client,
    "unreachable",
  );
  await captureScreenshot(
    context.client,
    join(artifactDir, "unavailable-runtime-settings-open.png"),
  );
  await clickBackToWorkspace(context.client);

  await writeJson(join(artifactDir, "summary.json"), {
    afterOpen,
    afterBack,
    afterBrowserSettingsBack,
    afterMobileProjectSettingsBack,
    afterMobileSettingsBack,
    afterVoiceSettingsBack,
    artifactDir,
    beforeOpen,
    browserOpened,
    browserRestored,
    browserSettingsOpen,
    desktopAfterMobile,
    mobileProjectPaneOpen,
    mobileProjectSettings,
    mobileSettings,
    nativeBrowserRestored,
    nativeBrowserVisible,
    noWorkspaceSettings,
    savedLayoutAfterBack,
    savedLayoutBeforeOpen,
    savedLayoutWhileOpen,
    shortcutWhileHidden,
    targetedVoiceSettings,
    status: "passed",
    unavailableRuntime,
    unavailableRuntimeSettings,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron settings page workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      state: await safeSettingsState(context.client),
    }).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
  if (remoteServe) {
    await stopProcess(remoteServe.child);
  }
  if (remoteRoot) {
    await rm(remoteRoot, { force: true, recursive: true }).catch(() => {});
  }
}

async function waitForEmptyWorkspace(client) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.emptyWorkspaceVisible &&
      state.workspaceId === "" &&
      state.paneCount === 0 &&
      !state.settingsPageOpen &&
      !state.workspaceShellHidden,
    workflowTimeoutMs,
  );
}

async function waitForSettingsPageWithoutWorkspace(client) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.emptyWorkspaceVisible &&
      state.workspaceId === "" &&
      state.paneCount === 0 &&
      state.settingsPageOpen &&
      state.settingsPanelReady &&
      state.settingsPageCoversViewport &&
      state.settingsPageRole === "" &&
      state.workspaceShellHidden &&
      state.workspaceShellInert,
    workflowTimeoutMs,
  );
}

async function waitForEmptyWorkspaceRestored(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.workspaceId === beforeOpen.workspaceId &&
      state.paneCount === beforeOpen.paneCount &&
      state.emptyWorkspaceVisible &&
      !state.settingsPageOpen &&
      !state.settingsPanelReady &&
      !state.workspaceShellHidden &&
      !state.workspaceShellInert,
    workflowTimeoutMs,
  );
}

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = (await client.driver("settingsPageState")).workspaceId;
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return currentWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  const opened = await waitForState(
    client,
    settingsPageStateExpression(),
    (state) => state.workspaceId !== "" && state.workspaceId !== "empty",
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

async function persistAppPaneLayoutWithoutSettings(client) {
  const result = await client.evaluate(`(async () => {
    await window.setta.appLayout.savePaneLayout(${JSON.stringify(appPaneLayoutWithoutSettings())});
    return true;
  })()`);
  if (!result) {
    throw new Error("app pane layout was not persisted");
  }
}

async function readPersistedAppPaneLayout(client) {
  return client.evaluate(`(async () => {
    const result = await window.setta.appLayout.readPaneLayout();
    return result.layout;
  })()`);
}

async function assertPersistedAppPaneLayoutUnchanged(client, expectedLayout, label) {
  const actual = await readPersistedAppPaneLayout(client);
  if (JSON.stringify(actual) !== JSON.stringify(expectedLayout)) {
    throw new Error(
      `${label} changed persisted app pane layout: ${JSON.stringify({ actual, expectedLayout })}`,
    );
  }
  return actual;
}

async function waitForLayoutWithoutSettings(client, workspaceId) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.workspaceId === workspaceId &&
      state.paneCount === 3 &&
      state.paneIds.length === 3 &&
      countSurfaceKind(state, "easy-button") === 1 &&
      countSurfaceKind(state, "empty-frame") === 2 &&
      state.presentationMode === "normal" &&
      !state.settingsPageOpen &&
      !state.settingsPanelReady,
    workflowTimeoutMs,
  );
}

async function clickDesktopSettingsButton(client) {
  const result = await client.driver("settingsPageClickDesktopSettingsButton");
  if (!result.clicked) {
    throw new Error(`desktop Settings button was not clickable: ${JSON.stringify(result)}`);
  }
}

async function clickMobileSettingsButton(client) {
  const result = await client.driver("settingsPageClickMobileSettingsButton");
  if (!result.clicked) {
    throw new Error(`mobile Settings button was not clickable: ${JSON.stringify(result)}`);
  }
}

async function clickMobileProjectSettingsButton(client) {
  const result = await client.driver("settingsPageClickMobileProjectSettingsButton");
  if (!result.clicked) {
    throw new Error(`mobile project Settings button was not clickable: ${JSON.stringify(result)}`);
  }
}

async function waitForSettingsPage(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) => sameWorkspaceLayout(state, beforeOpen) && settingsPageVisible(state),
    workflowTimeoutMs,
  );
}

async function assertWorkspaceShortcutsSuppressed(client, beforeOpen) {
  await dispatchWorkspaceShortcut(client, { code: "KeyN", key: "n" });
  await dispatchWorkspaceShortcut(client, { code: "KeyO", key: "o" });
  await sleep(250);
  const state = await client.driver("settingsPageState");
  if (!sameWorkspaceLayout(state, beforeOpen) || !settingsPageVisible(state)) {
    throw new Error(`hidden workspace shortcut mutated Settings state: ${JSON.stringify(state)}`);
  }
  return state;
}

async function dispatchWorkspaceShortcut(client, { code, key }) {
  await dispatchKeyEvent(client, { code, key, modifiers: 4 });
  await dispatchKeyEvent(client, { code, key, modifiers: 4, type: "keyUp" });
}

async function openShellVoiceCredentialSettings(client, beforeOpen) {
  const click = await client.driver("settingsPageClickShellVoiceSetup");
  if (!click.clicked) {
    throw new Error(`shell voice setup was not clickable: ${JSON.stringify(click)}`);
  }
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      sameWorkspaceLayout(state, beforeOpen) &&
      settingsPageVisible(state) &&
      state.activeSettingsSubtab === "speech" &&
      state.voiceProviderCardVisible &&
      state.voiceProviderCardFocused,
    workflowTimeoutMs,
  );
}

async function waitForMobileWorkspace(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      sameWorkspaceLayout(state, beforeOpen) &&
      state.compactLayout === "true" &&
      state.mobileBarVisible &&
      !state.shellTopBarVisible &&
      !state.mobileProjectPaneVisible &&
      !state.settingsPageOpen,
    workflowTimeoutMs,
  );
}

async function openMobileProjectPane(client) {
  const result = await client.driver("settingsPageClickMobileProjectToggle");
  if (!result.clicked) {
    throw new Error(`mobile project pane toggle was not clickable: ${JSON.stringify(result)}`);
  }
}

async function waitForMobileProjectPaneOpen(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      sameWorkspaceLayout(state, beforeOpen) &&
      state.compactLayout === "true" &&
      state.mobileBarVisible &&
      state.mobileProjectPaneVisible &&
      !state.settingsPageOpen,
    workflowTimeoutMs,
  );
}

async function waitForDesktopWorkspace(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      sameWorkspaceLayout(state, beforeOpen) &&
      state.compactLayout === "false" &&
      state.shellTopBarVisible &&
      !state.mobileBarVisible &&
      !state.mobileProjectPaneVisible &&
      !state.settingsPageOpen,
    workflowTimeoutMs,
  );
}

async function clickBackToWorkspace(client) {
  const result = await client.driver("settingsPageClickBack");
  if (!result.clicked) {
    throw new Error("Back to workspace button was not clickable");
  }
}

async function waitForWorkspaceRestored(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) => workspaceRestored(state, beforeOpen),
    workflowTimeoutMs,
  );
}

function workspaceRestored(state, beforeOpen) {
  return (
    sameWorkspaceLayout(state, beforeOpen) &&
    sameMobileShellState(state, beforeOpen) &&
    settingsPageClosed(state) &&
    !state.nativeViewOverlayActive
  );
}

function sameMobileShellState(state, expected) {
  return (
    state.mobileBarVisible === expected.mobileBarVisible &&
    state.mobileProjectPaneVisible === expected.mobileProjectPaneVisible
  );
}

function settingsPageClosed(state) {
  return (
    !state.settingsPageOpen &&
    !state.settingsPanelReady &&
    !state.workspaceShellHidden &&
    !state.workspaceShellInert
  );
}

async function openBrowserPane(client) {
  await clickEnabledButtonByAria(client, "New frame", workflowTimeoutMs);
  await waitForState(
    client,
    driverCallExpression("settingsPageOpenBrowserPane"),
    (result) => result.clicked,
    workflowTimeoutMs,
  );
}

async function waitForBrowserPane(client, workspaceId, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) => browserPaneAdded(state, workspaceId, beforeOpen),
    workflowTimeoutMs,
  );
}

async function waitForBrowserLayoutRestored(client, expected) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.workspaceId === expected.workspaceId &&
      state.paneCount === expected.paneCount &&
      sameUnorderedList(state.paneIds, expected.paneIds) &&
      countSurfaceKind(state, "browser") === countSurfaceKind(expected, "browser") &&
      state.browserVisible &&
      !state.layoutRecoveryVisible,
    workflowTimeoutMs,
  );
}

async function waitForNativeBrowserVisible(client, expected) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      sameWorkspaceLayout(state, expected) &&
      state.browserVisible &&
      state.nativeViewStats?.visibleBrowserPanes >= 1 &&
      state.nativeViewStats?.registered >= 1 &&
      state.nativeViewStats?.live >= 1,
    workflowTimeoutMs,
  );
}

function assertNativeBrowserOccluded(state) {
  if (
    state.nativeViewStats?.registered < 1 ||
    state.nativeViewStats?.visibleBrowserPanes !== 0 ||
    state.nativeViewStats?.live !== 0 ||
    state.nativeViewStats?.hidden < 1
  ) {
    throw new Error(`Browser native view was not occluded by Settings: ${JSON.stringify(state)}`);
  }
}

async function waitForSettingsPageWithRuntimeStatus(client, status) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.runtimeConnectionStatus === status &&
      state.workspaceId === "" &&
      state.paneCount === 0 &&
      settingsPageVisible(state),
    workflowTimeoutMs,
  );
}

async function addRuntimeThroughPicker(client, pairingURL) {
  await clickEnabledButtonByAria(client, "Add runtime", workflowTimeoutMs);
  await waitForState(
    client,
    `(() => ({ ready: Boolean(document.querySelector('input[aria-label="Runtime pairing URL"]')) }))()`,
    (value) => value.ready,
    workflowTimeoutMs,
  );
  await setInputValue(client, 'input[aria-label="Runtime pairing URL"]', pairingURL);
  const submitted = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="runtime-picker"] form button[type="submit"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!submitted) {
    throw new Error("runtime pairing form submit button was not clickable");
  }
  const snapshot = await waitForRuntimeStatus(client, "connected", { isLocal: false });
  const active = snapshot.runtimes.find((runtime) => runtime.active && !runtime.isLocal);
  if (!active) {
    throw new Error(`remote runtime did not become active: ${JSON.stringify(snapshot)}`);
  }
  return active;
}

async function activeRuntime(client) {
  const snapshot = await runtimeSnapshot(client);
  const active = snapshot.runtimes.find((runtime) => runtime.active);
  if (!active) {
    throw new Error(`active runtime missing: ${JSON.stringify(snapshot)}`);
  }
  return active;
}

async function waitForRuntimeStatus(client, status, filter = {}) {
  return waitForState(
    client,
    `(async () => window.setta.runtimes.current())()`,
    (snapshot) => {
      if (snapshot.switching || snapshot.connection.status !== status) {
        return false;
      }
      if (filter.runtimeId && snapshot.connection.runtimeId !== filter.runtimeId) {
        return false;
      }
      if (filter.isLocal !== undefined) {
        const active = snapshot.runtimes.find((runtime) => runtime.active);
        return active?.isLocal === filter.isLocal;
      }
      return true;
    },
    workflowTimeoutMs,
  );
}

async function runtimeSnapshot(client) {
  return client.evaluate(`(async () => window.setta.runtimes.current())()`);
}

async function setInputValue(client, selector, value) {
  const changed = await client.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!changed) {
    throw new Error(`input was not editable: ${selector}`);
  }
  await waitForState(
    client,
    `(() => document.querySelector(${JSON.stringify(selector)})?.value ?? "")()`,
    (currentValue) => currentValue === value,
    workflowTimeoutMs,
  );
}

async function startRemoteRuntime(appDataDir) {
  await mkdir(appDataDir, { recursive: true });
  const child = spawn(
    join(repoRoot, "scripts/go.sh"),
    ["run", "./cmd/setta", "serve", "--app-data-dir", appDataDir, "--port", "0"],
    {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        SETTA_E2E: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.logs = [];
  child.stdout.on("data", (data) => appendProcessLog(child, data));
  child.stderr.on("data", (data) => appendProcessLog(child, data));
  const pairingURL = await waitForPairingURL(child);
  return { child, pairingURL };
}

function appendProcessLog(child, data) {
  const text = data.toString();
  child.logs.push(text);
  if (child.logs.length > 200) {
    child.logs.splice(0, child.logs.length - 200);
  }
}

async function waitForPairingURL(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const output = child.logs.join("");
    const match = output.match(/setta:\/\/pair\?[^\s]+/);
    if (match) {
      return match[0];
    }
    if (child.exitCode !== null) {
      throw new Error(`remote setta serve exited before pairing URL:\n${output}`);
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for remote pairing URL:\n${child.logs.join("")}`);
}

async function waitForRemoteRuntimeStopped(baseUrl) {
  const runtimeInfoURL = new URL("runtime/info", baseUrl).toString();
  const startedAt = Date.now();
  let lastProbe = null;
  while (Date.now() - startedAt < workflowTimeoutMs) {
    lastProbe = await probeRuntimeInfo(runtimeInfoURL);
    if (!lastProbe.reachable) {
      return;
    }
    await sleep(100);
  }
  throw new Error(
    `remote runtime still answered ${runtimeInfoURL} after stop: ${JSON.stringify(lastProbe)}`,
  );
}

async function probeRuntimeInfo(runtimeInfoURL) {
  try {
    const response = await fetch(runtimeInfoURL, {
      method: "GET",
      signal: AbortSignal.timeout(1_000),
    });
    const body = await response.text();
    return {
      body: body.slice(0, 500),
      reachable: true,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      reachable: false,
    };
  }
}

async function stopProcess(child) {
  if (!child) {
    return;
  }
  const exited = new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    child.once("close", resolvePromise);
  });
  signalProcessGroup(child, "SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), sleep(8_000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    signalProcessGroup(child, "SIGKILL");
    await Promise.race([exited, sleep(3_000)]);
  }
}

function signalProcessGroup(child, signal) {
  if (child.pid === undefined) {
    return false;
  }
  if (process.platform === "win32") {
    child.kill(signal);
    return true;
  }
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch {
    child.kill(signal);
    return false;
  }
}

async function safeSettingsState(client) {
  try {
    return await client.driver("settingsPageState");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function settingsPageStateExpression() {
  return driverCallExpression("settingsPageState");
}

function sameList(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameUnorderedList(left, right) {
  return (
    Array.isArray(left) && Array.isArray(right) && sameList([...left].sort(), [...right].sort())
  );
}

function sameWorkspaceLayout(state, expected) {
  return (
    state.workspaceId === expected.workspaceId &&
    state.paneCount === expected.paneCount &&
    sameList(state.paneIds, expected.paneIds) &&
    state.focusedPaneId === expected.focusedPaneId &&
    state.maximizedPaneId === expected.maximizedPaneId &&
    state.presentationMode === expected.presentationMode
  );
}

function settingsPageVisible(state) {
  return settingsPageChromeVisible(state) && settingsPageOccludesNativeViews(state);
}

function settingsPageChromeVisible(state) {
  return (
    state.settingsPageOpen &&
    state.settingsPanelReady &&
    state.settingsBackVisible &&
    state.settingsPageCoversViewport &&
    state.settingsPageRole === "" &&
    state.workspaceShellHidden &&
    state.workspaceShellInert
  );
}

function settingsPageOccludesNativeViews(state) {
  if (!state.browserVisible && !state.nativeViewStats?.registered) {
    return true;
  }
  return state.nativeViewOverlayActive;
}

function browserPaneAdded(state, workspaceId, beforeOpen) {
  return (
    state.workspaceId === workspaceId &&
    countSurfaceKind(state, "browser") > countSurfaceKind(beforeOpen, "browser") &&
    state.browserVisible &&
    !state.layoutRecoveryVisible
  );
}

function countSurfaceKind(state, surfaceKind) {
  return Array.isArray(state.surfaceKinds)
    ? state.surfaceKinds.filter((kind) => kind === surfaceKind).length
    : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appPaneLayoutWithoutSettings() {
  return {
    columns: [
      storedColumn("app_column_master", 0, ["app_pane_master"]),
      storedColumn("workspace_column_0", 1, ["workspace_pane_0"]),
      storedColumn("workspace_column_1", 2, ["workspace_pane_1"]),
    ],
    focusedPaneId: "workspace_pane_0",
    maximizedPaneId: null,
    panes: [
      {
        columnId: "app_column_master",
        conversationConfig: null,
        heat: 0,
        masterConfig: {},
        paneId: "app_pane_master",
        sequence: 0,
        subtitle: "Global coordinator",
        surfaceId: "app_surface_master",
        surfaceKind: "master",
        title: "Setta",
        tone: "slate",
        weight: 1,
      },
      storedPane({
        columnId: "workspace_column_0",
        paneId: "workspace_pane_0",
        sequence: 0,
        subtitle: "empty workspace pane",
        surfaceId: "workspace_surface_0",
        surfaceKind: "empty-frame",
        title: "Empty Frame 1",
        tone: "cyan",
        weight: 1.6,
      }),
      storedPane({
        columnId: "workspace_column_1",
        paneId: "workspace_pane_1",
        sequence: 1,
        subtitle: "empty workspace pane",
        surfaceId: "workspace_surface_1",
        surfaceKind: "empty-frame",
        title: "Empty Frame 2",
        tone: "green",
        weight: 1,
      }),
    ],
    schemaVersion: 1,
  };
}

function storedColumn(columnId, index, paneIds) {
  return {
    columnId,
    idealWidthSpec: { unit: "px", value: 520 },
    index,
    paneIds,
    planeIndex: 0,
    previousProportionWidth: null,
    slotIndex: index,
    widthSpec: { unit: "px", value: 520 },
  };
}

function storedPane(pane) {
  return {
    ...pane,
    conversationConfig: null,
    heat: (pane.sequence * 37) % 100,
    masterConfig: null,
  };
}
