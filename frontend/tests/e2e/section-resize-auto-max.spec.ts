import { expect, test, type Page } from "@playwright/test";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
} from "./helpers";

type CreateSectionResponse = { sectionId?: string };

type LoadSettingsResponse = {
  sectionSizingPolicy: {
    globals: {
      autoMaxHeight: number;
    };
  };
};

test(
  "auto-sized sections remove auto max height clamp on resize start",
  async ({ page }) => {
    await ensureAppReady(page);
    const projectConfigId = await getCurrentProjectConfigId(page);
    let sectionId: string | null = null;

    try {
      sectionId = await createDictSection(page, projectConfigId);
      await addKwarg(page, projectConfigId, sectionId);
      await addKwarg(page, projectConfigId, sectionId);

      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      const paramRow = page
        .locator(`[id^="ParamContainer-${sectionId}-"]`)
        .first();
      await expect(paramRow).toBeVisible();

      const settings = await loadSettings(page);
      const autoMaxHeight = settings.sectionSizingPolicy.globals.autoMaxHeight;
      if (!Number.isFinite(autoMaxHeight)) {
        throw new Error(`Unexpected autoMaxHeight value: ${autoMaxHeight}`);
      }
      await sectionNode.hover();
      await sectionNode.click({ position: { x: 20, y: 20 } });

      const handle = sectionNode.locator(".section-resize-handle-bottom").first();
      await expect(handle).toHaveCount(1);
      const resizableId = `${sectionId}-CustomResizable`;
      const resizable = page.locator(`[id="${resizableId}"]`);
      await expect(resizable).toBeVisible();
      const initialMaxHeight = await getSectionMaxHeight(page, resizableId);
      if (initialMaxHeight > autoMaxHeight + 2) {
        throw new Error(
          `Expected initial max height <= ${autoMaxHeight + 2}, got ${initialMaxHeight}`,
        );
      }

      await page.evaluate(async (id) => {
        const { useResizeEvent } = await import("/src/state/definitions");
        useResizeEvent.setState((state) => {
          state.resizeEvent[id] = "start";
        });
      }, sectionId);
      const resizeEventValue = await page.evaluate(async (id) => {
        const { useResizeEvent } = await import("/src/state/definitions");
        return useResizeEvent.getState().resizeEvent[id] ?? null;
      }, sectionId);
      if (resizeEventValue !== "start") {
        throw new Error(
          `Expected resizeEvent to be start, got ${resizeEventValue}`,
        );
      }

      const minHeight = autoMaxHeight + 100;
      await expect
        .poll(async () => {
          return getSectionMaxHeight(page, resizableId);
        })
        .toBeGreaterThan(minHeight);
    } finally {
      if (sectionId) {
        await postBackend(page, "/deleteSections", {
          projectConfigId,
          sectionIds: [sectionId],
        });
      }
    }
  },
);

async function createDictSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Dict",
    },
  );
  if (!response?.sectionId) {
    throw new Error("Missing sectionId when creating dict section.");
  }
  return response.sectionId;
}

async function addKwarg(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<void> {
  await postBackend(page, "/addKwarg", {
    projectConfigId,
    sectionId,
  });
}

async function loadSettings(page: Page): Promise<LoadSettingsResponse> {
  const response = await postBackend<LoadSettingsResponse>(
    page,
    "/loadSettings",
    null,
  );
  if (!response) {
    throw new Error("Missing settings response.");
  }
  return response;
}

async function getSectionMaxHeight(
  page: Page,
  elementId: string,
): Promise<number> {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return 0;
    }
    const rawMaxHeight =
      el.style.maxHeight || getComputedStyle(el).maxHeight;
    const maxHeight = Number.parseFloat(rawMaxHeight);
    return Number.isFinite(maxHeight) ? maxHeight : 0;
  }, elementId);
}
