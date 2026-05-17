import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  disableCanvasSidePanePointerInterception,
  ensureAppReady,
  getGpuFlowNodeScreenRect,
  getViewportBoundsForPlacement,
  hoverGpuFlowNode,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

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
  test("connects between plain chat sections through shared chat handles", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await disableCanvasSidePanePointerInterception(page);

    try {
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
      await placeSectionsForSharedHandleDrag(
        page,
        projectContext.projectConfigId,
        [firstChat.sectionId, secondChat.sectionId],
      );

      const sourceHandle = page.locator(
        `[data-testid="chat-shared-source-handle-${firstChat.sectionId}"]`,
      );
      const targetHandle = page.locator(
        `[data-testid="chat-shared-target-handle-${secondChat.sectionId}"]`,
      );

      await ensureHandlesInViewport(page, sourceHandle, targetHandle);
      await page.mouse.move(1, 1);
      await expect(sourceHandle).not.toBeVisible({ timeout: 1500 });
      await expect(targetHandle).not.toBeVisible({ timeout: 1500 });

      await hoverGpuFlowNode(
        page,
        page.getByTestId(`rf__node-${firstChat.sectionId}`),
      );
      await expect(sourceHandle).toBeVisible();
      await hoverGpuFlowNode(
        page,
        page.getByTestId(`rf__node-${secondChat.sectionId}`),
      );
      await expect(targetHandle).toBeVisible();

      // After hover is gone, unconnected handles should fade out quickly.
      await page.mouse.move(1, 1);
      await expect(sourceHandle).not.toBeVisible({ timeout: 1500 });
      await expect(targetHandle).not.toBeVisible({ timeout: 1500 });

      const initialCount = await getAgenticEdgeCount(
        page,
        projectContext.projectConfigId,
      );

      await dragHandleToHandle(page, sourceHandle, targetHandle);

      await expect
        .poll(
          async () => getAgenticEdgeCount(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toBeGreaterThan(initialCount);

      await assertConnectedHandlesStayVisible(page, sourceHandle, targetHandle);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("connects between chat and non-chat sections", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await disableCanvasSidePanePointerInterception(page);

    try {
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
      await placeSectionsForSharedHandleDrag(
        page,
        projectContext.projectConfigId,
        [chatSection.sectionId, textSection.sectionId],
      );

      const sourceHandle = page.locator(
        `[data-testid="chat-shared-source-handle-${chatSection.sectionId}"]`,
      );
      const targetHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${textSection.sectionId}"][data-handleid="agentic-edge-target"]`,
      );

      await ensureHandlesInViewport(page, sourceHandle, targetHandle);
      await page.mouse.move(1, 1);
      await expect(sourceHandle).not.toBeVisible({ timeout: 1500 });
      await expect(targetHandle).not.toBeVisible({ timeout: 1500 });

      await hoverGpuFlowNode(
        page,
        page.getByTestId(`rf__node-${chatSection.sectionId}`),
      );
      await expect(sourceHandle).toBeVisible();
      await hoverGpuFlowNode(
        page,
        page.getByTestId(`rf__node-${textSection.sectionId}`),
      );
      await expect(targetHandle).toBeVisible();

      await page.mouse.move(1, 1);
      await expect(sourceHandle).not.toBeVisible({ timeout: 1500 });
      await expect(targetHandle).not.toBeVisible({ timeout: 1500 });

      const initialCount = await getAgenticEdgeCount(
        page,
        projectContext.projectConfigId,
      );

      await createChatToSectionAgenticEdge(
        page,
        chatSection.sectionId,
        textSection.sectionId,
      );

      await expect
        .poll(
          async () => getAgenticEdgeCount(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toBeGreaterThan(initialCount);

      await assertConnectedHandlesStayVisible(page, sourceHandle, targetHandle);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("connects between chat sections created via command palette", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await disableCanvasSidePanePointerInterception(page);

    try {
      await page.evaluate(() => {
        window.localStorage.setItem("setta_agentic_debug", "1");
        window.__settaAgenticDebug = [];
      });

      const firstSectionId = await createChatSectionViaCommandPalette(
        page,
        projectContext.projectConfigId,
      );
      const secondSectionId = await createChatSectionViaCommandPalette(
        page,
        projectContext.projectConfigId,
      );
      await placeSectionsForSharedHandleDrag(
        page,
        projectContext.projectConfigId,
        [firstSectionId, secondSectionId],
      );

      const sourceHandle = page.locator(
        `[data-testid="chat-shared-source-handle-${firstSectionId}"]`,
      );
      const targetHandle = page.locator(
        `[data-testid="chat-shared-target-handle-${secondSectionId}"]`,
      );

      await ensureHandlesInViewport(page, sourceHandle, targetHandle);
      await page.mouse.move(1, 1);
      await expect(sourceHandle).not.toBeVisible({ timeout: 1500 });
      await expect(targetHandle).not.toBeVisible({ timeout: 1500 });

      await hoverGpuFlowNode(
        page,
        page.getByTestId(`rf__node-${firstSectionId}`),
      );
      await expect(sourceHandle).toBeVisible();
      await hoverGpuFlowNode(
        page,
        page.getByTestId(`rf__node-${secondSectionId}`),
      );
      await expect(targetHandle).toBeVisible();
      await ensureHandlesInViewport(page, sourceHandle, targetHandle);

      const initialCount = await getAgenticEdgeCount(
        page,
        projectContext.projectConfigId,
      );

      await dragHandleToHandle(page, sourceHandle, targetHandle);

      await expect
        .poll(
          async () => getAgenticEdgeCount(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toBeGreaterThan(initialCount);

      await assertConnectedHandlesStayVisible(page, sourceHandle, targetHandle);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

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

async function openIsolatedProject(
  page: Page,
): Promise<IsolatedProjectContext> {
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
  await page.waitForSelector(".setta-gpu-flow__pane");
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
  // Cleanup is best-effort; each test run uses an isolated workspace.
  try {
    await page.request.post(`${BACKEND_ORIGIN}/api/deleteProjectConfigs`, {
      data: { ids: [context.projectConfigId] },
      timeout: 5000,
    });
  } catch {
    // Ignore cleanup failures to avoid masking assertion outcomes.
  }
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
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for chat placement.");
  }
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
      viewportBounds,
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
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for text placement.");
  }
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "TextBlock",
      viewportBounds,
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

async function placeSectionsForSharedHandleDrag(
  page: Page,
  projectConfigId: string,
  sectionIds: readonly string[],
  options: { readonly reloadAfterLayout?: boolean } = {},
): Promise<void> {
  await postBackend(page, "/setViewport", {
    projectConfigId,
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  const sectionWidth = 400;
  const sectionHeight = 220;
  const x = 420;
  const topLevelSections: Record<
    string,
    { h: number; w: number; x: number; y: number; zIndex: number }
  > = {};
  sectionIds.forEach((sectionId, index) => {
    topLevelSections[sectionId] = {
      h: sectionHeight,
      w: sectionWidth,
      x,
      y: 80 + index * (sectionHeight + 80),
      zIndex: 30 + index,
    };
  });
  await postBackend(page, "/setTopLevelSectionLayout", {
    projectConfigId,
    topLevelSections,
  });
  if (options.reloadAfterLayout ?? true) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");
    await disableCanvasSidePanePointerInterception(page);
  }
}

async function createChatSectionViaCommandPalette(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const isMac = process.platform === "darwin";
  const shortcut = isMac ? "Meta+Shift+P" : "Control+Shift+P";
  const searchInput = page.locator("#ProjectPageSearchBar");
  const existingChatIds = await getChatSectionIds(page, projectConfigId);
  const chatOption = page
    .getByRole("option", { name: "Chat", exact: true })
    .first();

  await page.keyboard.press(shortcut);
  await expect(searchInput).toBeVisible({ timeout: 3000 });
  await searchInput.fill("Chat");

  let selectedChatOption = false;
  const optionTimeoutMs = 2500;
  const optionStartedAt = Date.now();
  while (Date.now() - optionStartedAt < optionTimeoutMs) {
    if (await chatOption.isVisible()) {
      await chatOption.click();
      selectedChatOption = true;
      break;
    }
    await page.waitForTimeout(75);
  }
  if (!selectedChatOption) {
    // Fallback: command palette selects the top result with Enter even when
    // the list is not visible yet.
    await page.keyboard.press("Enter");
  }

  const createdSectionId = await waitForNewChatSectionId(
    page,
    projectConfigId,
    existingChatIds,
    12000,
  );
  await expect(page.getByTestId(`rf__node-${createdSectionId}`)).toBeVisible({
    timeout: 12000,
  });
  return createdSectionId;
}

async function waitForNewChatSectionId(
  page: Page,
  projectConfigId: string,
  existingChatIds: string[],
  timeoutMs: number,
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const currentChatIds = await getChatSectionIds(page, projectConfigId);
    const newChatIds = currentChatIds.filter(
      (sectionId) => !existingChatIds.includes(sectionId),
    );
    if (newChatIds.length === 1) {
      return newChatIds[0];
    }
    if (newChatIds.length > 1) {
      throw new Error(
        `Command palette created too many chat sections. Expected 1 new chat section, found ${newChatIds.length}.`,
      );
    }
    await page.waitForTimeout(100);
  }
  const finalChatIds = await getChatSectionIds(page, projectConfigId);
  const newChatIds = finalChatIds.filter(
    (sectionId) => !existingChatIds.includes(sectionId),
  );
  throw new Error(
    `Command palette did not create a new chat section. Expected 1 new chat section, found ${newChatIds.length}.`,
  );
}

async function dragHandleToHandle(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const sourceNodeId = await getHandleNodeId(source);
  const targetNodeId = await getHandleNodeId(target);

  const sourceNode = page.getByTestId(`rf__node-${sourceNodeId}`);
  const targetNode = page.getByTestId(`rf__node-${targetNodeId}`);

  await hoverGpuFlowNode(page, sourceNode);
  await expect(source).toBeVisible();

  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error("Source handle not visible.");
  }
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(page.locator(".setta-gpu-flow-root")).toHaveAttribute(
    "data-connecting",
    "true",
  );

  const targetNodeBox = await getGpuFlowNodeScreenRect(targetNode);
  if (!targetNodeBox) {
    throw new Error("Target node not visible.");
  }
  const targetNodeCenterX = targetNodeBox.x + targetNodeBox.width / 2;
  const targetNodeCenterY = targetNodeBox.y + targetNodeBox.height / 2;
  await page.mouse.move(targetNodeCenterX, targetNodeCenterY, { steps: 12 });

  await expect(target).toBeVisible();
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("Target handle not visible.");
  }
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}

async function getHandleNodeId(handle: Locator): Promise<string> {
  const nodeId = await handle.getAttribute("data-nodeid");
  if (!nodeId) {
    throw new Error("Missing data-nodeid attribute on handle.");
  }
  return nodeId;
}

async function assertConnectedHandlesStayVisible(
  page: Page,
  sourceHandle: Locator,
  targetHandle: Locator,
): Promise<void> {
  await expect(sourceHandle).toHaveClass(/agentic-handle--connected/);
  await expect(targetHandle).toHaveClass(/agentic-handle--connected/);

  // Move away so these are not visible purely due to hover/exiting animation.
  await page.mouse.move(1, 1);
  await page.waitForTimeout(900);

  await expect(sourceHandle).toBeVisible();
  await expect(targetHandle).toBeVisible();
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

async function createChatToSectionAgenticEdge(
  page: Page,
  sourceSectionId: string,
  targetSectionId: string,
): Promise<void> {
  await page.evaluate(
    async ({ sourceSectionId, targetSectionId }) => {
      const { createSharedChatEdgeFromConnection } = await import(
        "/src/state/actions/chatSharedEdges.ts"
      );
      createSharedChatEdgeFromConnection({
        source: sourceSectionId,
        sourceHandle: "chat-shared-edge-source",
        target: targetSectionId,
        targetHandle: "agentic-edge-target",
      });
    },
    { sourceSectionId, targetSectionId },
  );
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
  const isInView = await areHandlesInViewport(page, sourceHandle, targetHandle);
  if (isInView) {
    return;
  }
  const fitViewButton = page.getByRole("button", { name: "fit view" });
  await fitViewButton.click({ force: true });
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
  const [sourceNodeId, targetNodeId] = await Promise.all([
    getHandleNodeId(sourceHandle),
    getHandleNodeId(targetHandle),
  ]);
  const [sourceBox, targetBox] = await Promise.all([
    getGpuFlowNodeScreenRect(page.getByTestId(`rf__node-${sourceNodeId}`)),
    getGpuFlowNodeScreenRect(page.getByTestId(`rf__node-${targetNodeId}`)),
  ]);
  const viewport = page.viewportSize();
  if (!sourceBox || !targetBox || !viewport) {
    return false;
  }
  const withinViewport = (box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
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
