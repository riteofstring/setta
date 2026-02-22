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

      const toolCard = section.locator(
        '[data-chat-assistant-tool-call-card="true"]',
      );
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
      await expect(
        section.locator('[data-chat-assistant-bubble="true"]'),
      ).toHaveCount(0);

      // Interrupted tool calls should not show a running spinner state.
      await expect(toolSection.locator(".gg-spinner")).toHaveCount(0);

      await toolSection.getByText("Tool calls").click();

      const toolItems = toolSection.locator(
        '[data-chat-tool-call-item="true"]',
      );
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

  test("renders tool outputs with structured syntax highlighting for diff and yaml", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_tool_output_highlight__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "tool-highlight-msg-1",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "tool-highlight-call-1",
                  type: "function",
                  function: {
                    name: "file_change",
                    arguments: { path: "src/app.ts" },
                  },
                },
                {
                  id: "tool-highlight-call-2",
                  type: "function",
                  function: {
                    name: "mcp__workspace__read_file",
                    arguments: { path: "configs/app.yaml" },
                  },
                },
              ],
            },
            {
              id: "tool-highlight-result-1",
              role: "tool",
              tool_call_id: "tool-highlight-call-1",
              tool_name: "file_change",
              arguments: { path: "src/app.ts" },
              result: [
                "diff --git a/src/app.ts b/src/app.ts",
                "--- a/src/app.ts",
                "+++ b/src/app.ts",
                "@@ -1 +1 @@",
                "-const value = 1;",
                "+const value = 2;",
              ].join("\n"),
              is_error: false,
              content: [],
            },
            {
              id: "tool-highlight-result-2",
              role: "tool",
              tool_call_id: "tool-highlight-call-2",
              tool_name: "mcp__workspace__read_file",
              arguments: { path: "configs/app.yaml" },
              result: "name: setta\nenabled: true",
              is_error: false,
              content: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const actionSection = section
        .locator('[data-chat-action-section="true"]')
        .first();
      await expect(actionSection).toBeVisible();
      await actionSection.getByText("Actions").click();

      const actionItems = actionSection.locator(
        '[data-chat-action-item="true"]',
      );
      await expect(actionItems).toHaveCount(2);

      const diffItem = actionItems.nth(0);
      await diffItem.locator("button").first().click();
      const diffOutput = diffItem.locator(
        '[data-chat-structured-output-part="output"][data-chat-structured-output-kind="diff"]',
      );
      await expect(diffOutput).toBeVisible();
      await expect(
        diffOutput.locator('[data-chat-diff-line-kind="add"]'),
      ).toHaveCount(1);
      await expect(
        diffOutput.locator('[data-chat-diff-line-kind="del"]'),
      ).toHaveCount(1);

      const yamlItem = actionItems.nth(1);
      await yamlItem.locator("button").first().click();
      const yamlOutput = yamlItem.locator(
        '[data-chat-structured-output-part="output"][data-chat-structured-output-kind="code"][data-chat-structured-output-language="yaml"]',
      );
      await expect(yamlOutput).toBeVisible();
      await expect(yamlOutput).toContainText("name: setta");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("groups consecutive thoughts, actions, and tool calls under one parent activity accordion", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_activity_parent_grouping__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "activity-group-thought-1",
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: "Reviewing repository structure before changes.",
                  summary: "Reviewing structure",
                },
              ],
              attachments: [],
              tool_calls: null,
            },
            {
              id: "activity-group-action-1",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "activity-group-action-call-1",
                  type: "function",
                  function: {
                    name: "command_execution",
                    arguments: {
                      command: "rg --files frontend/src/components/Chat",
                    },
                  },
                },
              ],
            },
            {
              id: "activity-group-tool-1",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "activity-group-tool-call-1",
                  type: "function",
                  function: {
                    name: "setta__run_tests",
                    arguments: { target: "chat" },
                  },
                },
              ],
            },
            {
              id: "activity-group-action-result-1",
              role: "tool",
              tool_call_id: "activity-group-action-call-1",
              tool_name: "command_execution",
              arguments: { command: "rg --files frontend/src/components/Chat" },
              result: "frontend/src/components/Chat/ChatMessages.tsx",
              content: [],
              is_error: false,
            },
            {
              id: "activity-group-tool-result-1",
              role: "tool",
              tool_call_id: "activity-group-tool-call-1",
              tool_name: "setta__run_tests",
              arguments: { target: "chat" },
              result: { ok: true },
              content: [],
              is_error: false,
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const activitySections = section.locator(
        '[data-chat-assistant-activity-section="true"]',
      );
      await expect(activitySections).toHaveCount(1);

      await expect(
        section.locator('[data-chat-thinking-list-section="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-action-section="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-tool-call-section="true"]'),
      ).toHaveCount(1);

      await expect(
        section.locator('[data-chat-thinking-list-count-badge="true"]'),
      ).toHaveText("1");
      await expect(section).toContainText("Reviewing structure");
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
