import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { test, type Page } from "@playwright/test";

import {
  SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  openAllSettingsForRetainedCompositor,
  resolveRetainedCompositorTarget,
  resolveRetainedCompositorViewportPoint,
  runNativeRetainedCompositorWheelBurst,
} from "./settings-retained-compositor-helpers";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("manual retained compositor Chrome trace", async ({ context, page }) => {
  const tracePath = process.env.SETTA_RETAINED_COMPOSITOR_CHROME_TRACE;
  test.skip(
    !tracePath,
    "Set SETTA_RETAINED_COMPOSITOR_CHROME_TRACE to write a Chrome trace.",
  );
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const target = await resolveRetainedCompositorTarget(page);
  const viewportPoint = await resolveRetainedCompositorViewportPoint(page);
  const client = await context.newCDPSession(page);
  const traceEvents: unknown[] = [];
  client.on("Tracing.dataCollected", ({ value }) => {
    traceEvents.push(...value);
  });
  const traceComplete = new Promise<void>((resolve) => {
    client.once("Tracing.tracingComplete", () => resolve());
  });
  await client.send("Tracing.start", {
    categories: [
      "devtools.timeline",
      "blink.user_timing",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "gpu",
      "toplevel",
      "v8",
    ].join(","),
    transferMode: "ReportEvents",
  });

  await markTrace(page, "start");
  await markTrace(page, "viewport-zoom-start");
  await dispatchRetainedCompositorWheelBurst(page, {
    ctrlKey: true,
    deltaY: -0.25,
    eventCount: 96,
    point: viewportPoint,
  });
  await markTrace(page, "viewport-zoom-end");
  await markTrace(page, "retained-hover-zoom-start");
  await dispatchRetainedCompositorWheelBurst(page, {
    ctrlKey: true,
    deltaY: -0.25,
    eventCount: 96,
    point: target.point,
  });
  await markTrace(page, "retained-hover-zoom-end");
  await markTrace(page, "retained-scroll-start");
  await runNativeRetainedCompositorWheelBurst(page, {
    deltaY: 44,
    eventCount: 18,
    point: target.point,
  });
  await markTrace(page, "retained-scroll-end");
  await markTrace(page, "scroll-then-zoom-start");
  await runNativeRetainedCompositorWheelBurst(page, {
    ctrlKey: true,
    deltaY: -0.22,
    eventCount: 56,
    point: target.point,
  });
  await markTrace(page, "scroll-then-zoom-end");
  await markTrace(page, "end");

  await client.send("Tracing.end");
  await traceComplete;
  mkdirSync(dirname(tracePath), { recursive: true });
  writeFileSync(
    tracePath,
    JSON.stringify({
      metadata: {
        recordedAt: new Date().toISOString(),
        surfaceId: target.surfaceId,
      },
      traceEvents,
    }),
  );
});

async function markTrace(page: Page, name: string) {
  await page.evaluate((markName) => {
    performance.mark(`setta-retained-compositor-trace:${markName}`);
  }, name);
}
