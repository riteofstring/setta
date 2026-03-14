import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
} from "../helpers";

test.describe.serial("chat activity thought preview", () => {
  test("keeps the parent thought preview stacked below the activity header at a fixed height", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_activity_thought_preview_stack__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const initialThought = buildOverflowingThoughtText("stacked");
      const assistantReply =
        "Looking at the current layout, the parent activity preview should stay aligned with the assistant response bubble.";
      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "activity-thought-preview-stack-message",
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: initialThought,
                  summary: "",
                },
                {
                  type: "text",
                  text: assistantReply,
                },
              ],
              attachments: [],
              tool_calls: [
                {
                  id: "activity-thought-preview-stack-call",
                  type: "function",
                  function: {
                    name: "command_execution",
                    arguments: {
                      command: "pnpm exec vitest run src/components/Chat",
                    },
                  },
                },
              ],
            },
            {
              id: "activity-thought-preview-stack-result",
              role: "tool",
              tool_call_id: "activity-thought-preview-stack-call",
              tool_name: "command_execution",
              arguments: {
                command: "pnpm exec vitest run src/components/Chat",
              },
              result: "PASS src/components/Chat/ChatMessages.test.tsx",
              content: [],
              is_error: false,
              started_at: "2026-01-01T00:00:00Z",
              completed_at: "2026-01-01T00:00:05Z",
            },
          ],
          inputText: "",
          waitingForResponse: true,
          toolCallArguments: {},
        },
      });

      const activityTrigger = section.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      const headerTopRow = section.locator(
        '[data-chat-assistant-activity-header-top-row="true"]',
      );
      const preview = section.locator(
        '[data-chat-assistant-activity-thought-scroll="true"]',
      );
      const bubble = section
        .locator('[data-chat-assistant-bubble="true"]')
        .first();
      const firstChildTrigger = section
        .locator('[data-chat-thinking-trigger="true"]')
        .first();

      await expect(activityTrigger).toBeVisible();
      await expect(preview).toBeVisible();
      await expect(bubble).toBeVisible();

      const initialLayout = await getActivityPreviewLayout(
        activityTrigger,
        headerTopRow,
        preview,
      );
      expect(initialLayout.previewTop).toBeGreaterThanOrEqual(
        initialLayout.headerBottom - 1,
      );
      expect(initialLayout.previewWidth).toBeGreaterThanOrEqual(
        initialLayout.triggerWidth - 12,
      );
      const initialLeftEdges = await getActivityBubbleLeftEdges(
        activityTrigger,
        bubble,
      );
      expect(
        Math.abs(initialLeftEdges.activityLeft - initialLeftEdges.bubbleLeft),
      ).toBeLessThanOrEqual(1);

      await activityTrigger.click();
      await expect(firstChildTrigger).toBeVisible();
      const expandedLeftEdges = await getExpandedActivityBubbleLeftEdges(
        activityTrigger,
        firstChildTrigger,
        bubble,
      );
      expect(
        Math.abs(expandedLeftEdges.activityLeft - expandedLeftEdges.bubbleLeft),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(expandedLeftEdges.childLeft - expandedLeftEdges.bubbleLeft),
      ).toBeLessThanOrEqual(1);

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "activity-thought-preview-stack-message",
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: `${initialThought}\n${buildOverflowingThoughtText("stacked-follow-up")}`,
                  summary: "",
                },
                {
                  type: "text",
                  text: assistantReply,
                },
              ],
              attachments: [],
              tool_calls: [
                {
                  id: "activity-thought-preview-stack-call",
                  type: "function",
                  function: {
                    name: "command_execution",
                    arguments: {
                      command: "pnpm exec vitest run src/components/Chat",
                    },
                  },
                },
              ],
            },
            {
              id: "activity-thought-preview-stack-result",
              role: "tool",
              tool_call_id: "activity-thought-preview-stack-call",
              tool_name: "command_execution",
              arguments: {
                command: "pnpm exec vitest run src/components/Chat",
              },
              result: "PASS src/components/Chat/ChatMessages.test.tsx",
              content: [],
              is_error: false,
              started_at: "2026-01-01T00:00:00Z",
              completed_at: "2026-01-01T00:00:05Z",
            },
          ],
          inputText: "",
          waitingForResponse: true,
          toolCallArguments: {},
        },
      });

      await expect
        .poll(async () => {
          const nextLayout = await getActivityPreviewLayout(
            activityTrigger,
            headerTopRow,
            preview,
          );
          return (
            nextLayout.previewTop >= nextLayout.headerBottom - 1 &&
            nextLayout.previewWidth >= nextLayout.triggerWidth - 12 &&
            Math.abs(nextLayout.previewHeight - initialLayout.previewHeight) <
              0.5
          );
        })
        .toBe(true);
      await expect
        .poll(async () => {
          const nextLeftEdges = await getExpandedActivityBubbleLeftEdges(
            activityTrigger,
            firstChildTrigger,
            bubble,
          );
          return (
            Math.abs(nextLeftEdges.activityLeft - nextLeftEdges.bubbleLeft) <=
              1 &&
            Math.abs(nextLeftEdges.childLeft - nextLeftEdges.bubbleLeft) <= 1
          );
        })
        .toBe(true);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("pins minimized reasoning at the bottom while streaming and after completion", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_activity_thought_preview__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const initialThought = buildOverflowingThoughtText("initial");
      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "activity-thought-preview-message",
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: initialThought,
                  summary: "",
                },
              ],
              attachments: [],
              tool_calls: null,
            },
          ],
          inputText: "",
          waitingForResponse: true,
          toolCallArguments: {},
        },
      });

      const preview = section.locator(
        '[data-chat-assistant-activity-thought-scroll="true"]',
      );
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute(
        "data-chat-assistant-activity-thought-scroll-enabled",
        "true",
      );

      await expect
        .poll(
          async () => {
            const metrics = await getThoughtPreviewMetrics(preview);
            return (
              metrics.maxScrollTop > 0 &&
              metrics.scrollTop >= metrics.maxScrollTop - 1 &&
              metrics.atBottom &&
              metrics.inlineMaskImage.includes("black 100%")
            );
          },
          { timeout: 1200 },
        )
        .toBe(true);
      const initialBottomMetrics = await getThoughtPreviewMetrics(preview);
      expect(
        Math.abs(
          initialBottomMetrics.visibleLineSlots -
            Math.round(initialBottomMetrics.visibleLineSlots),
        ),
      ).toBeLessThan(0.08);

      // While the thought text is idle, the minimized preview should stay pinned
      // to the latest visible line instead of bouncing upward again.
      await page.waitForTimeout(1200);
      const idleMetrics = await getThoughtPreviewMetrics(preview);
      expect(idleMetrics.maxScrollTop).toBe(initialBottomMetrics.maxScrollTop);
      expect(idleMetrics.scrollTop).toBeGreaterThanOrEqual(
        idleMetrics.maxScrollTop - 1,
      );
      expect(idleMetrics.atBottom).toBe(true);
      expect(idleMetrics.inlineMaskImage).toContain("black 100%");
      expect(
        Math.abs(
          idleMetrics.visibleLineSlots -
            Math.round(idleMetrics.visibleLineSlots),
        ),
      ).toBeLessThan(0.08);

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "activity-thought-preview-message",
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: initialThought,
                  summary: "",
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

      // Finishing the stream should keep the collapsed preview pinned at the
      // latest line instead of snapping back to the first line.
      await expect
        .poll(async () => {
          const metrics = await getThoughtPreviewMetrics(preview);
          return (
            metrics.maxScrollTop > 0 &&
            metrics.scrollTop >= metrics.maxScrollTop - 1 &&
            metrics.atBottom
          );
        })
        .toBe(true);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function getThoughtPreviewMetrics(preview: Locator) {
  return await preview.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight),
    atBottom:
      element.getAttribute("data-chat-assistant-activity-thought-at-bottom") ===
      "true",
    inlineMaskImage: (element as HTMLElement).style.maskImage,
    visibleLineSlots: (() => {
      const styles = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(styles.lineHeight);
      const paddingTop = Number.parseFloat(styles.paddingTop);
      const paddingBottom = Number.parseFloat(styles.paddingBottom);
      return (element.clientHeight - paddingTop - paddingBottom) / lineHeight;
    })(),
  }));
}

async function getActivityPreviewLayout(
  activityTrigger: Locator,
  headerTopRow: Locator,
  preview: Locator,
) {
  const [triggerRect, headerRect, previewRect] = await Promise.all([
    activityTrigger.boundingBox(),
    headerTopRow.boundingBox(),
    preview.boundingBox(),
  ]);
  if (!triggerRect || !headerRect || !previewRect) {
    throw new Error("Expected activity trigger, header row, and preview.");
  }
  return {
    triggerWidth: triggerRect.width,
    headerBottom: headerRect.y + headerRect.height,
    previewTop: previewRect.y,
    previewWidth: previewRect.width,
    previewHeight: previewRect.height,
  };
}

async function getActivityBubbleLeftEdges(
  activityTrigger: Locator,
  bubble: Locator,
) {
  const [activityRect, bubbleRect] = await Promise.all([
    activityTrigger.boundingBox(),
    bubble.boundingBox(),
  ]);
  if (!activityRect || !bubbleRect) {
    throw new Error("Expected activity trigger and bubble.");
  }
  return {
    activityLeft: activityRect.x,
    bubbleLeft: bubbleRect.x,
  };
}

async function getExpandedActivityBubbleLeftEdges(
  activityTrigger: Locator,
  firstChildTrigger: Locator,
  bubble: Locator,
) {
  const [activityRect, childRect, bubbleRect] = await Promise.all([
    activityTrigger.boundingBox(),
    firstChildTrigger.boundingBox(),
    bubble.boundingBox(),
  ]);
  if (!activityRect || !childRect || !bubbleRect) {
    throw new Error(
      "Expected expanded activity trigger, child trigger, and bubble.",
    );
  }
  return {
    activityLeft: activityRect.x,
    childLeft: childRect.x,
    bubbleLeft: bubbleRect.x,
  };
}

function buildOverflowingThoughtText(label: string): string {
  return Array.from(
    { length: 18 },
    (_, index) =>
      `Thought ${label} line ${index + 1} keeps the latest reasoning visible while the parent activity preview stays pinned to the newest streamed detail in a fixed-height full-width lane.`,
  ).join("\n");
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
