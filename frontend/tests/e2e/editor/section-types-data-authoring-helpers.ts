import { expect, type Locator, type Page } from "@playwright/test";
import { createTopLevelSectionFromFrontend, postBackend } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

export type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl: string }>;
    sectionImpls?: Record<
      string,
      {
        type: string;
        codeObjVariantMap?: Record<string, string>;
        defaultChildSectionType?: string;
        viewMode?: string;
        readOnly?: boolean;
        showRowNumbers?: boolean;
        density?: string;
        autoReloadOnExternalChange?: boolean;
      }
    >;
    parentSectionMap?: Record<string, string | null>;
  };
};

export type RootResponse = {
  rootPath: string;
};

export type FileContentResponse = {
  contentId: string;
};

export async function readFileBrowserText(
  page: Page,
  filePath: string,
): Promise<string> {
  const fileRead = await postBackend<FileContentResponse>(
    page,
    "/getFileBrowserFileContent",
    { path: filePath },
  );
  const contentId = fileRead?.contentId;
  if (!contentId) {
    throw new Error("Missing file browser content id.");
  }
  const binaryResponse = await page.request.get(
    `${BACKEND_ORIGIN}/api/binary/${encodeURIComponent(contentId)}`,
  );
  if (!binaryResponse.ok()) {
    throw new Error(
      `Failed to download binary file payload (${binaryResponse.status()}).`,
    );
  }
  return binaryResponse.text();
}

export async function getLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestProjectStateResponse> {
  return (
    (await postBackend<LatestProjectStateResponse>(
      page,
      "/getLatestProjectState",
      {
        projectConfigId,
      },
    )) ?? {}
  );
}

export async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: string,
): Promise<string> {
  const res = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType,
  });
  const sectionId = res?.sectionId;
  if (!sectionId) {
    throw new Error(`Failed to create ${implType} section.`);
  }
  return sectionId;
}

export async function createChildSectionsViaIncrementerFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    implType: string;
    numChildren: number;
  },
): Promise<void> {
  await page.evaluate(async (input) => {
    const { createChildSectionsViaIncrementer, getLatestProjectState } =
      await import("/src/openapi/http");
    const { callOpenAPI } = await import(
      "/tests/e2e/browserAppSubsystemSdk.ts"
    );
    const { getCurrProjectConfigId, processProjectStateUpdateFromBackend } =
      await import("/src/state/actions/sectionInfos");

    if (getCurrProjectConfigId() !== input.projectConfigId) {
      throw new Error(
        `Active project mismatch while creating incrementer children: expected ${input.projectConfigId}.`,
      );
    }

    const response = await callOpenAPI(
      createChildSectionsViaIncrementer({
        body: {
          projectConfigId: input.projectConfigId,
          calledBy: input.sectionId,
          implType: input.implType,
          numChildren: input.numChildren,
        },
      } as Parameters<typeof createChildSectionsViaIncrementer>[0]),
    );
    if (response.status !== 200) {
      throw new Error(
        `Failed to create incrementer children for ${input.sectionId}: ${response.status}`,
      );
    }
    const latestProjectStateResponse = await callOpenAPI(
      getLatestProjectState({
        body: {
          projectConfigId: input.projectConfigId,
        },
      } as Parameters<typeof getLatestProjectState>[0]),
    );
    if (
      latestProjectStateResponse.status !== 200 ||
      !latestProjectStateResponse.data
    ) {
      throw new Error(
        `Failed to hydrate latest project state for ${input.projectConfigId}: ${latestProjectStateResponse.status}`,
      );
    }
    processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
  }, payload);
}

export async function dragBrowserRowToTarget(
  source: Locator,
  target: Locator,
): Promise<void> {
  const page = source.page();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
}

export async function dragPointerSurfaceToTarget(
  source: Locator,
  target: Locator,
  options?: {
    sourcePosition?: { x: number; y: number };
    targetPosition?: { x: number; y: number };
  },
): Promise<void> {
  const sourcePosition = options?.sourcePosition ?? { x: 3, y: 3 };
  const targetPosition = options?.targetPosition ?? { x: 3, y: 3 };
  const page = source.page();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error("Source drag surface bounds unavailable.");
  }
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("Target drag surface bounds unavailable.");
  }
  await page.mouse.move(
    sourceBox.x + sourcePosition.x,
    sourceBox.y + sourcePosition.y,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetPosition.x,
    targetBox.y + targetPosition.y,
    {
      steps: 12,
    },
  );
  await page.mouse.up();
}

export async function getViewportScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = document.querySelector(".setta-gpu-flow__canvas");
    if (!viewport) {
      return 1;
    }
    const transform = window.getComputedStyle(viewport).transform;
    if (!transform || transform === "none") {
      return 1;
    }
    const matrix = new DOMMatrixReadOnly(transform);
    if (!Number.isFinite(matrix.a) || matrix.a <= 0) {
      return 1;
    }
    return matrix.a;
  });
}

const ZOOM_EPSILON = 0.0005;

export async function waitForViewportScaleToStabilize(page: Page): Promise<number> {
  const timeoutMs = 3000;
  const pollIntervalMs = 50;
  const requiredStableSamples = 2;
  const deadline = Date.now() + timeoutMs;
  let previousZoom = await getViewportScale(page);
  let stableSampleCount = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(pollIntervalMs);
    const currentZoom = await getViewportScale(page);
    if (Math.abs(currentZoom - previousZoom) <= ZOOM_EPSILON) {
      stableSampleCount += 1;
      if (stableSampleCount >= requiredStableSamples) {
        return currentZoom;
      }
    } else {
      stableSampleCount = 0;
    }
    previousZoom = currentZoom;
  }

  throw new Error("Viewport zoom did not stabilize in time.");
}

export async function clickAndWaitForViewportScaleChange(
  page: Page,
  zoomButton: Locator,
): Promise<void> {
  const previousZoom = await getViewportScale(page);
  await zoomButton.click();
  await expect
    .poll(
      async () =>
        Math.abs((await getViewportScale(page)) - previousZoom) > ZOOM_EPSILON,
      {
        timeout: 3000,
      },
    )
    .toBe(true);
  await waitForViewportScaleToStabilize(page);
}

export async function applyZoomPreset(
  page: Page,
  zoomOutClicks: number,
  zoomInClicks: number,
): Promise<number> {
  const resetZoomButton = page.getByRole("button", { name: "reset zoom" });
  const zoomOutButton = page.getByRole("button", { name: "zoom out" });
  const zoomInButton = page.getByRole("button", { name: "zoom in" });

  await resetZoomButton.click();
  await expect
    .poll(async () => await getViewportScale(page))
    .toBeGreaterThan(0);
  await waitForViewportScaleToStabilize(page);

  for (let i = 0; i < zoomOutClicks; i += 1) {
    await clickAndWaitForViewportScaleChange(page, zoomOutButton);
  }
  for (let i = 0; i < zoomInClicks; i += 1) {
    await clickAndWaitForViewportScaleChange(page, zoomInButton);
  }
  await expect
    .poll(async () => await getViewportScale(page))
    .toBeGreaterThan(0);
  return waitForViewportScaleToStabilize(page);
}

export function getExpectedSpreadsheetDensityMultiplier(viewportZoom: number): number {
  const safeZoom = viewportZoom > 0 ? viewportZoom : 1;
  const desiredMultiplier =
    safeZoom >= 1 ? safeZoom : 1 / Math.max(0.01, safeZoom);
  return Math.min(6, Math.max(1, desiredMultiplier));
}

export type SpreadsheetCanvasDensityMetrics = {
  densityX: number;
  densityY: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  baseFontPx: number;
};

export async function getSpreadsheetCanvasDensityMetrics(
  spreadsheetNode: Locator,
): Promise<SpreadsheetCanvasDensityMetrics> {
  const metrics = await spreadsheetNode.evaluate((node) => {
    const grid = node.querySelector('[data-testid="spreadsheet-glide-grid"]');
    if (!(grid instanceof HTMLElement)) {
      return null;
    }
    const canvases = Array.from(grid.querySelectorAll("canvas"));
    if (canvases.length === 0) {
      return null;
    }
    const largest = canvases.reduce((best, current) => {
      const currentRect = current.getBoundingClientRect();
      const bestRect = best.getBoundingClientRect();
      if (
        currentRect.width * currentRect.height >
        bestRect.width * bestRect.height
      ) {
        return current;
      }
      return best;
    });
    const rect = largest.getBoundingClientRect();
    const themedElement =
      grid.querySelector<HTMLElement>('[style*="--gdg-base-font-style"]') ??
      (grid.firstElementChild as HTMLElement | null);
    const computedTheme = themedElement
      ? window.getComputedStyle(themedElement)
      : null;
    const baseFontStyle =
      computedTheme?.getPropertyValue("--gdg-base-font-style").trim() ?? "";
    const baseFontMatch = /([0-9.]+)px/.exec(baseFontStyle);
    const baseFontPx = baseFontMatch ? Number(baseFontMatch[1]) : NaN;
    return {
      densityX: largest.width / Math.max(1, rect.width),
      densityY: largest.height / Math.max(1, rect.height),
      cssWidth: rect.width,
      cssHeight: rect.height,
      pixelWidth: largest.width,
      pixelHeight: largest.height,
      baseFontPx,
    };
  });

  if (!metrics) {
    throw new Error("Spreadsheet canvas metrics unavailable.");
  }
  return metrics;
}

export function getChildSectionIds(
  latest: LatestProjectStateResponse,
  parentSectionId: string,
): string[] {
  return Object.entries(latest.projectState?.parentSectionMap ?? {})
    .filter(([, parentId]) => parentId === parentSectionId)
    .map(([childId]) => childId);
}

export type SortableSectionDistances = {
  xDelta: number;
  yDelta: number;
};

export async function getSortableSectionDistances(
  page: Page,
  childIds: string[],
): Promise<SortableSectionDistances | null> {
  return await page.evaluate((ids) => {
    const first = document.querySelector(
      `[data-sortable-section-id="${ids[0]}"]`,
    ) as HTMLElement | null;
    const second = document.querySelector(
      `[data-sortable-section-id="${ids[1]}"]`,
    ) as HTMLElement | null;
    if (!first || !second) {
      return null;
    }
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    return {
      xDelta: Math.abs(firstRect.x - secondRect.x),
      yDelta: Math.abs(firstRect.y - secondRect.y),
    };
  }, childIds);
}
