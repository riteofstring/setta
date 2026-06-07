#!/usr/bin/env node
/* global console */

import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const terminalProfileWorkflowTimeoutMs = 25_000;
const profileName = "E2E Home Shell";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/terminal-profile-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("terminal-profile-workflow");
await writeLatestRecordingPointer("terminal-profile-workflow", artifactDir);
const fixture = await createElectronFixture("terminal-profile-workflow");
const expectedHome = await realpath(process.env.HOME || homedir());
let context = null;
let createdProfile;
let terminalState;

try {
  context = await launchElectronCdpContext({
    artifactDir: join(artifactDir, "first-run"),
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="niri-workspace-area"]');
  await ensureWorkspaceOpen(context.client);
  await openSettingsPanel(context.client);
  createdProfile = await createHomeProfileThroughSettings(context.client);
  await captureScreenshot(context.client, join(artifactDir, "settings-profile-created.png"));
  await stopElectronCdpContext(context);
  context = null;

  context = await launchElectronCdpContext({
    artifactDir: join(artifactDir, "second-run"),
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="niri-workspace-area"]');
  await ensureWorkspaceOpen(context.client);
  terminalState = await waitForTerminalProfile(context.client, createdProfile.id, expectedHome);
  await assertProfilePersisted(fixture.appDataDir, createdProfile.id);
  await captureScreenshot(context.client, join(artifactDir, "terminal-profile-default.png"));
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      profiles: await readProfilesFromRenderer(context.client).catch(() => null),
      terminal: await context.client.evaluate(terminalSnapshotExpression()).catch(() => null),
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
}

await writeJson(join(artifactDir, "summary.json"), {
  artifactDir,
  profileId: createdProfile?.id ?? "",
  status: "passed",
  terminalProfileId: terminalState?.profileId ?? "",
  workspaceName: basename(fixture.workspaceRoot),
});
console.log(`Electron terminal profile workflow passed: ${artifactDir}`);

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && !currentWorkspaceId.endsWith(":empty")) {
    return;
  }
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open project folder"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-open-project-folder-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-open-project-folder-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!opened.ok) {
    throw new Error(`workspace open failed: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && !workspaceId.endsWith(":empty"),
    terminalProfileWorkflowTimeoutMs,
  );
}

async function openSettingsPanel(client) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open settings"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-settings-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!opened.ok) {
    throw new Error(`settings open failed: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    `(() => {
      const tab = document.querySelector("#settings-subtab-terminal-profiles");
      return { ready: tab instanceof HTMLButtonElement };
    })()`,
    (value) => value.ready,
    terminalProfileWorkflowTimeoutMs,
  );
  await client.evaluate(`(() => {
    const tab = document.querySelector("#settings-subtab-terminal-profiles");
    if (!(tab instanceof HTMLButtonElement)) {
      throw new Error("missing terminal profiles tab");
    }
    tab.click();
  })()`);
  await waitForSelector(client, '[data-testid="terminal-profiles-panel"]');
  await waitForProfileEditorReady(client);
}

async function createHomeProfileThroughSettings(client) {
  await clickEnabledButton(client, "New profile");
  await waitForState(
    client,
    profileFieldExpression("name"),
    (value) => value === "New profile",
    terminalProfileWorkflowTimeoutMs,
  );
  await client.evaluate(`(() => {
    const panel = terminalProfilesPanel();
    setControl(panel, "name", ${JSON.stringify(profileName)});
    setControl(panel, "launchMode", "shell");
    setControl(panel, "cwdMode", "home");
    setControl(panel, "themeId", "setta-light");
    setControl(panel, "fontSize", "16");
    setControl(panel, "fontFamily", "Menlo");
    setControl(panel, "scrollback", "1800");
    setControl(panel, "args", "");
    setControl(panel, "env", "SETTA_TERMINAL_PROFILE_E2E=1");

    function terminalProfilesPanel() {
      const element = document.querySelector('[data-testid="terminal-profiles-panel"]');
      if (!(element instanceof HTMLElement)) {
        throw new Error("missing terminal profiles panel");
      }
      return element;
    }
    function setControl(panel, field, value) {
      const element = panel.querySelector('[data-terminal-profile-field="' + field + '"]');
      if (
        !(element instanceof HTMLInputElement) &&
        !(element instanceof HTMLSelectElement) &&
        !(element instanceof HTMLTextAreaElement)
      ) {
        throw new Error("missing terminal profile field " + field);
      }
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) {
        throw new Error("missing value setter for " + field);
      }
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  })()`);
  await waitForState(
    client,
    profileFieldsExpression([
      "name",
      "cwdMode",
      "themeId",
      "fontSize",
      "fontFamily",
      "scrollback",
      "env",
    ]),
    (fields) =>
      fields.name === profileName &&
      fields.cwdMode === "home" &&
      fields.themeId === "setta-light" &&
      fields.fontSize === "16" &&
      fields.fontFamily === "Menlo" &&
      fields.scrollback === "1800" &&
      fields.env === "SETTA_TERMINAL_PROFILE_E2E=1",
    terminalProfileWorkflowTimeoutMs,
  );
  await clickEnabledButton(client, "Save profile");
  const saved = await waitForProfileByName(client, profileName);
  await waitForState(
    client,
    profileFieldExpression("profile"),
    (selectedId) => selectedId === saved.id,
    terminalProfileWorkflowTimeoutMs,
  );
  await clickEnabledButton(client, "Make default profile");
  await waitForState(
    client,
    profilesExpression(),
    (profiles) => profiles.defaultProfileId === saved.id,
    terminalProfileWorkflowTimeoutMs,
  );
  return saved;
}

async function waitForProfileEditorReady(client) {
  await waitForState(
    client,
    profileEditorStateExpression(),
    (state) => state.hasNameField && state.newProfileEnabled,
    terminalProfileWorkflowTimeoutMs,
  );
}

async function clickEnabledButton(client, label) {
  const clicked = await client.evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === label,
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-button", label };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-button", label };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`button click failed: ${JSON.stringify(clicked)}`);
  }
}

async function waitForProfileByName(client, name) {
  return waitForState(
    client,
    profilesExpression(),
    (profiles) => profiles.profiles.some((profile) => profile.name === name),
    terminalProfileWorkflowTimeoutMs,
  ).then((profiles) => profiles.profiles.find((profile) => profile.name === name));
}

async function waitForTerminalProfile(client, profileId, expectedCwd) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) =>
      snapshot.exists &&
      snapshot.visible &&
      snapshot.xtermReady &&
      snapshot.sessionId.startsWith("terminal_") &&
      snapshot.profileId === profileId &&
      snapshot.statusText === expectedCwd,
    terminalProfileWorkflowTimeoutMs,
  );
}

async function assertProfilePersisted(appDataDir, profileId) {
  const raw = await readFile(join(appDataDir, "settings", "terminal-profiles.json"), "utf8");
  const state = JSON.parse(raw);
  if (state.defaultProfileId !== profileId) {
    throw new Error(`persisted defaultProfileId = ${state.defaultProfileId}, want ${profileId}`);
  }
  const profile = state.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.name !== profileName || profile.cwdMode !== "home") {
    throw new Error(`persisted profile mismatch: ${JSON.stringify(profile)}`);
  }
}

async function readProfilesFromRenderer(client) {
  return client.evaluate(profilesExpression());
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="niri-workspace-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function profileFieldExpression(field) {
  return `(() => {
    const panel = document.querySelector('[data-testid="terminal-profiles-panel"]');
    const control = panel?.querySelector('[data-terminal-profile-field="${field}"]');
    return control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
      ? control.value
      : "";
  })()`;
}

function profileFieldsExpression(fields) {
  return `(() => {
    const panel = document.querySelector('[data-testid="terminal-profiles-panel"]');
    const values = {};
    for (const field of ${JSON.stringify(fields)}) {
      const control = panel?.querySelector('[data-terminal-profile-field="' + field + '"]');
      values[field] = control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
        ? control.value
        : "";
    }
    return values;
  })()`;
}

function profileEditorStateExpression() {
  return `(() => {
    const panel = document.querySelector('[data-testid="terminal-profiles-panel"]');
    const name = panel?.querySelector('[data-terminal-profile-field="name"]');
    const newProfileButton = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "New profile",
    );
    return {
      hasNameField: name instanceof HTMLInputElement && name.value !== "",
      newProfileEnabled: newProfileButton instanceof HTMLButtonElement && !newProfileButton.disabled,
    };
  })()`;
}

function profilesExpression() {
  return `(async () => window.setta.terminal.listProfiles())()`;
}

function terminalSnapshotExpression() {
  return `(() => {
    const host = document.querySelector('[data-testid="niri-fake-pane-host"][data-surface-kind="terminal"]');
    if (!(host instanceof HTMLElement)) {
      return emptySnapshot(false);
    }
    const rect = host.getBoundingClientRect();
    return {
      exists: true,
      profileId: host.dataset.terminalProfileId ?? "",
      sessionId: host.dataset.terminalSessionId ?? "",
      statusText: host.querySelector(".niri-terminal-status")?.textContent?.trim() ?? "",
      visible: host.dataset.visible === "true" && rect.width > 0 && rect.height > 0,
      xtermReady: Boolean(host.querySelector(".xterm-helper-textarea")),
    };

    function emptySnapshot(exists) {
      return {
        exists,
        profileId: "",
        sessionId: "",
        statusText: "",
        visible: false,
        xtermReady: false,
      };
    }
  })()`;
}
