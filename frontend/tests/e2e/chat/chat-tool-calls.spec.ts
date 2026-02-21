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
              content: [{ type: "text", text: "Tool section density check" }],
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

      const messageGroup = getMessageGroup(section, "Tool section density check");
      await expect(messageGroup).toBeVisible();

      const toolSection = messageGroup
        .locator('[data-chat-tool-call-section="true"]')
        .first();
      await expect(toolSection).toBeVisible();
      await expect(toolSection).toContainText("Tool calls (2)");
      await expect(toolSection).toContainText("Stopped Mid-Tool Call");

      // Interrupted tool calls should not show a running spinner state.
      await expect(messageGroup.locator(".gg-spinner")).toHaveCount(0);

      await messageGroup.getByText("Tool calls (2)").click();

      const toolItems = messageGroup.locator('[data-chat-tool-call-item="true"]');
      await expect(toolItems).toHaveCount(2);

      // Keep tool call rows close to full width with compact vertical height.
      const rowGeometry = await messageGroup.evaluate((group) => {
        const bubble = group.querySelector('[data-chat-assistant-bubble="true"]');
        const firstItem = group.querySelector('[data-chat-tool-call-item="true"]');
        if (!bubble || !firstItem) {
          return null;
        }
        const bubbleRect = bubble.getBoundingClientRect();
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
      expect(rowGeometry.widthCoverage).toBeGreaterThan(0.78);
      expect(rowGeometry.leftGap).toBeGreaterThanOrEqual(0);
      expect(rowGeometry.leftGap).toBeLessThanOrEqual(20);
      expect(rowGeometry.rowHeight).toBeLessThanOrEqual(42);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

function getMessageGroup(container: Locator, text: string): Locator {
  return container.locator("div.group").filter({ hasText: text }).first();
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
