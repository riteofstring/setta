import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady, postBackend } from "../helpers";
import {
  SETTINGS_PARAM_CONTENT_SUFFIX,
  SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  expectRetainedCompositorGestureWithinBudget,
  installOptionalRetainedCompositorFrameProbe,
  measureRetainedCompositorControlCadence,
  measureRetainedCompositorGesture,
  openAllSettingsForRetainedCompositor,
  readOptionalRetainedCompositorFrameProbe,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  runNativeRetainedCompositorWheelBurst,
  waitForRetainedCompositorCoherentVisibleFrame,
  warmRetainedCompositorNativeWheelTarget,
} from "./settings-retained-compositor-helpers";
import {
  analyzeHorizontalPlaceholderBands,
  compareScreenshotSimilarity,
} from "./settings-retained-visual-analysis";

const MIN_RETAINED_CONTENT_NONBLANK_RATIO = 0.02;
const MIN_VISIBLE_PROGRESS_CHANGED_PIXEL_RATIO = 0.0015;
const MIN_VISIBLE_PROGRESS_MEAN_DELTA = 0.5;
const MIN_FINAL_CHANGED_PIXEL_RATIO = 0.004;
const MIN_FINAL_MEAN_DELTA = 1;
const BLOCKED_PUBLICATION_OBSERVATION_TIMEOUT_MS = 6_000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const GPU_FLOW_READY_SELECTOR = ".setta-gpu-flow__pane";
const BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID =
  "cold-start-shell:browser-visual";
const BLOCKED_PUBLICATION_SURFACE_ID =
  "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX;

type BlockedVisiblePublicationEvent = {
  readonly blockedReasons?: readonly {
    readonly actorId?: string | null;
    readonly family?: string | null;
    readonly reason?: string | null;
  }[];
  readonly candidateFrameId?: number | null;
  readonly frozenFrameId?: number | string | null;
  readonly publicationLane?: string | null;
  readonly projectionSampleId?: number | null;
  readonly remainingDebt?: {
    readonly content?: boolean;
    readonly maintenance?: boolean;
    readonly motion?: boolean;
  } | null;
  readonly schedulerOutcome?: string | null;
  readonly schedulerState?: string | null;
  readonly tokenTransactionId?: string | null;
};

type ObservedBlockedVisiblePublicationEvent = BlockedVisiblePublicationEvent & {
  readonly eventCount: number;
};

type BrowserVisualFaultReadiness =
  | "blocked-awaiting-live-host"
  | "blocked-awaiting-snapshot";

type ColdStartShellFrame = {
  readonly frameId: string | null;
  readonly input: string | null;
  readonly reason: string | null;
};

type VisibleFrameIdentity = {
  readonly blockedEventCount: number;
  readonly canvasCommittedFrameId: number | null;
  readonly canvasHeldPreviousFrameCount: number | null;
  readonly canvasProjectionTransactionId: string | null;
  readonly canvasProjectionTransactionKind: string | null;
  readonly committedSurfaceFrameId: number | null;
  readonly debugSnapshotFrameId: number | null;
  readonly domControlPlaneCommittedFrameId: number | null;
  readonly domControlPlaneFrameId: number | null;
  readonly hitGenerationId: string | null;
  readonly visibleDomControlActorIds: readonly string[];
};

type SettingsProjectStatePayload = {
  readonly projectState: {
    readonly projectConfig: {
      readonly viewModes: Record<
        string,
        { readonly id: string; readonly name: string }
      >;
    };
  };
};

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained scroll and hover zoom make visible progress within the held-frame budget", async ({
  page,
}, testInfo) => {
  await installOptionalRetainedCompositorFrameProbe(page);
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const target = await resolveRetainedCompositorTarget(page);
  await warmRetainedCompositorNativeWheelTarget(page, target.point);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const before = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath("visible-progress-before.png"),
  });
  let sampleAround60Ms: Buffer | null = null;
  let sampleAround120Ms: Buffer | null = null;

  const gesture = await measureRetainedCompositorGesture(
    page,
    async () => {
      const scrollSpacing = await runNativeRetainedCompositorWheelBurst(page, {
        deltaY: 40,
        eventCount: 4,
        point: target.point,
      });
      const zoomSpacing = await dispatchRetainedCompositorWheelBurst(page, {
        ctrlKey: true,
        deltaY: -0.35,
        eventCount: 4,
        point: target.point,
      });
      sampleAround60Ms = await page.screenshot({
        clip: target.clip,
        path: testInfo.outputPath("visible-progress-around-60ms.png"),
      });
      await page.waitForTimeout(56);
      sampleAround120Ms = await page.screenshot({
        clip: target.clip,
        path: testInfo.outputPath("visible-progress-around-120ms.png"),
      });
      return [...scrollSpacing, ...zoomSpacing];
    },
    { settleMs: 160 },
  );

  const final = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath("visible-progress-final.png"),
  });
  if (!sampleAround60Ms || !sampleAround120Ms) {
    throw new Error("Missing retained visible progress samples.");
  }
  const around60Similarity = await compareScreenshotSimilarity(page, {
    actual: sampleAround60Ms,
    expected: before,
  });
  const around120Similarity = await compareScreenshotSimilarity(page, {
    actual: sampleAround120Ms,
    expected: before,
  });
  const finalSimilarity = await compareScreenshotSimilarity(page, {
    actual: final,
    expected: before,
  });
  const bands = {
    around120: await analyzeHorizontalPlaceholderBands(page, {
      screenshot: sampleAround120Ms,
    }),
    before: await analyzeHorizontalPlaceholderBands(page, {
      screenshot: before,
    }),
    final: await analyzeHorizontalPlaceholderBands(page, { screenshot: final }),
  };
  const budget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: gesture.eventSpacing,
  });
  const retainedFrameProbe =
    await readOptionalRetainedCompositorFrameProbe(page);
  const blockedEvents = await readBlockedVisiblePublicationEvents(page);
  const details = JSON.stringify(
    {
      around60Similarity,
      around120Similarity,
      bands,
      blockedEvents,
      budget,
      controlCadence,
      finalSimilarity,
      gesture,
      retainedFrameProbe,
      target,
    },
    null,
    2,
  );

  expectRetainedCompositorGestureWithinBudget({
    budget,
    details,
    gesture,
  });
  expect(bands.before.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(bands.around120.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(bands.final.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(bands.around120.highConfidencePlaceholder, details).toBe(false);
  expect(bands.final.highConfidencePlaceholder, details).toBe(false);
  expect(
    hasVisibleProgress(around60Similarity, around120Similarity),
    details,
  ).toBe(true);
  expect(
    finalSimilarity.changedPixelRatio >= MIN_FINAL_CHANGED_PIXEL_RATIO ||
      finalSimilarity.meanDelta >= MIN_FINAL_MEAN_DELTA,
    details,
  ).toBe(true);
});

test("browser visual snapshot withholding blocks while preserving the coherent visible frame", async ({
  page,
}, testInfo) => {
  await expectBrowserVisualFaultInjectionBlocksVisiblePublication(page, {
    outputPrefix: "blocked-visible-snapshot",
    readiness: "blocked-awaiting-snapshot",
    reason: "snapshot-pending",
    testInfo,
  });
});

test("browser visual live-host withholding blocks while preserving the coherent visible frame", async ({
  page,
}, testInfo) => {
  await expectBrowserVisualFaultInjectionBlocksVisiblePublication(page, {
    outputPrefix: "blocked-visible-live-host",
    readiness: "blocked-awaiting-live-host",
    reason: "live-dom-budget",
    testInfo,
  });
});

test("browser visual cold-start withholding publishes a blocked shell frame", async ({
  page,
}, testInfo) => {
  await installOptionalRetainedCompositorFrameProbe(page);
  await installBrowserVisualFaultInjectionForSettingsStartup(page, {
    readiness: "blocked-awaiting-snapshot",
  });
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(GPU_FLOW_READY_SELECTOR);
  await page.getByRole("button", { name: "fit view" }).click();
  await requestGpuFlowDebugFrame(page, "texture-upload");
  const firstBlockedEvent = await waitForBlockedVisiblePublicationEvent(page, {
    afterCount: 0,
    frameReason: "texture-upload",
    reason: "snapshot-pending",
  });
  const shellFrame = await waitForColdStartShellFrame(page);
  const shellScreenshot = await page.screenshot({
    path: testInfo.outputPath("blocked-visible-cold-start-shell.png"),
  });
  const shellBands = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: shellScreenshot,
  });
  const identity = await readVisibleFrameIdentity(page);
  await clearBrowserVisualFaultInjection(page);
  await requestGpuFlowDebugFrame(page, "texture-upload");
  await waitForRetainedCompositorCoherentVisibleFrame(page);
  const repairedIdentity = await readVisibleFrameIdentity(page);
  const retainedFrameProbe =
    await readOptionalRetainedCompositorFrameProbe(page);
  const details = JSON.stringify(
    {
      firstBlockedEvent,
      identity,
      repairedIdentity,
      retainedFrameProbe,
      shellBands,
      shellFrame,
    },
    null,
    2,
  );

  expect(firstBlockedEvent.frozenFrameId, details).toBe(
    BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  );
  expect(firstBlockedEvent.blockedReasons, details).toContainEqual({
    actorId: null,
    family: "browser-visual",
    reason: "snapshot-pending",
  });
  expectBlockedEventRetainsSchedulerDebt(firstBlockedEvent, details);
  expect(shellFrame, details).toEqual({
    frameId: BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
    input: "disabled",
    reason: "browser-visual-publication-blocked-before-first-commit",
  });
  expect(identity.visibleDomControlActorIds, details).toEqual([]);
  expect(shellBands.nonblankRatio, details).toBeGreaterThan(0.001);
  expect(repairedIdentity.committedSurfaceFrameId, details).toBeTruthy();
  expect(repairedIdentity.committedSurfaceFrameId, details).toBe(
    repairedIdentity.canvasCommittedFrameId,
  );
  expect(
    repairedIdentity.visibleDomControlActorIds.length,
    details,
  ).toBeGreaterThan(0);
});

async function expectBrowserVisualFaultInjectionBlocksVisiblePublication(
  page: Page,
  {
    outputPrefix,
    readiness,
    reason,
    testInfo,
  }: {
    readonly outputPrefix: string;
    readonly readiness: BrowserVisualFaultReadiness;
    readonly reason: "live-dom-budget" | "snapshot-pending";
    readonly testInfo: TestInfo;
  },
): Promise<void> {
  await installOptionalRetainedCompositorFrameProbe(page);
  await openAllSettingsForRetainedCompositor(page);
  await openCoreSettingsForBlockedPublicationBaseline(page);
  await centerRetainedCompositorSurface(page, BLOCKED_PUBLICATION_SURFACE_ID);
  await waitForRetainedCompositorCoherentVisibleFrame(page);
  await page.waitForTimeout(160);
  const target = await resolveRetainedCompositorTarget(
    page,
    BLOCKED_PUBLICATION_SURFACE_ID,
  );
  await clearBlockedVisiblePublicationEvents(page);
  const beforeIdentity = await readVisibleFrameIdentity(page);
  const before = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath(`${outputPrefix}-before.png`),
  });

  await installBrowserVisualFaultInjection(page, readiness);
  await page
    .getByRole("button", { exact: true, name: "Param Defaults" })
    .click();
  await waitForActiveSettingsViewMode(page, "Param Defaults");
  await page.waitForTimeout(120);
  await requestGpuFlowDebugFrame(page, "texture-upload");
  const firstBlockedEvent = await waitForBlockedVisiblePublicationEvent(page, {
    afterCount: beforeIdentity.blockedEventCount,
    frameReason: "texture-upload",
    reason,
  });
  await requestGpuFlowDebugFrame(page, "texture-upload");
  await page.waitForTimeout(120);
  const retryBlockedEvent = findBlockedVisiblePublicationEvent(
    await readBlockedVisiblePublicationEvents(page),
    {
      actorId: undefined,
      afterCount: firstBlockedEvent.eventCount,
      reason,
    },
  );
  const afterIdentity = await readVisibleFrameIdentity(page);
  const after = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath(`${outputPrefix}-after.png`),
  });
  await clearBrowserVisualFaultInjection(page);

  const screenshotSimilarity = await compareScreenshotSimilarity(page, {
    actual: after,
    expected: before,
  });
  const afterBands = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: after,
  });
  const retainedFrameProbe =
    await readOptionalRetainedCompositorFrameProbe(page);
  const details = JSON.stringify(
    {
      afterBands,
      afterIdentity,
      beforeIdentity,
      firstBlockedEvent,
      readiness,
      retainedFrameProbe,
      reason,
      retryBlockedEvent,
      screenshotSimilarity,
      target,
    },
    null,
    2,
  );
  const blockedFrozenFrameId = firstBlockedEvent.frozenFrameId;
  const expectedReasonObserved = firstBlockedEvent.blockedReasons?.some(
    (blockedReason) =>
      blockedReason.reason === reason &&
      (blockedReason.actorId || blockedReason.family === "browser-visual"),
  );
  const retainedProjectionBlocked = firstBlockedEvent.blockedReasons?.some(
    (blockedReason) => blockedReason.family === "retained-projection",
  );
  const blockedActorIds = new Set(
    firstBlockedEvent.blockedReasons
      ?.map((reason) => reason.actorId)
      .filter((actorId): actorId is string => Boolean(actorId)) ?? [],
  );

  expect(expectedReasonObserved || retainedProjectionBlocked, details).toBe(
    true,
  );
  expectBlockedEventRetainsSchedulerDebt(firstBlockedEvent, details);
  if (retryBlockedEvent) {
    expect(retryBlockedEvent.eventCount, details).toBeGreaterThan(
      firstBlockedEvent.eventCount,
    );
    expectBlockedEventRetainsSchedulerDebt(retryBlockedEvent, details);
  }
  if (typeof blockedFrozenFrameId !== "number") {
    throw new Error(details);
  }
  expect(blockedFrozenFrameId, details).toBeGreaterThanOrEqual(
    beforeIdentity.committedSurfaceFrameId ?? 0,
  );
  expect(afterIdentity.committedSurfaceFrameId, details).toBe(
    blockedFrozenFrameId,
  );
  expect(afterIdentity.canvasCommittedFrameId, details).toBe(
    blockedFrozenFrameId,
  );
  expect(afterIdentity.domControlPlaneCommittedFrameId, details).toBe(
    blockedFrozenFrameId,
  );
  expect(afterIdentity.domControlPlaneFrameId, details).toBe(
    blockedFrozenFrameId,
  );
  expect(afterIdentity.debugSnapshotFrameId, details).toBe(
    blockedFrozenFrameId,
  );
  expect(afterIdentity.hitGenerationId, details).toBeTruthy();
  expect(
    afterIdentity.visibleDomControlActorIds.length,
    details,
  ).toBeGreaterThan(0);
  if (blockedActorIds.size > 0) {
    expect(
      afterIdentity.visibleDomControlActorIds.some((actorId) =>
        blockedActorIds.has(actorId),
      ),
      details,
    ).toBe(false);
  }
  expect(screenshotSimilarity.changedPixelRatio, details).toBeLessThanOrEqual(
    0.002,
  );
  expect(screenshotSimilarity.meanDelta, details).toBeLessThanOrEqual(1);
  expect(afterBands.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(afterBands.highConfidencePlaceholder, details).toBe(false);
}

function expectBlockedEventRetainsSchedulerDebt(
  event: BlockedVisiblePublicationEvent,
  details: string,
): void {
  expect(event.schedulerOutcome, details).toBe("blocked");
  expect(event.remainingDebt, details).toBeTruthy();
  const remainingDebt = event.remainingDebt;
  if (!remainingDebt) {
    return;
  }
  expect(
    remainingDebt.content || remainingDebt.maintenance || remainingDebt.motion,
    details,
  ).toBe(true);
  if (
    event.publicationLane === "content" ||
    event.publicationLane === "maintenance" ||
    event.publicationLane === "motion"
  ) {
    expect(remainingDebt[event.publicationLane], details).toBe(true);
  }
}

async function openCoreSettingsForBlockedPublicationBaseline(
  page: Page,
): Promise<void> {
  await setSettingsViewMode(page, "Core");
  await waitForActiveSettingsViewMode(page, "Core");
  await page.waitForFunction((surfaceId) => {
    const rows =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?: () => readonly {
            readonly surfaceId?: string | null;
          }[];
        }
      ).__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    return rows.some((row) => row.surfaceId === surfaceId);
  }, BLOCKED_PUBLICATION_SURFACE_ID);
  await waitForRetainedCompositorCoherentVisibleFrame(page);
}

async function setSettingsViewMode(
  page: Page,
  viewModeName: string,
): Promise<void> {
  const projectConfigId = await getSettingsProjectConfigId(page);
  const currentState = await getLatestSettingsProjectState(
    page,
    projectConfigId,
  );
  await postBackend(page, "/setActiveViewMode", {
    activeViewModeId: findSettingsViewModeId(currentState, viewModeName),
    projectConfigId,
  });
  const nextState = await getLatestSettingsProjectState(page, projectConfigId);
  await applySettingsProjectStateUpdate(page, nextState);
  await waitForActiveSettingsViewMode(page, viewModeName);
}

async function getSettingsProjectConfigId(page: Page): Promise<string> {
  const response = await postBackend<{ projectConfig?: { id?: string } }>(
    page,
    "/loadProjectConfig",
    { projectConfigName: "settings" },
  );
  if (!response?.projectConfig?.id) {
    throw new Error("Missing projectConfig id for settings project.");
  }
  return response.projectConfig.id;
}

async function getLatestSettingsProjectState(
  page: Page,
  projectConfigId: string,
): Promise<SettingsProjectStatePayload> {
  const payload = await postBackend<SettingsProjectStatePayload>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  if (!payload) {
    throw new Error("Missing settings project state payload.");
  }
  return payload;
}

function findSettingsViewModeId(
  payload: SettingsProjectStatePayload,
  name: string,
): string {
  for (const viewMode of Object.values(
    payload.projectState.projectConfig.viewModes,
  )) {
    if (viewMode.name === name) {
      return viewMode.id;
    }
  }
  throw new Error(`Missing settings view mode ${name}.`);
}

async function applySettingsProjectStateUpdate(
  page: Page,
  payload: SettingsProjectStatePayload,
): Promise<void> {
  await page.evaluate(async (stateUpdate) => {
    const mod = await import("/src/state/actions/sectionInfos");
    mod.processProjectStateUpdateFromBackend(stateUpdate);
  }, payload);
}

async function waitForActiveSettingsViewMode(
  page: Page,
  viewModeName: string,
): Promise<void> {
  await page.waitForFunction(async (expectedViewModeName) => {
    const mod = await import("/src/state/definitions");
    const projectConfig = mod.useProjectState.getState().projectConfig;
    const activeViewModeId = projectConfig.activeViewModeId;
    return activeViewModeId
      ? projectConfig.viewModes[activeViewModeId]?.name === expectedViewModeName
      : false;
  }, viewModeName);
}

function hasVisibleProgress(
  around60Similarity: {
    readonly changedPixelRatio: number;
    readonly meanDelta: number;
  },
  around120Similarity: {
    readonly changedPixelRatio: number;
    readonly meanDelta: number;
  },
): boolean {
  return [around60Similarity, around120Similarity].some(
    (sample) =>
      sample.changedPixelRatio >= MIN_VISIBLE_PROGRESS_CHANGED_PIXEL_RATIO ||
      sample.meanDelta >= MIN_VISIBLE_PROGRESS_MEAN_DELTA,
  );
}

async function readBlockedVisiblePublicationEvents(
  page: Page,
): Promise<readonly BlockedVisiblePublicationEvent[]> {
  return await page.evaluate(
    () =>
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: readonly BlockedVisiblePublicationEvent[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ ?? [],
  );
}

async function clearBlockedVisiblePublicationEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: BlockedVisiblePublicationEvent[];
      }
    ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ = [];
  });
}

async function installBrowserVisualFaultInjection(
  page: Page,
  readiness: BrowserVisualFaultReadiness,
): Promise<void> {
  await page.evaluate((domControlReadiness) => {
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__ = {
      domControlReadiness,
      withholdAllDomControls: true,
    };
  }, readiness);
}

async function installBrowserVisualFaultInjectionForSettingsStartup(
  page: Page,
  {
    readiness,
  }: {
    readonly readiness: BrowserVisualFaultReadiness;
  },
): Promise<void> {
  await page.addInitScript((domControlReadiness) => {
    if (window.location.pathname !== "/settings") {
      return;
    }
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__ = {
      domControlReadiness,
      withholdAllDomControls: true,
    };
  }, readiness);
}

async function clearBrowserVisualFaultInjection(page: Page): Promise<void> {
  await page.evaluate(() => {
    delete (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__;
  });
}

async function requestGpuFlowDebugFrame(
  page: Page,
  frameReason: "manual" | "texture-upload" = "manual",
): Promise<void> {
  await page.evaluate((frameReason) => {
    const requestFrame = (
      window as typeof window & {
        readonly __SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__?: (
          reason?: "manual" | "texture-upload",
        ) => void;
      }
    ).__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__;
    if (!requestFrame) {
      throw new Error("Missing GPU Flow debug frame requester.");
    }
    requestFrame(frameReason);
  }, frameReason);
}

async function waitForColdStartShellFrame(
  page: Page,
): Promise<ColdStartShellFrame> {
  await page.waitForSelector('[data-gpu-flow-cold-start-shell="true"]');
  return await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(
      '[data-gpu-flow-cold-start-shell="true"]',
    );
    if (!shell) {
      throw new Error("Missing GPU Flow cold-start shell frame.");
    }
    return {
      frameId: shell.dataset.gpuFlowColdStartShellFrameId ?? null,
      input: shell.dataset.gpuFlowColdStartShellInput ?? null,
      reason: shell.dataset.gpuFlowColdStartShellReason ?? null,
    };
  });
}

async function waitForBlockedVisiblePublicationEvent(
  page: Page,
  {
    actorId,
    afterCount,
    frameReason = "manual",
    reason,
  }: {
    readonly actorId?: string | undefined;
    readonly afterCount: number;
    readonly frameReason?: "manual" | "texture-upload" | undefined;
    readonly reason: string;
  },
): Promise<ObservedBlockedVisiblePublicationEvent> {
  const deadline = Date.now() + BLOCKED_PUBLICATION_OBSERVATION_TIMEOUT_MS;
  let lastEvents: readonly BlockedVisiblePublicationEvent[] = [];
  while (Date.now() < deadline) {
    lastEvents = await readBlockedVisiblePublicationEvents(page);
    const observedEvent =
      findBlockedVisiblePublicationEvent(lastEvents, {
        actorId,
        afterCount,
        reason,
      }) ??
      findBlockedVisiblePublicationEvent(lastEvents, {
        afterCount,
        requireCommittedFrozenFrame: true,
      });
    if (observedEvent) {
      return observedEvent;
    }
    await requestGpuFlowDebugFrame(page, frameReason);
    await page.waitForTimeout(50);
  }
  lastEvents = await readBlockedVisiblePublicationEvents(page);
  const observedEvent =
    findBlockedVisiblePublicationEvent(lastEvents, {
      actorId,
      afterCount,
      reason,
    }) ??
    findBlockedVisiblePublicationEvent(lastEvents, {
      afterCount,
      requireCommittedFrozenFrame: true,
    });
  if (observedEvent) {
    return observedEvent;
  }
  const retainedFrameProbe =
    await readOptionalRetainedCompositorFrameProbe(page);
  const eventWindowStart = Math.max(0, afterCount - 2);
  const retainedFrameProbeWindowStart = Math.max(
    0,
    retainedFrameProbe.length - 8,
  );
  throw new Error(
    `Timed out waiting for blocked visible publication. ${JSON.stringify(
      {
        actorId,
        afterCount,
        eventCount: lastEvents.length,
        eventWindow: lastEvents.slice(eventWindowStart),
        eventWindowStart,
        identity: await readVisibleFrameIdentity(page),
        reason,
        retainedFrameProbeWindow: retainedFrameProbe.slice(
          retainedFrameProbeWindowStart,
        ),
        retainedFrameProbeWindowStart,
      },
      null,
      2,
    )}`,
  );
}

function findBlockedVisiblePublicationEvent(
  events: readonly BlockedVisiblePublicationEvent[],
  {
    actorId,
    afterCount,
    requireCommittedFrozenFrame = false,
    reason,
  }: {
    readonly actorId?: string | undefined;
    readonly afterCount: number;
    readonly requireCommittedFrozenFrame?: boolean | undefined;
    readonly reason?: string | undefined;
  },
): ObservedBlockedVisiblePublicationEvent | null {
  for (let index = afterCount; index < events.length; index += 1) {
    const event = events[index];
    if (
      requireCommittedFrozenFrame &&
      typeof event?.frozenFrameId !== "number"
    ) {
      continue;
    }
    if (
      event?.blockedReasons?.some(
        (blockedReason) =>
          (actorId === undefined || blockedReason.actorId === actorId) &&
          (reason === undefined || blockedReason.reason === reason),
      )
    ) {
      return { ...event, eventCount: index + 1 };
    }
  }
  return null;
}

async function readVisibleFrameIdentity(
  page: Page,
): Promise<VisibleFrameIdentity> {
  return await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(
      ".setta-gpu-flow__canvas",
    );
    const domControlPlane = document.querySelector<HTMLElement>(
      "[data-gpu-flow-dom-control-plane='true']",
    );
    const debugSnapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.() ?? null;
    const blockedEvents =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ ?? [];
    const visibleDomControlActorIds = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-gpu-flow-dom-control='true']",
      ),
    ]
      .map((host) => host.dataset.gpuFlowDomControlId)
      .filter((actorId): actorId is string => Boolean(actorId))
      .sort((left, right) => left.localeCompare(right));
    return {
      blockedEventCount: blockedEvents.length,
      canvasCommittedFrameId: parseOptionalNumber(
        canvas?.dataset.gpuFlowCommittedFrameId,
      ),
      canvasHeldPreviousFrameCount: parseOptionalNumber(
        canvas?.dataset.gpuFlowHeldPreviousFrameCount,
      ),
      canvasProjectionTransactionId:
        canvas?.dataset.gpuFlowProjectionTransactionId ?? null,
      canvasProjectionTransactionKind:
        canvas?.dataset.gpuFlowProjectionTransactionKind ?? null,
      committedSurfaceFrameId:
        debugSnapshot?.committedSurfaceFrame?.displayFrameId ?? null,
      debugSnapshotFrameId:
        debugSnapshot?.committedSurfaceFrame?.debugSnapshotFrameId ?? null,
      domControlPlaneCommittedFrameId: parseOptionalNumber(
        domControlPlane?.dataset.gpuFlowDomControlPlaneCommittedFrameId,
      ),
      domControlPlaneFrameId: parseOptionalNumber(
        domControlPlane?.dataset.gpuFlowDomControlPlaneFrameId,
      ),
      hitGenerationId:
        debugSnapshot?.committedSurfaceFrame?.hitGenerationId ?? null,
      visibleDomControlActorIds,
    };

    function parseOptionalNumber(value: string | undefined): number | null {
      if (value === undefined || value === "") {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
  });
}
