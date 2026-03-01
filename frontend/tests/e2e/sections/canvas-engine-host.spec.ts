import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

type FlowViewportBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

test("canvas engine host path mounts and tracks top-level section geometry", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);

  try {
    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve initial viewport bounds.");
    }

    // Seed deterministic top-level sections before switching engines.
    for (let index = 0; index < 3; index += 1) {
      await createTopLevelSection({
        page,
        projectConfigId: projectContext.projectConfigId,
        implType: "Callable",
        viewportBounds,
        position: {
          x: viewportBounds.x + 100 + index * 320,
          y: viewportBounds.y + 140,
        },
      });
    }

    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();
    await expect(page.locator(".react-flow__pane")).toHaveCount(0);

    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(3);

    const activeBackend = await host.getAttribute(
      "data-canvas-engine-active-backend",
    );
    expect(activeBackend === "webgpu" || activeBackend === "webgl2").toBe(true);

    const rectCountBeforeCreate = await readRectCount(host);
    const engineViewportBounds = await getEngineViewportBounds(page);
    await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "TextBlock",
      viewportBounds: engineViewportBounds,
      position: {
        x: engineViewportBounds.x + 220,
        y: engineViewportBounds.y + 420,
      },
    });

    // Ensure section-state updates continue to flow into the new host.
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThan(rectCountBeforeCreate);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function createTopLevelSection({
  page,
  projectConfigId,
  implType,
  viewportBounds,
  position,
}: {
  page: Page;
  projectConfigId: string;
  implType: string;
  viewportBounds: FlowViewportBounds;
  position: { x: number; y: number };
}): Promise<string> {
  const response = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
      viewportBounds,
      position,
    },
  );
  if (!response?.sectionId) {
    throw new Error(`Missing sectionId for implType ${implType}.`);
  }
  return response.sectionId;
}

async function getEngineViewportBounds(
  page: Page,
): Promise<FlowViewportBounds> {
  return await page.evaluate(() => ({
    x: 0,
    y: 0,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
}

async function readRectCount(host: Locator): Promise<number> {
  const value = await host.getAttribute("data-canvas-engine-rect-count");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid rect count attribute: ${String(value)}`);
  }
  return parsed;
}
