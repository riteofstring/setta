import { expect, test, type Page } from "@playwright/test";

import { postBackend } from "../helpers";
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
  readonly projectionSampleId?: number | null;
  readonly tokenTransactionId?: string | null;
};

type ObservedBlockedVisiblePublicationEvent = BlockedVisiblePublicationEvent & {
  readonly eventCount: number;
};

type VisibleFrameIdentity = {
  readonly blockedEventCount: number;
  readonly canvasCommittedFrameId: number | null;
  readonly canvasHeldPreviousFrameCount: number | null;
  readonly canvasProjectionTransactionId: string | null;
  readonly canvasProjectionTransactionKind: string | null;
  readonly committedSurfaceFrameId: number | null;
  readonly domControlPlaneCommittedFrameId: number | null;
  readonly domControlPlaneFrameId: number | null;
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
  await installOptionalRetainedCompositorFrameProbe(page);
  await openAllSettingsForRetainedCompositor(page);
  await openCoreSettingsForBlockedPublicationBaseline(page);
  await centerRetainedCompositorSurface(page, BLOCKED_PUBLICATION_SURFACE_ID);
  const target = await resolveRetainedCompositorTarget(
    page,
    BLOCKED_PUBLICATION_SURFACE_ID,
  );
  const beforeIdentity = await readVisibleFrameIdentity(page);
  const before = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath("blocked-visible-before.png"),
  });

  await installBrowserVisualSnapshotFaultInjection(page);
  await page
    .getByRole("button", { exact: true, name: "Param Defaults" })
    .click();
  await waitForActiveSettingsViewMode(page, "Param Defaults");
  await page.waitForTimeout(120);
  await requestGpuFlowDebugFrame(page);
  const firstBlockedEvent = await waitForBlockedVisiblePublicationEvent(page, {
    afterCount: beforeIdentity.blockedEventCount,
    reason: "snapshot-pending",
  });
  const retryBlockedEvent = await waitForBlockedVisiblePublicationEvent(page, {
    afterCount: firstBlockedEvent.eventCount,
    reason: "snapshot-pending",
  });
  const afterIdentity = await readVisibleFrameIdentity(page);
  const after = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath("blocked-visible-after.png"),
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
      retainedFrameProbe,
      retryBlockedEvent,
      screenshotSimilarity,
      target,
    },
    null,
    2,
  );
  const blockedFrozenFrameId = firstBlockedEvent.frozenFrameId;
  const blockedActorIds = new Set(
    firstBlockedEvent.blockedReasons
      ?.map((reason) => reason.actorId)
      .filter((actorId): actorId is string => Boolean(actorId)) ?? [],
  );

  expect(
    firstBlockedEvent.blockedReasons?.some(
      (reason) => reason.actorId && reason.reason === "snapshot-pending",
    ),
    details,
  ).toBe(true);
  expect(retryBlockedEvent.eventCount, details).toBeGreaterThan(
    firstBlockedEvent.eventCount,
  );
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
  expect(
    afterIdentity.visibleDomControlActorIds.length,
    details,
  ).toBeGreaterThan(0);
  expect(
    afterIdentity.visibleDomControlActorIds.some((actorId) =>
      blockedActorIds.has(actorId),
    ),
    details,
  ).toBe(false);
  expect(blockedActorIds.size, details).toBeGreaterThan(0);
  expect(screenshotSimilarity.changedPixelRatio, details).toBeLessThanOrEqual(
    0.002,
  );
  expect(screenshotSimilarity.meanDelta, details).toBeLessThanOrEqual(1);
  expect(afterBands.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(afterBands.highConfidencePlaceholder, details).toBe(false);
});

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

async function installBrowserVisualSnapshotFaultInjection(
  page: Page,
): Promise<void> {
  await page.evaluate(() => {
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__ = {
      domControlReadiness: "blocked-awaiting-snapshot",
      withholdAllDomControls: true,
    };
  });
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

async function requestGpuFlowDebugFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const requestFrame = (
      window as typeof window & {
        readonly __SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__?: (
          reason?: "manual",
        ) => void;
      }
    ).__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__;
    if (!requestFrame) {
      throw new Error("Missing GPU Flow debug frame requester.");
    }
    requestFrame("manual");
  });
}

async function waitForBlockedVisiblePublicationEvent(
  page: Page,
  {
    actorId,
    afterCount,
    reason,
  }: {
    readonly actorId?: string | undefined;
    readonly afterCount: number;
    readonly reason: string;
  },
): Promise<ObservedBlockedVisiblePublicationEvent> {
  const deadline = Date.now() + BLOCKED_PUBLICATION_OBSERVATION_TIMEOUT_MS;
  let lastEvents: readonly BlockedVisiblePublicationEvent[] = [];
  while (Date.now() < deadline) {
    lastEvents = await readBlockedVisiblePublicationEvents(page);
    const observedEvent = findBlockedVisiblePublicationEvent(lastEvents, {
      actorId,
      afterCount,
      reason,
    });
    if (observedEvent) {
      return observedEvent;
    }
    await requestGpuFlowDebugFrame(page);
    await page.waitForTimeout(50);
  }
  lastEvents = await readBlockedVisiblePublicationEvents(page);
  const observedEvent = findBlockedVisiblePublicationEvent(lastEvents, {
    actorId,
    afterCount,
    reason,
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
    reason,
  }: {
    readonly actorId?: string | undefined;
    readonly afterCount: number;
    readonly reason: string;
  },
): ObservedBlockedVisiblePublicationEvent | null {
  for (let index = afterCount; index < events.length; index += 1) {
    const event = events[index];
    if (
      event?.blockedReasons?.some(
        (blockedReason) =>
          (actorId === undefined || blockedReason.actorId === actorId) &&
          blockedReason.reason === reason,
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
      domControlPlaneCommittedFrameId: parseOptionalNumber(
        domControlPlane?.dataset.gpuFlowDomControlPlaneCommittedFrameId,
      ),
      domControlPlaneFrameId: parseOptionalNumber(
        domControlPlane?.dataset.gpuFlowDomControlPlaneFrameId,
      ),
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
