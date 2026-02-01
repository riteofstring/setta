import { expect, test, type Locator, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

type CreateSectionResponse = {
  sectionId?: string;
};

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      agenticEdges?: unknown[];
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl?: string }>;
    sectionImpls?: Record<string, { type?: string }>;
  };
};

test.describe.serial("agentic edges", () => {
  test("connects between chat sections", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const createAgenticEdgeRequests: string[] = [];
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes("/api/createAgenticEdge")) {
          createAgenticEdgeRequests.push(url);
        }
      });

      const firstChat = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_a__",
      );
      const secondChat = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_b__",
      );

      const sourceHandle = page.locator(
        `.react-flow__handle[data-nodeid="${firstChat.sectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const targetHandle = page.locator(
        `.react-flow__handle[data-nodeid="${secondChat.sectionId}"][data-handleid="agentic-edge-target"]`,
      );

      await expect(sourceHandle).toBeVisible();
      await expect(targetHandle).toBeVisible();

      const initialCount = await getAgenticEdgeCount(
        page,
        projectContext.projectConfigId,
      );

      await dragHandleToHandle(page, sourceHandle, targetHandle);

      await expect
        .poll(async () => createAgenticEdgeRequests.length, { timeout: 8000 })
        .toBeGreaterThan(0);

      await expect
        .poll(
          async () =>
            getAgenticEdgeCount(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toBeGreaterThan(initialCount);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("connects between chat and non-chat sections", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const createAgenticEdgeRequests: string[] = [];
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes("/api/createAgenticEdge")) {
          createAgenticEdgeRequests.push(url);
        }
      });

      const chatSection = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat__",
      );
      const textSection = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_text__",
      );

      const sourceHandle = page.locator(
        `.react-flow__handle[data-nodeid="${chatSection.sectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const targetHandle = page.locator(
        `.react-flow__handle[data-nodeid="${textSection.sectionId}"][data-handleid="agentic-edge-target"]`,
      );

      await expect(sourceHandle).toBeVisible();
      await expect(targetHandle).toBeVisible();

      const initialCount = await getAgenticEdgeCount(
        page,
        projectContext.projectConfigId,
      );

      await dragHandleToHandle(page, sourceHandle, targetHandle);

      await expect
        .poll(async () => createAgenticEdgeRequests.length, { timeout: 8000 })
        .toBeGreaterThan(0);

      await expect
        .poll(
          async () =>
            getAgenticEdgeCount(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toBeGreaterThan(initialCount);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("connects between chat sections created via command palette", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await page.evaluate(() => {
        window.localStorage.setItem("setta_agentic_debug", "1");
        window.__settaAgenticDebug = [];
      });
      const createAgenticEdgeRequests: string[] = [];
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes("/api/createAgenticEdge")) {
          createAgenticEdgeRequests.push(url);
        }
      });

      const initialChatIds = await getChatSectionIds(
        page,
        projectContext.projectConfigId,
      );
      await createChatSectionViaCommandPalette(page);
      await expect
        .poll(
          async () =>
            getChatSectionIds(page, projectContext.projectConfigId),
          { timeout: 15000 },
        )
        .toHaveLength(initialChatIds.length + 1);
      await createChatSectionViaCommandPalette(page);
      await expect
        .poll(
          async () =>
            getChatSectionIds(page, projectContext.projectConfigId),
          { timeout: 15000 },
        )
        .toHaveLength(initialChatIds.length + 2);

      const finalChatIds = await getChatSectionIds(
        page,
        projectContext.projectConfigId,
      );
      const newChatIds = finalChatIds.filter(
        (id) => !initialChatIds.includes(id),
      );
      if (newChatIds.length < 2) {
        throw new Error("Expected two newly created chat sections.");
      }
      const [firstSectionId, secondSectionId] = newChatIds;

      const sourceHandle = page.locator(
        `.react-flow__handle[data-nodeid="${firstSectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const targetHandle = page.locator(
        `.react-flow__handle[data-nodeid="${secondSectionId}"][data-handleid="agentic-edge-target"]`,
      );

      await expect(sourceHandle).toBeVisible();
      await expect(targetHandle).toBeVisible();
      await ensureHandlesInViewport(page, sourceHandle, targetHandle);

      const initialCount = await getAgenticEdgeCount(
        page,
        projectContext.projectConfigId,
      );

      await dragHandleToHandle(page, sourceHandle, targetHandle);

      await expect
        .poll(async () => createAgenticEdgeRequests.length, { timeout: 8000 })
        .toBeGreaterThan(0);

      await expect
        .poll(
          async () =>
            getAgenticEdgeCount(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toBeGreaterThan(initialCount);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function ensureAppReady(page: Page): Promise<void> {
  await page.goto(PROJECT_URL);
  if (await isAppReady(page)) {
    return;
  }
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`);
  await page.waitForURL(PROJECT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(".react-flow__pane", { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}

async function getCurrentProjectConfigId(page: Page): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }

  const currentPath = new URL(page.url()).pathname;
  const projectName = currentPath.split("/").filter(Boolean)[0];
  if (projectName) {
    const match = metadata.projectMetadata.find((p) => p.name === projectName);
    if (match?.id) {
      return match.id;
    }
  }

  if (metadata.defaultProjectConfigId) {
    return metadata.defaultProjectConfigId;
  }

  throw new Error("Unable to resolve projectConfigId for test.");
}

async function openIsolatedProject(page: Page): Promise<IsolatedProjectContext> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const name = await postBackend<string>(page, "/createProjectConfig", {
    previewImgColor: "bg-blue-500/60",
  });
  if (!name) {
    throw new Error("Missing project config name.");
  }
  const url = new URL(name, BASE_URL).toString();
  await page.goto(url);
  await page.waitForSelector(".react-flow__pane");
  const projectConfigId = await getCurrentProjectConfigId(page);
  return {
    projectConfigId,
    defaultProjectConfigId: metadata.defaultProjectConfigId ?? null,
  };
}

async function cleanupIsolatedProject(
  page: Page,
  context: IsolatedProjectContext | null,
): Promise<void> {
  if (!context) {
    return;
  }
  if (
    context.defaultProjectConfigId &&
    context.defaultProjectConfigId !== context.projectConfigId
  ) {
    await postBackend(page, "/setAsDefaultProject", {
      projectConfigId: context.defaultProjectConfigId,
    });
  }
  await postBackend(page, "/deleteProjectConfigs", {
    ids: [context.projectConfigId],
  });
}

async function resolveUniqueSectionName(
  page: Page,
  baseName: string,
): Promise<string> {
  const titles = await page
    .locator('section[class*="card-section"] header.section-title p')
    .allTextContents();
  const existingTitles = new Set(
    titles.map((title) => title.trim()).filter(Boolean),
  );
  if (!existingTitles.has(baseName)) {
    return baseName;
  }
  for (let i = 1; i <= 5; i += 1) {
    const candidate = `${baseName}-${i}`;
    if (!existingTitles.has(candidate)) {
      return candidate;
    }
  }
  return `${baseName}-${Date.now()}`;
}

async function createChatSection(
  page: Page,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string }> {
  const sectionName = await resolveUniqueSectionName(page, baseName);
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating chat section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name: sectionName,
  });
  return { sectionId: created.sectionId };
}

async function createTextBlockSection(
  page: Page,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string }> {
  const sectionName = await resolveUniqueSectionName(page, baseName);
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "TextBlock",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating text block section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name: sectionName,
  });
  return { sectionId: created.sectionId };
}

async function createChatSectionViaCommandPalette(page: Page): Promise<void> {
  const isMac = process.platform === "darwin";
  const shortcut = isMac ? "Meta+Shift+P" : "Control+Shift+P";
  await page.keyboard.press(shortcut);
  const searchInput = page.locator("#ProjectPageSearchBar");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("Chat");
  const chatOption = page.getByRole("option", { name: "Chat" }).first();
  let optionVisible = await chatOption.isVisible();
  for (let attempt = 0; attempt < 3 && !optionVisible; attempt += 1) {
    await page.keyboard.press(shortcut);
    await searchInput.fill("Chat");
    await page.waitForTimeout(150);
    optionVisible = await chatOption.isVisible();
    if (optionVisible) {
      break;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
  if (!optionVisible) {
    await expect(chatOption).toBeVisible({ timeout: 2000 });
  }
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/createTopLevelSection") &&
      response.request().method() === "POST",
  );
  await chatOption.click();
  await responsePromise;
}

async function dragHandleToHandle(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error("Source handle not visible.");
  }
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("Target handle not visible.");
  }
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
}

async function getAgenticEdgeCount(
  page: Page,
  projectConfigId: string,
): Promise<number> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  return response?.projectState?.projectConfig?.agenticEdges?.length ?? 0;
}

async function getChatSectionIds(
  page: Page,
  projectConfigId: string,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const config = response?.projectState?.projectConfig;
  const variants = response?.projectState?.sectionVariants ?? {};
  const impls = response?.projectState?.sectionImpls ?? {};
  const variantMap = config?.sectionVariantMap ?? {};
  return Object.entries(variantMap)
    .filter(([_, variantId]) => {
      const implId = variants[variantId]?.impl;
      if (!implId) {
        return false;
      }
      return impls[implId]?.type === "Chat";
    })
    .map(([sectionId]) => sectionId);
}

async function ensureHandlesInViewport(
  page: Page,
  sourceHandle: Locator,
  targetHandle: Locator,
): Promise<void> {
  const isInView = await areHandlesInViewport(
    page,
    sourceHandle,
    targetHandle,
  );
  if (isInView) {
    return;
  }
  const fitViewButton = page.getByRole("button", { name: "fit view" });
  await fitViewButton.click();
  await expect
    .poll(() => areHandlesInViewport(page, sourceHandle, targetHandle), {
      timeout: 5000,
    })
    .toBe(true);
}

async function areHandlesInViewport(
  page: Page,
  sourceHandle: Locator,
  targetHandle: Locator,
): Promise<boolean> {
  const [sourceBox, targetBox] = await Promise.all([
    sourceHandle.boundingBox(),
    targetHandle.boundingBox(),
  ]);
  const viewport = page.viewportSize();
  if (!sourceBox || !targetBox || !viewport) {
    return false;
  }
  const withinViewport = (box: { x: number; y: number; width: number; height: number }) => {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    return (
      centerX >= 0 &&
      centerY >= 0 &&
      centerX <= viewport.width &&
      centerY <= viewport.height
    );
  };
  return withinViewport(sourceBox) && withinViewport(targetBox);
}
