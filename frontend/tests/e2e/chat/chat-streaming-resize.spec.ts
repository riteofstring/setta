import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

type CreateSectionResponse = { sectionId?: string };

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
      topLevelSections?: Record<
        string,
        {
          w?: number | null;
          h?: number | null;
          x?: number;
          y?: number;
          zIndex?: number;
        }
      >;
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl?: string }>;
  };
};

test("chat streaming stays visible during resize", async ({ page }) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const { sectionId } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_chat_stream_resize__",
    );
    const chatId = `chat-stream-${Date.now()}`;
    await postBackend(page, "/setChatSectionChatId", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      chatId,
    });

    const streamMessageId = "msg-stream";
    await setChatSectionState(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      state: {
        messages: [
          {
            id: streamMessageId,
            role: "assistant",
            content: [{ type: "text", text: "Streaming" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        inputText: "",
        waitingForResponse: true,
        toolCallArguments: {},
      },
    });

    const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    await expect(node).toBeVisible();
    await expect(node.getByText("Streaming", { exact: false })).toBeVisible({
      timeout: 10000,
    });

    const initialLayout = await getSectionLayoutFromState(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    const baseWidth = initialLayout.width ?? 400;
    const baseHeight = initialLayout.height ?? 200;

    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId: projectContext.projectConfigId,
      topLevelSections: {
        [sectionId]: {
          x: initialLayout.x ?? 0,
          y: initialLayout.y ?? 0,
          zIndex: initialLayout.zIndex ?? 0,
          w: baseWidth,
          h: baseHeight + 120,
        },
      },
    });

    await expect
      .poll(
        async () =>
          (
            await getSectionLayoutFromState(
              page,
              projectContext.projectConfigId,
              sectionId,
            )
          ).height ?? 0,
        { timeout: 10000 },
      )
      .toBeGreaterThan(baseHeight);

    await expect(node.getByText("Streaming", { exact: false })).toBeVisible();

    await setChatSectionState(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      state: {
        messages: [
          {
            id: streamMessageId,
            role: "assistant",
            content: [{ type: "text", text: "Streaming after resize" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        inputText: "",
        waitingForResponse: true,
        toolCallArguments: {},
      },
    });

    await expect(
      node.getByText("Streaming after resize", { exact: false }),
    ).toBeVisible({ timeout: 10000 });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("assistant reasoning card matches bubble width with compact padding", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const { sectionId } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_reasoning_width__",
    );
    const chatId = `chat-reasoning-${Date.now()}`;
    await postBackend(page, "/setChatSectionChatId", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      chatId,
    });

    await setChatSectionState(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      state: {
        messages: [
          {
            id: "msg-reasoning",
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "Planning the app structure before code generation.",
                summary: "Planning",
                signature: null,
              },
              {
                type: "text",
                text: "I created a complete app scaffold with multiple backend services, a frontend control plane, and exhaustive validation workflows to force responsive bubble wrapping during pane resize checks.",
              },
            ],
            attachments: [],
            tool_calls: null,
          },
        ],
        inputText: "",
        waitingForResponse: false,
        toolCallArguments: {},
      },
    });

    const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    const reasoningCard = node
      .locator('[data-chat-assistant-reasoning-card="true"]')
      .first();
    const assistantBubble = node.locator('[data-chat-assistant-bubble="true"]');

    await expect(reasoningCard).toBeVisible({ timeout: 10000 });
    await expect(assistantBubble).toBeVisible({ timeout: 10000 });

    const sizing = await page.evaluate((targetSectionId) => {
      const root = document.querySelector(
        `.react-flow__node[data-id="${targetSectionId}"]`,
      );
      if (!root) {
        return null;
      }
      const card = root.querySelector(
        '[data-chat-assistant-reasoning-card="true"]',
      );
      const bubble = root.querySelector('[data-chat-assistant-bubble="true"]');
      if (!card || !bubble) {
        return null;
      }
      const cardRect = card.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const cardStyle = window.getComputedStyle(card);
      return {
        cardWidth: cardRect.width,
        bubbleWidth: bubbleRect.width,
        cardPaddingLeft: parseFloat(cardStyle.paddingLeft),
        cardPaddingRight: parseFloat(cardStyle.paddingRight),
        cardPaddingTop: parseFloat(cardStyle.paddingTop),
        cardPaddingBottom: parseFloat(cardStyle.paddingBottom),
      };
    }, sectionId);

    expect(sizing).not.toBeNull();
    if (!sizing) {
      throw new Error("Missing assistant reasoning sizing metrics.");
    }
    expect(Math.abs(sizing.cardWidth - sizing.bubbleWidth)).toBeLessThan(1);
    expect(sizing.cardPaddingLeft).toBeLessThanOrEqual(6);
    expect(sizing.cardPaddingRight).toBeLessThanOrEqual(6);
    expect(sizing.cardPaddingTop).toBeLessThanOrEqual(4);
    expect(sizing.cardPaddingBottom).toBeLessThanOrEqual(4);

    const initialLayout = await getSectionLayoutFromState(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    const baseWidth = initialLayout.width ?? 400;
    const targetWidth = Math.max(260, baseWidth - 120);
    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId: projectContext.projectConfigId,
      topLevelSections: {
        [sectionId]: {
          x: initialLayout.x ?? 0,
          y: initialLayout.y ?? 0,
          zIndex: initialLayout.zIndex ?? 0,
          w: targetWidth,
          h: initialLayout.height ?? 220,
        },
      },
    });

    await expect
      .poll(
        async () =>
          await page.evaluate((targetSectionId) => {
            const root = document.querySelector(
              `.react-flow__node[data-id="${targetSectionId}"]`,
            );
            if (!root) {
              return Number.POSITIVE_INFINITY;
            }
            const card = root.querySelector(
              '[data-chat-assistant-reasoning-card="true"]',
            );
            const bubble = root.querySelector(
              '[data-chat-assistant-bubble="true"]',
            );
            if (!card || !bubble) {
              return Number.POSITIVE_INFINITY;
            }
            const cardRect = card.getBoundingClientRect();
            const bubbleRect = bubble.getBoundingClientRect();
            return Math.abs(cardRect.width - bubbleRect.width);
          }, sectionId),
        { timeout: 10000 },
      )
      .toBeLessThan(1);

    const resizedSizing = await page.evaluate((targetSectionId) => {
      const root = document.querySelector(
        `.react-flow__node[data-id="${targetSectionId}"]`,
      );
      if (!root) {
        return null;
      }
      const card = root.querySelector(
        '[data-chat-assistant-reasoning-card="true"]',
      );
      const bubble = root.querySelector('[data-chat-assistant-bubble="true"]');
      if (!card || !bubble) {
        return null;
      }
      const cardRect = card.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      return {
        cardWidth: cardRect.width,
        bubbleWidth: bubbleRect.width,
      };
    }, sectionId);
    expect(resizedSizing).not.toBeNull();
    if (!resizedSizing) {
      throw new Error(
        "Missing assistant reasoning sizing metrics after resize.",
      );
    }
    expect(
      Math.abs(resizedSizing.cardWidth - resizedSizing.bubbleWidth),
    ).toBeLessThan(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("summary-only reasoning expands only when the summary is truncated", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const { sectionId } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_reasoning_summary_expand__",
    );
    const chatId = `chat-reasoning-summary-${Date.now()}`;
    await postBackend(page, "/setChatSectionChatId", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      chatId,
    });

    await setChatSectionState(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      state: {
        messages: [
          {
            id: "msg-reasoning-summary",
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "",
                summary: "Short summary",
                signature: null,
              },
            ],
            attachments: [],
            tool_calls: null,
          },
        ],
        inputText: "",
        waitingForResponse: false,
        toolCallArguments: {},
      },
    });

    const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    const activityTrigger = node.locator(
      '[data-chat-assistant-activity-trigger="true"]',
    );
    const trigger = node.locator('[data-chat-thinking-trigger="true"]');
    const expandedSummary = node.locator(
      '[data-chat-thinking-summary-expanded="true"]',
    );
    await expect(activityTrigger).toBeVisible({ timeout: 10000 });
    if (!(await trigger.isVisible())) {
      await activityTrigger.click();
    }
    await expect(trigger).toBeVisible({ timeout: 10000 });
    await expect(trigger).toHaveAttribute("data-chat-thinking-expandable", "false");
    const shortCursor = await trigger.evaluate(
      (el) => window.getComputedStyle(el).cursor,
    );
    expect(shortCursor).toBe("default");
    await expect(trigger).toBeDisabled();
    await expect(expandedSummary).toHaveCount(0);

    const initialLayout = await getSectionLayoutFromState(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId: projectContext.projectConfigId,
      topLevelSections: {
        [sectionId]: {
          x: initialLayout.x ?? 0,
          y: initialLayout.y ?? 0,
          zIndex: initialLayout.zIndex ?? 0,
          w: 260,
          h: initialLayout.height ?? 220,
        },
      },
    });

    const longSummary =
      "This summary is intentionally very long so it overflows the available title width and requires expansion to read in full.";
    await setChatSectionState(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      state: {
        messages: [
          {
            id: "msg-reasoning-summary",
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "",
                summary: longSummary,
                signature: null,
              },
            ],
            attachments: [],
            tool_calls: null,
          },
        ],
        inputText: "",
        waitingForResponse: false,
        toolCallArguments: {},
      },
    });

    await expect(trigger).toHaveAttribute("data-chat-thinking-expandable", "true");
    const longCursor = await trigger.evaluate(
      (el) => window.getComputedStyle(el).cursor,
    );
    expect(longCursor).toBe("pointer");
    await trigger.click();
    await expect(expandedSummary).toContainText(longSummary);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
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
  try {
    await postBackend(page, "/deleteProjectConfigs", {
      ids: [context.projectConfigId],
    });
  } catch (error) {
    console.warn("Cleanup failed:", error);
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

async function getSectionLayoutFromState(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{
  width: number | null;
  height: number | null;
  x: number | null;
  y: number | null;
  zIndex: number | null;
}> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const layout =
    response?.projectState?.projectConfig?.topLevelSections?.[sectionId];
  if (!layout) {
    return {
      width: null,
      height: null,
      x: null,
      y: null,
      zIndex: null,
    };
  }
  return {
    width: layout.w ?? null,
    height: layout.h ?? null,
    x: layout.x ?? null,
    y: layout.y ?? null,
    zIndex: layout.zIndex ?? null,
  };
}

async function setChatSectionState(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    state: Record<string, unknown>;
  },
): Promise<void> {
  await postBackend(page, "/setChatSectionState", payload);
}
