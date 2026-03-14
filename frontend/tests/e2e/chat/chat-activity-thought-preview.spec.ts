import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
} from "../helpers";

test.describe.serial("chat activity thought preview", () => {
  test("pins minimized reasoning at the bottom until more thought text arrives", async ({
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

      await expect.poll(async () => {
        const metrics = await getThoughtPreviewMetrics(preview);
        return (
          metrics.maxScrollTop > 0 &&
          metrics.scrollTop >= metrics.maxScrollTop - 1 &&
          metrics.atBottom &&
          metrics.inlineMaskImage.includes("black 100%")
        );
      }).toBe(true);
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
        Math.abs(idleMetrics.visibleLineSlots - Math.round(idleMetrics.visibleLineSlots)),
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
                  thinking: `${initialThought}\n${buildOverflowingThoughtText("appended")}`,
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

      await expect.poll(async () => {
        const metrics = await getThoughtPreviewMetrics(preview);
        return (
          metrics.maxScrollTop > initialBottomMetrics.maxScrollTop &&
          metrics.scrollTop >= metrics.maxScrollTop - 1 &&
          metrics.atBottom &&
          metrics.inlineMaskImage.includes("black 100%")
        );
      }).toBe(true);

      // After the appended text has been consumed, the preview should pin again
      // at the new bottom instead of resuming a reverse oscillation.
      await page.waitForTimeout(1200);
      const appendedIdleMetrics = await getThoughtPreviewMetrics(preview);
      expect(appendedIdleMetrics.maxScrollTop).toBeGreaterThan(
        initialBottomMetrics.maxScrollTop,
      );
      expect(appendedIdleMetrics.scrollTop).toBeGreaterThanOrEqual(
        appendedIdleMetrics.maxScrollTop - 1,
      );
      expect(appendedIdleMetrics.atBottom).toBe(true);
      expect(appendedIdleMetrics.inlineMaskImage).toContain("black 100%");
      expect(
        Math.abs(
          appendedIdleMetrics.visibleLineSlots -
            Math.round(appendedIdleMetrics.visibleLineSlots),
        ),
      ).toBeLessThan(0.08);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function getThoughtPreviewMetrics(preview: Locator) {
  return await preview.evaluate((element) => ({
    scrollTop: element.scrollTop,
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
      return (
        (element.clientHeight - paddingTop - paddingBottom) / lineHeight
      );
    })(),
  }));
}

function buildOverflowingThoughtText(label: string): string {
  return Array.from({ length: 4 }, (_, index) =>
    `Thought ${label} line ${index + 1} keeps the latest reasoning visible.`,
  ).join("\n");
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
