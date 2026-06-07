#!/usr/bin/env node
/* global console */

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
const workflowTimeoutMs = 25_000;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1440,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/pane-focus-click-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("pane-focus-click-workflow");
await writeLatestRecordingPointer("pane-focus-click-workflow", artifactDir);
const fixture = await createElectronFixture("pane-focus-click-workflow");
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await ensureWorkspaceOpen(context.client);
  await waitForVisiblePaneHosts(context.client);
  await captureScreenshot(context.client, join(artifactDir, "before.png"));

  const topTarget = await nextRightPaneTarget(context.client);
  await clickAt(context.client, {
    x: topTarget.rect.left + 3,
    y: topTarget.rect.top + 15,
  });
  const topResult = await waitForPaneFocusedInStage(context.client, topTarget);
  await captureScreenshot(context.client, join(artifactDir, "after-top-click.png"));

  const edgeTarget = await nextRightPaneTarget(context.client);
  await clickAt(context.client, await paneChromeEdgeFocusPoint(context.client, edgeTarget));
  const edgeResult = await waitForPaneFocusedInStage(context.client, edgeTarget);
  await captureScreenshot(context.client, join(artifactDir, "after-edge-click.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    edgeResult,
    status: "passed",
    topResult,
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron pane focus click workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      snapshot: await safePaneSnapshot(context.client),
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
    workflowTimeoutMs,
  );
}

async function waitForVisiblePaneHosts(client) {
  await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => snapshot.visibleHosts.length >= 3,
    workflowTimeoutMs,
  );
}

async function nextRightPaneTarget(client) {
  const snapshot = await waitForState(
    client,
    paneSnapshotExpression(),
    (value) =>
      value.visibleHosts.some(
        (host) =>
          host.paneId !== value.focusedPaneId &&
          host.rect.left > value.stageRect.left + 80 &&
          host.rect.left < value.stageRect.left + value.stageRect.width - 24,
      ),
    workflowTimeoutMs,
  );
  const target = snapshot.visibleHosts
    .filter((host) => host.paneId !== snapshot.focusedPaneId)
    .filter(
      (host) =>
        host.rect.left > snapshot.stageRect.left + 80 &&
        host.rect.left < snapshot.stageRect.left + snapshot.stageRect.width - 24,
    )
    .sort((left, right) => left.rect.left - right.rect.left)
    .at(0);
  if (!target) {
    throw new Error(`no right-side pane target found: ${JSON.stringify(snapshot)}`);
  }
  return target;
}

async function waitForPaneFocusedInStage(client, target) {
  return waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => {
      const host = snapshot.visibleHosts.find((candidate) => candidate.paneId === target.paneId);
      if (!host) {
        return false;
      }
      const hostRight = host.rect.left + host.rect.width;
      return (
        snapshot.focusedPaneId === target.paneId &&
        host.focused &&
        hostRight >= snapshot.stageRect.left &&
        host.rect.left <= snapshot.stageRect.left + snapshot.stageRect.width
      );
    },
    workflowTimeoutMs,
  );
}

async function clickAt(client, { x, y }) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x,
    y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x,
    y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x,
    y,
  });
}

async function paneChromeEdgeFocusPoint(client, target) {
  const point = await client.driver("paneChromeEdgeFocusPoint", { paneId: target.paneId });
  if (!point.ok) {
    throw new Error(`no pane chrome edge focus point found: ${JSON.stringify({ point, target })}`);
  }
  return point;
}

async function safePaneSnapshot(client) {
  try {
    return await client.evaluate(paneSnapshotExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function paneSnapshotExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    const stageRect = stage instanceof HTMLElement
      ? stage.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0 };
    const visibleHosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.visible === "true")
      .map((host) => {
        const rect = host.getBoundingClientRect();
        return {
          focused: host.dataset.focused === "true",
          paneId: host.dataset.paneId ?? "",
          rect: {
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          },
        };
      });
    return {
      focusedPaneId: visibleHosts.find((host) => host.focused)?.paneId ?? "",
      mode: area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "",
      stageRect: {
        height: stageRect.height,
        left: stageRect.left,
        top: stageRect.top,
        width: stageRect.width,
      },
      visibleHosts,
      workspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "",
    };
  })()`;
}
