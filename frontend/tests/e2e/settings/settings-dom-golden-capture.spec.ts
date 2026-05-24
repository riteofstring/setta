import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const SHOULD_CAPTURE_DOM_GOLDEN =
  process.env.SETTA_CAPTURE_SETTINGS_DOM_GOLDEN === "1";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const TARGET_SECTION_ID = "settings-section__shortcuts";

test.skip(
  !SHOULD_CAPTURE_DOM_GOLDEN,
  "manual DOM-only golden capture; set SETTA_CAPTURE_SETTINGS_DOM_GOLDEN=1",
);

test.use({
  viewport: { height: 672, width: 1200 },
});

test("captures DOM-only Settings golden evidence", async ({
  page,
}, testInfo) => {
  const artifactDir =
    process.env.SETTA_GOLDEN_EVIDENCE_DIR ??
    testInfo.outputPath("settings-dom-golden");
  mkdirSync(artifactDir, { recursive: true });

  await openAllSettingsDomReference(page);
  const target = await resolveDomReferenceTarget(page);
  const baselineCadence = await measureRafCadence(page, 32);
  const allSettings = await captureAndAnalyze(page, {
    artifactDir,
    name: "all-settings-settled",
    rect: target.paneRect,
  });
  const header = await captureAndAnalyze(page, {
    artifactDir,
    name: "shortcuts-header-settled",
    rect: target.headerRect,
  });
  const bodyBefore = await captureAndAnalyze(page, {
    artifactDir,
    name: "shortcuts-body-before-scroll",
    rect: target.bodyRect,
  });
  const beforeState = await readDomReferenceState(page, target.sectionId);

  const gesture = await measureInteraction(page, async () => {
    await page.mouse.move(target.scrollPoint.x, target.scrollPoint.y);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(60);
    await captureAndAnalyze(page, {
      artifactDir,
      name: "shortcuts-body-scroll-60ms",
      rect: target.bodyRect,
    });
    await page.waitForTimeout(60);
    await captureAndAnalyze(page, {
      artifactDir,
      name: "shortcuts-body-scroll-120ms",
      rect: target.bodyRect,
    });
    await page.mouse.wheel(56, 42);
    await page.waitForTimeout(80);
  });

  const afterState = await readDomReferenceState(page, target.sectionId);
  const bodyAfter = await captureAndAnalyze(page, {
    artifactDir,
    name: "shortcuts-body-after-scroll-pan",
    rect: target.bodyRect,
  });
  const scrollDelta = await compareScreenshots(page, {
    actual: bodyAfter.image,
    expected: bodyBefore.image,
  });
  const summary: DomGoldenSummary = {
    artifactDir,
    baselineCadence,
    branch: "go-rewrite",
    evidenceVersion: "settings-dom-golden/v1",
    gesture,
    samples: {
      allSettings: allSettings.stats,
      bodyAfter: bodyAfter.stats,
      bodyBefore: bodyBefore.stats,
      header: header.stats,
    },
    scrollDelta,
    state: {
      after: afterState,
      before: beforeState,
    },
    target,
  };
  const summaryPath = join(artifactDir, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
  await testInfo.attach("settings-dom-golden-summary.json", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });

  expect(summary.state.after.visibleNodeCount).toBeGreaterThan(13);
  expect(summary.samples.header.nonWhiteRatio).toBeGreaterThan(0.01);
  expect(summary.samples.bodyBefore.nonWhiteRatio).toBeGreaterThan(0.1);
  expect(summary.scrollDelta.changedPixelRatio).toBeGreaterThan(0.001);
  expect(summary.gesture.longTasks.maxDurationMs).toBeLessThanOrEqual(50);
});

async function openAllSettingsDomReference(page: Page): Promise<void> {
  await page.goto(withBackendOriginOverride(SETTINGS_URL), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".react-flow__pane");
  const allSettings = page.getByRole("button", {
    exact: true,
    name: "All Settings",
  });
  await expect(allSettings).toBeVisible();
  await allSettings.click();
  await expect
    .poll(() => page.locator(".react-flow__node").count(), {
      timeout: 10_000,
    })
    .toBeGreaterThan(13);
  const fitView = page.getByRole("button", { name: "fit view" });
  if ((await fitView.count()) > 0) {
    await fitView.first().click();
  }
  await waitForAnimationFrame(page);
  await page.waitForTimeout(240);
}

function withBackendOriginOverride(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (!url.searchParams.has("__setta_backend_origin")) {
    url.searchParams.set("__setta_backend_origin", BACKEND_ORIGIN);
  }
  return url.toString();
}

async function resolveDomReferenceTarget(
  page: Page,
): Promise<DomReferenceTarget> {
  return await page.evaluate((sectionId) => {
    const pane = document.querySelector<HTMLElement>(".react-flow__pane");
    const sections = [
      ...document.querySelectorAll<HTMLElement>(
        '.react-flow__node[data-id^="settings-section__"]',
      ),
    ];
    if (!pane || sections.length === 0) {
      throw new Error("Missing DOM reference sections.");
    }
    const section = resolveBestSection(sections, sectionId);
    const header = section.querySelector<HTMLElement>("header, .section-title");
    const body =
      section.querySelector<HTMLElement>(".section-main-full-w") ?? section;
    const scrollElement = findScrollableElement(section) ?? body;
    const bodyRect = clampRect(body.getBoundingClientRect());
    return {
      bodyRect,
      headerRect: clampRect(
        (header ?? section).getBoundingClientRect(),
      ),
      paneRect: clampRect(pane.getBoundingClientRect()),
      scrollPoint: {
        x: bodyRect.x + bodyRect.width / 2,
        y: bodyRect.y + bodyRect.height / 2,
      },
      sectionId: section.dataset.id ?? sectionId,
      sectionRect: clampRect(section.getBoundingClientRect()),
      scrollElement: {
        className: scrollElement.className,
        clientHeight: scrollElement.clientHeight,
        scrollHeight: scrollElement.scrollHeight,
        scrollTop: scrollElement.scrollTop,
      },
    };

    function resolveBestSection(
      sections: readonly HTMLElement[],
      preferredSectionId: string,
    ): HTMLElement {
      const candidates = sections
        .map((element) => {
          const scrollElement = findScrollableElement(element) ?? element;
          const rect = element.getBoundingClientRect();
          const visibleRect = clampRect(rect);
          return {
            element,
            overflow:
              scrollElement.scrollHeight - scrollElement.clientHeight,
            preferred: element.dataset.id === preferredSectionId ? 1 : 0,
            visibleArea: visibleRect.width * visibleRect.height,
          };
        })
        .filter((candidate) => candidate.visibleArea > 400);
      const sortedCandidates = candidates.sort(
        (left, right) =>
          right.overflow - left.overflow ||
          right.preferred - left.preferred ||
          right.visibleArea - left.visibleArea,
      );
      return sortedCandidates[0]?.element ?? sections[0]!;
    }

    function findScrollableElement(root: HTMLElement): HTMLElement | null {
      const candidates = [root, ...root.querySelectorAll<HTMLElement>("*")];
      return (
        candidates.find(
          (element) => element.scrollHeight - element.clientHeight > 8,
        ) ?? null
      );
    }

    function clampRect(rect: DOMRect): Rect {
      const x = Math.max(0, Math.floor(rect.left));
      const y = Math.max(0, Math.floor(rect.top));
      const right = Math.min(window.innerWidth, Math.ceil(rect.right));
      const bottom = Math.min(window.innerHeight, Math.ceil(rect.bottom));
      return {
        height: Math.max(1, bottom - y),
        width: Math.max(1, right - x),
        x,
        y,
      };
    }
  }, TARGET_SECTION_ID);
}

async function readDomReferenceState(
  page: Page,
  sectionId: string,
): Promise<DomReferenceState> {
  return await page.evaluate((sectionId) => {
    const section = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    const viewport = document.querySelector<HTMLElement>(
      ".react-flow__viewport",
    );
    const scrollElement = section
      ? findScrollableElement(section)
      : null;
    return {
      sectionId,
      scrollTop: scrollElement?.scrollTop ?? null,
      transform: viewport ? getComputedStyle(viewport).transform : null,
      visibleNodeCount: [...document.querySelectorAll<HTMLElement>(
        ".react-flow__node",
      )].filter((element) => isVisible(element.getBoundingClientRect())).length,
    };

    function findScrollableElement(root: HTMLElement): HTMLElement | null {
      const candidates = [root, ...root.querySelectorAll<HTMLElement>("*")];
      return (
        candidates.find((element) => element.scrollHeight > element.clientHeight)
        ?? null
      );
    }

    function isVisible(rect: DOMRect): boolean {
      return (
        rect.width > 1 &&
        rect.height > 1 &&
        rect.x < window.innerWidth &&
        rect.y < window.innerHeight &&
        rect.x + rect.width > 0 &&
        rect.y + rect.height > 0
      );
    }
  }, sectionId);
}

async function captureAndAnalyze(
  page: Page,
  options: {
    readonly artifactDir: string;
    readonly name: string;
    readonly rect: Rect;
  },
): Promise<{ readonly image: Buffer; readonly stats: ImageStats }> {
  const image = await page.screenshot({
    clip: options.rect,
    path: join(options.artifactDir, `${options.name}.png`),
  });
  return {
    image,
    stats: await analyzeScreenshot(page, image),
  };
}

async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function measureRafCadence(
  page: Page,
  sampleCount: number,
): Promise<IntervalStats> {
  return await page.evaluate(async (count) => {
    const timestamps: number[] = [];
    await new Promise<void>((resolve) => {
      const sample = (timestamp: number) => {
        timestamps.push(timestamp);
        if (timestamps.length >= count) {
          resolve();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return summarizeIntervals(
      timestamps
        .slice(1)
        .map((timestamp, index) => timestamp - (timestamps[index] ?? timestamp)),
    );

    function summarizeIntervals(values: readonly number[]): IntervalStats {
      const sortedValues = [...values].sort((left, right) => left - right);
      return {
        count: sortedValues.length,
        maxMs: sortedValues.at(-1) ?? 0,
        p50Ms: percentile(sortedValues, 0.5),
        p95Ms: percentile(sortedValues, 0.95),
      };
    }

    function percentile(
      sortedValues: readonly number[],
      quantile: number,
    ): number {
      if (sortedValues.length === 0) {
        return 0;
      }
      const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(sortedValues.length * quantile) - 1),
      );
      return sortedValues[index] ?? 0;
    }
  }, sampleCount);
}

async function measureInteraction(
  page: Page,
  action: () => Promise<void>,
): Promise<InteractionStats> {
  await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __settaDomGoldenRafSamples?: number[];
      __settaDomGoldenLongTasks?: LongTaskSample[];
      __settaDomGoldenObserver?: PerformanceObserver;
      __settaDomGoldenRunning?: boolean;
    };
    globalWindow.__settaDomGoldenRafSamples = [];
    globalWindow.__settaDomGoldenLongTasks = [];
    globalWindow.__settaDomGoldenRunning = true;
    globalWindow.__settaDomGoldenObserver = new PerformanceObserver((list) => {
      const tasks = globalWindow.__settaDomGoldenLongTasks ?? [];
      for (const entry of list.getEntries()) {
        tasks.push({
          duration: entry.duration,
          name: entry.name,
          startTime: entry.startTime,
        });
      }
    });
    globalWindow.__settaDomGoldenObserver.observe({ entryTypes: ["longtask"] });
    const sample = (timestamp: number) => {
      if (!globalWindow.__settaDomGoldenRunning) {
        return;
      }
      globalWindow.__settaDomGoldenRafSamples?.push(timestamp);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await action();
  await page.waitForTimeout(180);

  return await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __settaDomGoldenRafSamples?: number[];
      __settaDomGoldenLongTasks?: LongTaskSample[];
      __settaDomGoldenObserver?: PerformanceObserver;
      __settaDomGoldenRunning?: boolean;
    };
    globalWindow.__settaDomGoldenRunning = false;
    globalWindow.__settaDomGoldenObserver?.disconnect();
    const samples = globalWindow.__settaDomGoldenRafSamples ?? [];
    const longTasks = globalWindow.__settaDomGoldenLongTasks ?? [];
    return {
      frame: summarizeIntervals(
        samples
          .slice(1)
          .map((timestamp, index) => timestamp - (samples[index] ?? timestamp)),
      ),
      longTasks: {
        count: longTasks.length,
        entries: longTasks,
        maxDurationMs: Math.max(0, ...longTasks.map((task) => task.duration)),
      },
    };

    function summarizeIntervals(values: readonly number[]): IntervalStats {
      const sortedValues = [...values].sort((left, right) => left - right);
      return {
        count: sortedValues.length,
        maxMs: sortedValues.at(-1) ?? 0,
        p50Ms: percentile(sortedValues, 0.5),
        p95Ms: percentile(sortedValues, 0.95),
      };
    }

    function percentile(
      sortedValues: readonly number[],
      quantile: number,
    ): number {
      if (sortedValues.length === 0) {
        return 0;
      }
      const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(sortedValues.length * quantile) - 1),
      );
      return sortedValues[index] ?? 0;
    }
  });
}

async function analyzeScreenshot(
  page: Page,
  image: Buffer,
): Promise<ImageStats> {
  return await page.evaluate(async (imageDataUrl) => {
    const image = await loadImage(imageDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Missing canvas context for screenshot analysis.");
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let nonWhite = 0;
    let opaque = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0;
      if (alpha <= 12) {
        continue;
      }
      opaque += 1;
      const red = pixels[index] ?? 255;
      const green = pixels[index + 1] ?? 255;
      const blue = pixels[index + 2] ?? 255;
      if (red < 245 || green < 245 || blue < 245) {
        nonWhite += 1;
      }
    }
    const total = Math.max(1, image.width * image.height);
    return {
      height: image.height,
      nonWhiteRatio: nonWhite / total,
      opaqueRatio: opaque / total,
      width: image.width,
    };

    function loadImage(dataUrl: string): Promise<HTMLImageElement> {
      return new Promise((resolve, reject) => {
        const imageElement = new Image();
        imageElement.onload = () => resolve(imageElement);
        imageElement.onerror = () => {
          reject(new Error("Failed to decode screenshot."));
        };
        imageElement.src = dataUrl;
      });
    }
  }, `data:image/png;base64,${image.toString("base64")}`);
}

async function compareScreenshots(
  page: Page,
  input: { readonly actual: Buffer; readonly expected: Buffer },
): Promise<ScreenshotDelta> {
  return await page.evaluate(
    async ({ actualDataUrl, expectedDataUrl }) => {
      const [actual, expected] = await Promise.all([
        loadImage(actualDataUrl),
        loadImage(expectedDataUrl),
      ]);
      const width = Math.min(actual.width, expected.width);
      const height = Math.min(actual.height, expected.height);
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Missing canvas context for screenshot comparison.");
      }
      context.drawImage(actual, 0, 0, width, height);
      context.drawImage(expected, width, 0, width, height);
      const actualPixels = context.getImageData(0, 0, width, height).data;
      const expectedPixels = context.getImageData(width, 0, width, height).data;
      let changed = 0;
      let totalDelta = 0;
      for (let index = 0; index < actualPixels.length; index += 4) {
        const delta =
          Math.abs((actualPixels[index] ?? 0) - (expectedPixels[index] ?? 0)) +
          Math.abs(
            (actualPixels[index + 1] ?? 0) - (expectedPixels[index + 1] ?? 0),
          ) +
          Math.abs(
            (actualPixels[index + 2] ?? 0) - (expectedPixels[index + 2] ?? 0),
          );
        totalDelta += delta / 3;
        if (delta > 36) {
          changed += 1;
        }
      }
      const total = Math.max(1, width * height);
      return {
        changedPixelRatio: changed / total,
        meanDelta: totalDelta / total,
      };

      function loadImage(dataUrl: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const imageElement = new Image();
          imageElement.onload = () => resolve(imageElement);
          imageElement.onerror = () => {
            reject(new Error("Failed to decode screenshot."));
          };
          imageElement.src = dataUrl;
        });
      }
    },
    {
      actualDataUrl: `data:image/png;base64,${input.actual.toString(
        "base64",
      )}`,
      expectedDataUrl: `data:image/png;base64,${input.expected.toString(
        "base64",
      )}`,
    },
  );
}

type Rect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

type DomReferenceTarget = {
  readonly bodyRect: Rect;
  readonly headerRect: Rect;
  readonly paneRect: Rect;
  readonly scrollElement: {
    readonly className: string;
    readonly clientHeight: number;
    readonly scrollHeight: number;
    readonly scrollTop: number;
  };
  readonly scrollPoint: { readonly x: number; readonly y: number };
  readonly sectionId: string;
  readonly sectionRect: Rect;
};

type DomReferenceState = {
  readonly scrollTop: number | null;
  readonly sectionId: string;
  readonly transform: string | null;
  readonly visibleNodeCount: number;
};

type ImageStats = {
  readonly height: number;
  readonly nonWhiteRatio: number;
  readonly opaqueRatio: number;
  readonly width: number;
};

type IntervalStats = {
  readonly count: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
};

type InteractionStats = {
  readonly frame: IntervalStats;
  readonly longTasks: {
    readonly count: number;
    readonly entries: readonly LongTaskSample[];
    readonly maxDurationMs: number;
  };
};

type LongTaskSample = {
  readonly duration: number;
  readonly name: string;
  readonly startTime: number;
};

type ScreenshotDelta = {
  readonly changedPixelRatio: number;
  readonly meanDelta: number;
};

type DomGoldenSummary = {
  readonly artifactDir: string;
  readonly baselineCadence: IntervalStats;
  readonly branch: string;
  readonly evidenceVersion: string;
  readonly gesture: InteractionStats;
  readonly samples: {
    readonly allSettings: ImageStats;
    readonly bodyAfter: ImageStats;
    readonly bodyBefore: ImageStats;
    readonly header: ImageStats;
  };
  readonly scrollDelta: ScreenshotDelta;
  readonly state: {
    readonly after: DomReferenceState;
    readonly before: DomReferenceState;
  };
  readonly target: DomReferenceTarget;
};
