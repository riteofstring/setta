import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
} from "../helpers";

test.describe.serial("chat tool calls", () => {
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
        section.locator('[data-chat-thinking-section="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-assistant-activity-items="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-assistant-activity-count-badge="true"]'),
      ).toHaveText("3");
      await expect(
        section.locator('[data-chat-action-item="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-tool-call-item="true"]'),
      ).toHaveCount(1);

      await expect(section).toContainText("Reviewing structure");

      const activityTrigger = section.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      const openAllButton = section.locator(
        '[data-chat-assistant-activity-open-all-button="true"]',
      );
      await activityTrigger.focus();
      await expect(openAllButton).toBeVisible();
      await openAllButton.click();
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(
        section.locator(
          '[data-chat-thinking-trigger="true"][aria-expanded="true"]',
        ),
      ).toHaveCount(1);
      await expect(
        section.locator(
          '[data-chat-action-item-trigger="true"][aria-expanded="true"]',
        ),
      ).toHaveCount(1);
      await expect(
        section.locator(
          '[data-chat-tool-call-item-trigger="true"][aria-expanded="true"]',
        ),
      ).toHaveCount(1);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("renders active terminal and subagent rows with dedicated runtime details", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_runtime_terminal_subagent_rows__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "runtime-rows-assistant",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "runtime-terminal-call",
                  type: "function",
                  function: {
                    name: "command_execution",
                    arguments: {
                      command: "pnpm exec vitest run src/components/Chat",
                    },
                  },
                },
                {
                  id: "runtime-subagent-call",
                  type: "function",
                  function: {
                    name: "mcp__setta__run_agent_profile",
                    arguments: {
                      profileId: "research_profile",
                      inputs: {
                        prompt: "Inspect the runtime activity row rendering.",
                      },
                    },
                  },
                },
              ],
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
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(
        section.locator('[data-chat-assistant-activity-count-badge="true"]'),
      ).toHaveText("2");
      await expect(section).toContainText("Subagent: research_profile");

      await activityTrigger.click();
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");

      // Dedicated runtime rows should replace the generic action/tool rows.
      await expect(
        section.locator('[data-chat-terminal-item="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-subagent-item="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-action-item="true"]'),
      ).toHaveCount(0);
      await expect(
        section.locator('[data-chat-tool-call-item="true"]'),
      ).toHaveCount(0);

      const terminalRow = section.locator('[data-chat-terminal-item="true"]');
      await terminalRow
        .locator('[data-chat-terminal-item-trigger="true"]')
        .click();
      await expect(
        terminalRow.locator('[data-chat-terminal-item-content="true"]'),
      ).toBeVisible();
      await expect(terminalRow).toContainText("Terminal preview");
      await expect(terminalRow).toContainText(
        "pnpm exec vitest run src/components/Chat",
      );

      const subagentRow = section.locator('[data-chat-subagent-item="true"]');
      await subagentRow
        .locator('[data-chat-subagent-item-trigger="true"]')
        .click();
      await expect(
        subagentRow.locator('[data-chat-subagent-item-content="true"]'),
      ).toBeVisible();
      await expect(subagentRow).toContainText("Subagent details");
      await expect(subagentRow).toContainText("research_profile");
      await expect(subagentRow).toContainText(
        "Inspect the runtime activity row rendering.",
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("uses light-mode activity row surfaces instead of dark-only tool-call cards", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await page.evaluate(async () => {
        const { useLocalStorage } = await import("/src/state/definitions.ts");
        useLocalStorage.setState({
          colorMode: "light",
          darkMode: false,
        });
      });

      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_light_mode_tool_rows__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "light-tool-mode-message",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "light-tool-mode-call",
                  type: "function",
                  function: {
                    name: "setta__run_tests",
                    arguments: { target: "chat" },
                  },
                },
              ],
            },
            {
              id: "light-tool-mode-result",
              role: "tool",
              tool_call_id: "light-tool-mode-call",
              tool_name: "setta__run_tests",
              arguments: { target: "chat" },
              result: { ok: true },
              content: [],
              is_error: false,
              started_at: "2026-01-01T09:16:05Z",
              completed_at: "2026-01-01T09:16:15Z",
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      await section
        .locator('[data-chat-assistant-activity-trigger="true"]')
        .click();
      const toolCallTrigger = section
        .locator('[data-chat-tool-call-item-trigger="true"]')
        .first();
      await expect(toolCallTrigger).toBeVisible();
      await expect(toolCallTrigger).toHaveClass(/bg-setta-50\/95/);
      await expect(toolCallTrigger).toHaveClass(/hover:bg-setta-100\/95/);

      await toolCallTrigger.click();
      const toolCallResultPanel = section
        .locator('[data-chat-tool-call-item-content="true"] > div')
        .nth(1);
      await expect(toolCallResultPanel).toBeVisible();
      await expect(toolCallResultPanel).toHaveClass(/bg-white\/95/);
      await expect(toolCallResultPanel).not.toHaveClass(/bg-setta-200/);
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

function getMessageGroup(section: Locator, text: string): Locator {
  return section.locator("[data-message-id]").filter({ hasText: text }).first();
}

async function getBubbleWidth(bubble: Locator): Promise<number> {
  return bubble.evaluate((element) => element.getBoundingClientRect().width);
}

async function getHorizontalOverflowMetrics(bubble: Locator): Promise<{
  overflowPx: number;
  hasScrollOverflow: boolean;
}> {
  return bubble.evaluate((element) => {
    const bubbleElement = element as HTMLElement;
    const bubbleRect = bubbleElement.getBoundingClientRect();
    let overflowPx = 0;
    for (const child of Array.from(bubbleElement.querySelectorAll("*"))) {
      const childRect = child.getBoundingClientRect();
      overflowPx = Math.max(
        overflowPx,
        Math.ceil(childRect.right - bubbleRect.right),
      );
    }
    return {
      overflowPx: Math.max(overflowPx, 0),
      hasScrollOverflow:
        bubbleElement.scrollWidth > bubbleElement.clientWidth + 1,
    };
  });
}

function formatExpectedChatTimestampTitle(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(timestampMs);
}
