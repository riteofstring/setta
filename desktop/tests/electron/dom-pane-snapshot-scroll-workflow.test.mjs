#!/usr/bin/env node
/* global console */

import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  repoRoot,
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
    "Usage: node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("dom-pane-snapshot-scroll");
await writeLatestRecordingPointer("dom-pane-snapshot-scroll", artifactDir);
const fixture = await createElectronFixture("dom-pane-snapshot-scroll");
seedShowcaseFixture(fixture);

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
  await waitForState(
    context.client,
    bodyTextExpression(),
    (text) => text.includes("UI Showcase Chat"),
    workflowTimeoutMs,
  );
  await clickShowcaseConversation(context.client);
  await waitForState(
    context.client,
    bodyTextExpression(),
    (text) => text.includes("User input approval") && text.includes("cancelled"),
    workflowTimeoutMs,
  );

  const liveScroller = await waitForState(
    context.client,
    liveScrollerExpression(),
    (value) => value.ready && value.atBottom,
    workflowTimeoutMs,
  );
  await captureScreenshot(context.client, join(artifactDir, "normal.png"));

  await clickEnterOverview(context.client);
  const overviewSnapshot = await waitForState(
    context.client,
    overviewSnapshotExpression(liveScroller.paneId),
    (value) => overviewSnapshotReady(value, liveScroller.scrollTop),
    workflowTimeoutMs,
  );
  await delay(400);
  await captureScreenshot(context.client, join(artifactDir, "overview.png"));
  const sidebarSnapshots = await toggleProjectSidebarInOverview(
    context.client,
    liveScroller.paneId,
    overviewSnapshot,
  );
  await captureScreenshot(context.client, join(artifactDir, "overview-after-sidebar-toggle.png"));

  await clickExitOverview(context.client);
  const restoreSamples = await sampleLiveScrollerAfterExit(context.client, liveScroller.paneId);
  assertNoLiveScrollReplay(restoreSamples, liveScroller.scrollTop);
  await captureScreenshot(context.client, join(artifactDir, "normal-after.png"));

  const summary = {
    artifactDir,
    liveScroller,
    overviewSnapshot,
    restoreSamples,
    sidebarSnapshots,
    status: "passed",
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  console.log(`Electron DOM pane snapshot scroll workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      snapshot: await safeSnapshot(context.client),
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

function seedShowcaseFixture(showcaseFixture) {
  const result = spawnSync(
    "./scripts/go.sh",
    [
      "run",
      "./cmd/seed-chat-showcase",
      "--app-data-dir",
      showcaseFixture.appDataDir,
      "--workspace-path",
      showcaseFixture.workspaceRoot,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`seed chat showcase failed: ${result.stdout}\n${result.stderr}`);
  }
}

async function clickShowcaseConversation(client) {
  const clicked = await client.evaluate(`(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], a'));
    const target = candidates.find((element) =>
      (element.textContent || '').includes('UI Showcase Chat')
    );
    if (!target) {
      return { ok: false, reason: "missing-conversation" };
    }
    target.click();
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`showcase conversation click failed: ${JSON.stringify(clicked)}`);
  }
}

async function clickEnterOverview(client) {
  await clickOverviewButton(client, "Enter overview");
}

async function clickExitOverview(client) {
  await clickOverviewButton(client, "Exit overview");
}

async function toggleProjectSidebarInOverview(client, paneId, baselineSnapshot) {
  const afterFirstToggle = await toggleProjectSidebarAndWaitForStableSnapshot(
    client,
    paneId,
    baselineSnapshot,
  );
  const afterSecondToggle = await toggleProjectSidebarAndWaitForStableSnapshot(
    client,
    paneId,
    baselineSnapshot,
  );
  return { afterFirstToggle, afterSecondToggle };
}

async function toggleProjectSidebarAndWaitForStableSnapshot(client, paneId, baselineSnapshot) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="project-sidebar-toggle"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-project-sidebar-toggle" };
    }
    const label = button.getAttribute("aria-label") ?? "";
    button.click();
    return { label, ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`project sidebar toggle failed: ${JSON.stringify(clicked)}`);
  }
  return waitForState(
    client,
    overviewSnapshotExpression(paneId),
    (value) => overviewSnapshotStableAfterSidebar(value, baselineSnapshot.scrollTop),
    workflowTimeoutMs,
  );
}

async function clickOverviewButton(client, label) {
  const clicked = await client.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
      candidate.getAttribute('aria-label') === ${JSON.stringify(label)}
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-overview-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`${label} click failed: ${JSON.stringify(clicked)}`);
  }
}

function bodyTextExpression() {
  return `(() => document.body.textContent ?? "")()`;
}

function liveScrollerExpression() {
  return `(() => {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (!(scroller instanceof HTMLElement)) {
      return { ready: false, reason: "missing-scroller" };
    }
    const host = scroller.closest('.workspace-pane-host');
    const distanceFromBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    return {
      atBottom: Math.abs(distanceFromBottom) <= 1,
      clientHeight: scroller.clientHeight,
      distanceFromBottom,
      paneId: host instanceof HTMLElement ? host.dataset.paneId ?? "" : "",
      ready: scroller.scrollTop > 0,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      text: scroller.textContent?.slice(0, 300) ?? "",
    };
  })()`;
}

function overviewSnapshotExpression(paneId) {
  return `(() => {
    const hosts = Array.from(
      document.querySelectorAll('.workspace-pane-host[data-presentation-mode="overview"]')
    );
    const chatHost = hosts.find((host) => host.dataset.paneId === ${JSON.stringify(paneId)});
    const chatRect = chatHost instanceof HTMLElement ? chatHost.getBoundingClientRect() : null;
    const chatContent =
      chatHost instanceof HTMLElement
        ? Array.from(chatHost.children).find((child) =>
            child.classList.contains("workspace-react-dom-surface") ||
            child.classList.contains("workspace-pane-content")
          )
        : null;
    const frozenVisual =
      chatHost instanceof HTMLElement
        ? Array.from(chatHost.children).find((child) =>
            child.classList.contains("workspace-frozen-dom-visual")
          )
        : null;
    const frozenScroller = frozenVisual?.querySelector('[data-testid="chat-transcript-scroller"]');
    const frozenScrollerStyle =
      frozenScroller instanceof HTMLElement ? getComputedStyle(frozenScroller) : null;
    const centerTarget =
      chatRect && chatRect.width > 2 && chatRect.height > 2
        ? document.elementFromPoint(
            chatRect.left + Math.floor(chatRect.width / 2),
            chatRect.top + Math.floor(chatRect.height / 2)
          )
        : null;
    const scroller = chatHost?.querySelector('[data-testid="chat-transcript-scroller"]');
    const bitmapTexture = chatHost?.querySelector('.workspace-snapshot-bitmap-texture');
    const bitmapImage = bitmapTexture?.querySelector('.workspace-snapshot-bitmap');
    const snapshotContent = chatHost?.querySelector('.workspace-snapshot-surface');
    const texture = snapshotContent?.querySelector('.workspace-snapshot-texture');
    const source = texture?.firstElementChild;
    const settingsHost = hosts.find((host) =>
      host.dataset.surfaceKind === "settings-dom" ||
      host.querySelector('[data-testid="workspace-settings-dom-surface"]')
    );
    const settingsPlaceholder = settingsHost?.querySelector(
      '[data-testid="workspace-unloaded-surface-placeholder"]'
    );
    const settingsSnapshotTexture = settingsHost?.querySelector(
      '.workspace-snapshot-bitmap, .workspace-snapshot-texture'
    );
    const fallbackSettingsSnapshotHost = hosts.find((host) =>
      host.dataset.paneId !== ${JSON.stringify(paneId)} &&
      host.dataset.surfaceKind === "snapshot" &&
      Boolean(host.querySelector('.workspace-snapshot-surface'))
    );
    return {
      chatHostFound: Boolean(chatHost),
      clientHeight: scroller instanceof HTMLElement ? scroller.clientHeight : -1,
      hostCount: hosts.length,
      hostHeight: chatRect ? chatRect.height : -1,
      hostRuntimeState: chatHost instanceof HTMLElement ? chatHost.dataset.runtimeState ?? "" : "",
      hostSurfaceFrozen:
        chatHost instanceof HTMLElement ? chatHost.dataset.surfaceFrozen ?? "" : "",
      hostSurfaceKind: chatHost instanceof HTMLElement ? chatHost.dataset.surfaceKind ?? "" : "",
      hostWidth: chatRect ? chatRect.width : -1,
      centerHitLiveContent:
        chatContent instanceof HTMLElement && centerTarget instanceof Element
          ? chatContent.contains(centerTarget)
          : false,
      frozenVisualFound: frozenVisual instanceof HTMLElement,
      frozenVisualText:
        frozenVisual instanceof HTMLElement ? frozenVisual.textContent?.slice(0, 300) ?? "" : "",
      frozenScrollerFound: frozenScroller instanceof HTMLElement,
      frozenScrollerScrollbarWidth: frozenScrollerStyle?.scrollbarWidth ?? "",
      liveContentHidden:
        chatContent instanceof HTMLElement ? chatContent.dataset.liveFrozenHidden ?? "" : "",
      bitmapCaptureKey:
        bitmapTexture instanceof HTMLElement ? bitmapTexture.dataset.snapshotCaptureKey ?? "" : "",
      bitmapFound: bitmapTexture instanceof HTMLElement && bitmapImage instanceof HTMLImageElement,
      scrollerFound: scroller instanceof HTMLElement,
      scrollData: scroller instanceof HTMLElement ? scroller.dataset.snapshotScrollTop ?? "" : "",
      scrollHeight: scroller instanceof HTMLElement ? scroller.scrollHeight : -1,
      scrollTop: scroller instanceof HTMLElement ? scroller.scrollTop : -1,
      settingsSnapshotFound: Boolean(
        settingsPlaceholder || settingsSnapshotTexture || fallbackSettingsSnapshotHost
      ),
      settingsHostFound: settingsHost instanceof HTMLElement,
      settingsHostRuntimeState:
        settingsHost instanceof HTMLElement ? settingsHost.dataset.runtimeState ?? "" : "",
      settingsHostSurfaceFrozen:
        settingsHost instanceof HTMLElement ? settingsHost.dataset.surfaceFrozen ?? "" : "",
      settingsHostSurfaceKind:
        settingsHost instanceof HTMLElement ? settingsHost.dataset.surfaceKind ?? "" : "",
      settingsPlaceholderFound: Boolean(settingsPlaceholder),
      sourceClassName: source instanceof HTMLElement ? source.className : "",
      sourceHeight: source ? snapshotSourceHeight(source) : chatRect ? chatRect.height : -1,
      sourceWidth: source ? snapshotSourceWidth(source) : chatRect ? chatRect.width : -1,
      text: chatHost?.textContent?.slice(0, 500) ?? "",
    };

    function snapshotSourceHeight(source) {
      if (source instanceof HTMLImageElement) {
        return source.naturalHeight || source.height;
      }
      if (source instanceof HTMLElement) {
        return Number(source.dataset.snapshotHeight || source.getBoundingClientRect().height);
      }
      return -1;
    }

    function snapshotSourceWidth(source) {
      if (source instanceof HTMLImageElement) {
        return source.naturalWidth || source.width;
      }
      if (source instanceof HTMLElement) {
        return Number(source.dataset.snapshotWidth || source.getBoundingClientRect().width);
      }
      return -1;
    }
  })()`;
}

function overviewSnapshotPreservesScroll(snapshot, expectedScrollTop) {
  if (snapshot.scrollerFound) {
    return Math.abs(snapshot.scrollTop - expectedScrollTop) <= 1;
  }
  return (
    snapshot.bitmapFound && snapshot.bitmapCaptureKey.includes(`${Math.round(expectedScrollTop)},`)
  );
}

function overviewSnapshotReady(snapshot, expectedScrollTop) {
  return (
    chatOverviewSnapshotReady(snapshot) &&
    snapshot.frozenVisualFound &&
    snapshot.frozenScrollerFound &&
    snapshot.frozenScrollerScrollbarWidth === "none" &&
    snapshot.liveContentHidden === "true" &&
    !snapshot.centerHitLiveContent &&
    overviewSnapshotPreservesScroll(snapshot, expectedScrollTop) &&
    overviewSnapshotSourceSizeReady(snapshot) &&
    settingsOverviewSnapshotReady(snapshot)
  );
}

function overviewSnapshotStableAfterSidebar(snapshot, expectedScrollTop) {
  return (
    chatOverviewSnapshotReady(snapshot) &&
    overviewSnapshotPreservesScroll(snapshot, expectedScrollTop) &&
    settingsOverviewSnapshotReady(snapshot) &&
    overviewSnapshotSourceSizeReady(snapshot)
  );
}

function chatOverviewSnapshotReady(snapshot) {
  return (
    snapshot.chatHostFound &&
    snapshot.hostSurfaceKind === "chat-dom" &&
    snapshot.hostRuntimeState === "live-throttled" &&
    snapshot.hostSurfaceFrozen === "true"
  );
}

function settingsOverviewSnapshotReady(snapshot) {
  return (
    snapshot.settingsHostFound &&
    snapshot.settingsHostRuntimeState === "live-throttled" &&
    snapshot.settingsHostSurfaceFrozen === "true"
  );
}

function overviewSnapshotSourceSizeReady(snapshot) {
  return snapshot.sourceHeight > 1 && snapshot.sourceWidth > 1;
}

async function sampleLiveScrollerAfterExit(client, paneId) {
  await waitForState(
    client,
    liveHostScrollerExpression(paneId),
    (sample) => sample.found && sample.hostRuntimeState === "live",
    workflowTimeoutMs,
  );
  return client.evaluate(`(async () => {
    const samples = [];
    const startedAt = performance.now();
    while (performance.now() - startedAt < 900) {
      samples.push({
        ...liveHostScroller(${JSON.stringify(paneId)}),
        t: Math.round(performance.now() - startedAt),
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return samples;

    ${liveHostScrollerFunctionSource()}
  })()`);
}

function liveHostScrollerExpression(paneId) {
  return `(() => {
    ${liveHostScrollerFunctionSource()}
    return liveHostScroller(${JSON.stringify(paneId)});
  })()`;
}

function liveHostScrollerFunctionSource() {
  return `function liveHostScroller(paneId) {
    const liveHost = document.querySelector(
      '.workspace-pane-host[data-pane-id="' + paneId + '"]'
    );
    const scroller = liveHost?.querySelector('[data-testid="chat-transcript-scroller"]');
    return {
      found: scroller instanceof HTMLElement,
      hostRuntimeState: liveHost instanceof HTMLElement ? liveHost.dataset.runtimeState ?? "" : "",
      scrollTop: scroller instanceof HTMLElement ? scroller.scrollTop : -1,
    };
  }`;
}

function assertNoLiveScrollReplay(samples, expectedScrollTop) {
  const liveSamples = samples.filter((sample) => sample.found);
  if (liveSamples.length === 0) {
    throw new Error(
      `no live chat scroller samples after exiting overview: ${JSON.stringify(samples)}`,
    );
  }
  const minimumScrollTop = Math.min(...liveSamples.map((sample) => sample.scrollTop));
  if (minimumScrollTop < expectedScrollTop - 8) {
    throw new Error(
      `live chat scroller replayed from the wrong offset: ${JSON.stringify({
        expectedScrollTop,
        minimumScrollTop,
        samples: liveSamples.slice(0, 20),
      })}`,
    );
  }
}

async function safeSnapshot(client) {
  try {
    return {
      bodyText: await client.evaluate(bodyTextExpression()),
      liveScroller: await client.evaluate(liveScrollerExpression()),
      overviewSnapshot: await client.evaluate(overviewSnapshotExpression()),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
