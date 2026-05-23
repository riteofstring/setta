import { type Page, type Rect } from "@playwright/test";

const FRAME_SAMPLER_KEY = "__settaRetainedCompositorFrameSampler";

type FrameSamplerHandle = {
  readonly beginIgnoredWindow: () => number;
  readonly endIgnoredWindow: (index: number) => void;
  readonly stop: () => RetainedCompositorFrameSample;
};

export type RetainedCompositorFrameSample = {
  readonly intervalsMs: readonly number[];
  readonly longTasks: readonly RetainedCompositorLongTaskSample[];
};

export type RetainedCompositorLongTaskSample = {
  readonly attribution: readonly RetainedCompositorLongTaskAttribution[];
  readonly durationMs: number;
  readonly name: string;
  readonly relativeStartTimeMs: number;
  readonly startTimeMs: number;
};

export type RetainedCompositorLongTaskAttribution = {
  readonly containerId: string;
  readonly containerName: string;
  readonly containerSrc: string;
  readonly containerType: string;
  readonly name: string;
};

type RetainedCompositorScreenshotOptions = {
  readonly clip?: Rect | undefined;
  readonly path?: string | undefined;
};

declare global {
  interface Window {
    [FRAME_SAMPLER_KEY]?: FrameSamplerHandle | undefined;
  }
}

export async function captureRetainedCompositorEvidenceScreenshot(
  page: Page,
  options: RetainedCompositorScreenshotOptions = {},
): Promise<Buffer> {
  const ignoredWindow = await beginRetainedCompositorSamplerIgnoredWindow(page);
  try {
    return await page.screenshot({
      ...(options.clip ? { clip: normalizeClip(options.clip) } : {}),
      ...(options.path ? { path: options.path } : {}),
    });
  } finally {
    await endRetainedCompositorSamplerIgnoredWindow(page, ignoredWindow);
  }
}

export async function startRetainedCompositorGestureFrameSampler(
  page: Page,
): Promise<void> {
  await page.evaluate((samplerKey) => {
    const intervals: Array<{
      readonly durationMs: number;
      readonly endTimeMs: number;
      readonly startTimeMs: number;
    }> = [];
    const ignoredWindows: Array<{
      endTimeMs: number | null;
      readonly startTimeMs: number;
    }> = [];
    const longTasks: RetainedCompositorLongTaskSample[] = [];
    const samplerStartTimeMs = performance.now();
    let previousTimestamp: number | null = null;
    let running = true;
    const observer =
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
        ? new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const longTaskEntry = entry as PerformanceEntry & {
                readonly attribution?: readonly {
                  readonly containerId?: string;
                  readonly containerName?: string;
                  readonly containerSrc?: string;
                  readonly containerType?: string;
                  readonly name?: string;
                }[];
              };
              longTasks.push({
                attribution: (longTaskEntry.attribution ?? []).map(
                  (attribution) => ({
                    containerId: attribution.containerId ?? "",
                    containerName: attribution.containerName ?? "",
                    containerSrc: attribution.containerSrc ?? "",
                    containerType: attribution.containerType ?? "",
                    name: attribution.name ?? "",
                  }),
                ),
                durationMs: entry.duration,
                name: entry.name,
                relativeStartTimeMs: entry.startTime - samplerStartTimeMs,
                startTimeMs: entry.startTime,
              });
            }
          })
        : null;
    observer?.observe({ entryTypes: ["longtask"] });
    const tick = (timestamp: number) => {
      if (previousTimestamp !== null) {
        intervals.push({
          durationMs: timestamp - previousTimestamp,
          endTimeMs: timestamp,
          startTimeMs: previousTimestamp,
        });
      }
      previousTimestamp = timestamp;
      if (running) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    window[samplerKey] = {
      beginIgnoredWindow: () => {
        const index = ignoredWindows.length;
        ignoredWindows.push({
          endTimeMs: null,
          startTimeMs: performance.now(),
        });
        return index;
      },
      endIgnoredWindow: (index: number) => {
        const ignoredWindow = ignoredWindows[index];
        if (!ignoredWindow || ignoredWindow.endTimeMs !== null) {
          return;
        }
        ignoredWindow.endTimeMs = performance.now();
      },
      stop: () => {
        running = false;
        observer?.disconnect();
        const stopTimeMs = performance.now();
        const completedIgnoredWindows = ignoredWindows.map((ignoredWindow) => ({
          endTimeMs: ignoredWindow.endTimeMs ?? stopTimeMs,
          startTimeMs: ignoredWindow.startTimeMs,
        }));
        const overlapsIgnoredWindow = ({
          endTimeMs,
          startTimeMs,
        }: {
          readonly endTimeMs: number;
          readonly startTimeMs: number;
        }) =>
          completedIgnoredWindows.some(
            (ignoredWindow) =>
              startTimeMs < ignoredWindow.endTimeMs &&
              endTimeMs > ignoredWindow.startTimeMs,
          );
        return {
          intervalsMs: intervals
            .filter((interval) => !overlapsIgnoredWindow(interval))
            .map((interval) => interval.durationMs),
          longTasks: longTasks.filter(
            (task) =>
              !overlapsIgnoredWindow({
                endTimeMs: task.startTimeMs + task.durationMs,
                startTimeMs: task.startTimeMs,
              }),
          ),
        };
      },
    };
  }, FRAME_SAMPLER_KEY);
}

export async function stopRetainedCompositorGestureFrameSampler(
  page: Page,
): Promise<RetainedCompositorFrameSample> {
  return await page.evaluate((samplerKey) => {
    const sampler = window[samplerKey];
    if (!sampler) {
      throw new Error("Missing retained compositor frame sampler.");
    }
    delete window[samplerKey];
    return sampler.stop();
  }, FRAME_SAMPLER_KEY);
}

async function beginRetainedCompositorSamplerIgnoredWindow(
  page: Page,
): Promise<number | null> {
  return await page.evaluate((samplerKey) => {
    return window[samplerKey]?.beginIgnoredWindow() ?? null;
  }, FRAME_SAMPLER_KEY);
}

async function endRetainedCompositorSamplerIgnoredWindow(
  page: Page,
  index: number | null,
): Promise<void> {
  if (index === null) {
    return;
  }
  await page.evaluate(
    ({ index, samplerKey }) => {
      window[samplerKey]?.endIgnoredWindow(index);
    },
    { index, samplerKey: FRAME_SAMPLER_KEY },
  );
}

function normalizeClip(rect: Rect): Rect {
  return {
    height: Math.max(1, Math.floor(rect.height)),
    width: Math.max(1, Math.floor(rect.width)),
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
  };
}
