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

type AgenticEdgeKind = "chat_chat" | "section_chat" | "chat_section";

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
    const createdTopLevelSectionIds: string[] = [];

    // Seed deterministic top-level sections before switching engines.
    for (let index = 0; index < 3; index += 1) {
      const sectionId = await createTopLevelSection({
        page,
        projectConfigId: projectContext.projectConfigId,
        implType: "Callable",
        viewportBounds,
        position: {
          x: viewportBounds.x + 100 + index * 320,
          y: viewportBounds.y + 140,
        },
      });
      createdTopLevelSectionIds.push(sectionId);
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
    const createdTextBlockSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "TextBlock",
      viewportBounds: engineViewportBounds,
      position: {
        x: engineViewportBounds.x + 220,
        y: engineViewportBounds.y + 420,
      },
    });
    createdTopLevelSectionIds.push(createdTextBlockSectionId);

    // Ensure section-state updates continue to flow into the new host.
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThan(rectCountBeforeCreate);

    if (createdTopLevelSectionIds.length < 2) {
      throw new Error("Expected at least two top-level sections.");
    }
    const createdChatSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Chat",
      viewportBounds: engineViewportBounds,
      position: {
        x: engineViewportBounds.x + 520,
        y: engineViewportBounds.y + 420,
      },
    });
    createdTopLevelSectionIds.push(createdChatSectionId);
    await createAgenticEdge({
      page,
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId: createdTopLevelSectionIds[0],
      targetSectionId: createdChatSectionId,
      kind: "section_chat",
    });

    await expect
      .poll(async () => await readAgenticEdgeCount(host))
      .toBeGreaterThanOrEqual(1);
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

async function readAgenticEdgeCount(host: Locator): Promise<number> {
  const value = await host.getAttribute(
    "data-canvas-engine-agentic-edge-count",
  );
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid agentic edge count attribute: ${String(value)}`);
  }
  return parsed;
}

async function createAgenticEdge({
  page,
  projectConfigId,
  sourceSectionId,
  targetSectionId,
  kind,
}: {
  page: Page;
  projectConfigId: string;
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKind;
}): Promise<void> {
  await postBackend(page, "/createAgenticEdge", {
    projectConfigId,
    id: null,
    sourceSectionId,
    targetSectionId,
    kind,
    contextMode: "reference_only",
    style: null,
    hidden: false,
    zIndex: 0,
  });
}
