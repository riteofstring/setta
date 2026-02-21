import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
} from "../helpers";

test.describe.serial("chat tool calls", () => {
  test("groups tool calls in one expandable container with dense full-width rows", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_tool_call_grouping__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "tool-msg-1",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "tool-call-1",
                  type: "function",
                  function: {
                    name: "setta__run_lint",
                    arguments: { target: "frontend" },
                  },
                },
              ],
            },
            {
              id: "tool-msg-2",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "tool-call-2",
                  type: "function",
                  function: {
                    name: "setta__run_tests",
                    arguments: { target: "chat" },
                  },
                },
              ],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const toolCard = section.locator('[data-chat-assistant-tool-call-card="true"]');
      await expect(toolCard).toHaveCount(1);

      const toolSection = toolCard
        .first()
        .locator('[data-chat-tool-call-section="true"]')
        .first();
      await expect(toolSection).toBeVisible();
      await expect(toolSection).toContainText("Tool calls");
      await expect(
        toolSection.locator('[data-chat-tool-call-count-badge="true"]'),
      ).toHaveText("2");
      await expect(toolSection).toContainText("Stopped Mid-Tool Call");

      // Tool-call-only runs should not render a speech bubble.
      await expect(section.locator('[data-chat-assistant-bubble="true"]')).toHaveCount(0);

      // Interrupted tool calls should not show a running spinner state.
      await expect(toolSection.locator(".gg-spinner")).toHaveCount(0);

      await toolSection.getByText("Tool calls").click();

      const toolItems = toolSection.locator('[data-chat-tool-call-item="true"]');
      await expect(toolItems).toHaveCount(2);

      // Keep tool call rows close to full width with compact vertical height.
      const rowGeometry = await toolSection.evaluate((toolSectionElement) => {
        const firstItem = toolSectionElement.querySelector(
          '[data-chat-tool-call-item="true"]',
        );
        if (!firstItem) {
          return null;
        }
        const bubbleRect = toolSectionElement.getBoundingClientRect();
        const firstItemRect = firstItem.getBoundingClientRect();
        return {
          widthCoverage: firstItemRect.width / bubbleRect.width,
          leftGap: firstItemRect.left - bubbleRect.left,
          rowHeight: firstItemRect.height,
        };
      });

      expect(rowGeometry).not.toBeNull();
      if (!rowGeometry) {
        throw new Error("Missing tool call row geometry.");
      }
      expect(rowGeometry.widthCoverage).toBeGreaterThan(0.9);
      expect(rowGeometry.leftGap).toBeGreaterThanOrEqual(0);
      expect(rowGeometry.leftGap).toBeLessThanOrEqual(12);
      expect(rowGeometry.rowHeight).toBeLessThanOrEqual(42);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
