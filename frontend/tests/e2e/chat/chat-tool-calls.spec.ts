import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
} from "../helpers";

test.describe.serial("chat tool calls", () => {
  test("groups tool calls in one activity container with dense full-width rows", async ({
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

      const toolSection = section
        .locator('[data-chat-assistant-activity-section="true"]')
        .first();
      await expect(toolSection).toBeVisible();
      await expect(
        toolSection.locator(
          '[data-chat-assistant-activity-count-badge="true"]',
        ),
      ).toHaveText("2");
      await expect(
        toolSection.locator('[data-chat-assistant-activity-icon="robot"]'),
      ).toHaveCount(1);
      await expect(
        toolSection.locator('[data-chat-assistant-tool-call-card="true"]'),
      ).toHaveCount(1);

      // Tool-call-only runs should not render a speech bubble.
      await expect(
        section.locator('[data-chat-assistant-bubble="true"]'),
      ).toHaveCount(0);

      // Interrupted tool calls should not show a running spinner state.
      await expect(toolSection.locator(".gg-spinner")).toHaveCount(0);

      const toolItems = toolSection.locator(
        '[data-chat-tool-call-item="true"]',
      );
      await expect(toolItems).toHaveCount(2);
      const activityTrigger = toolSection.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "false");
      const openAllButton = toolSection.locator(
        '[data-chat-assistant-activity-open-all-button="true"]',
      );
      await expect
        .poll(async () =>
          openAllButton.evaluate(
            (element) => Number(window.getComputedStyle(element).opacity),
          ),
        )
        .toBeLessThan(0.05);
      await activityTrigger.hover();
      await expect(openAllButton).toBeVisible();
      await expect
        .poll(async () =>
          openAllButton.evaluate(
            (element) => Number(window.getComputedStyle(element).opacity),
          ),
        )
        .toBeGreaterThan(0.9);
      await expect(openAllButton).toHaveText(/Open all/i);
      await expect(openAllButton).toHaveAttribute(
        "title",
        "Open all activity details",
      );
      const itemCopyButtons = toolSection.locator(
        '[data-chat-activity-item-copy-button="true"]',
      );
      await expect(itemCopyButtons).toHaveCount(0);
      await activityTrigger.hover();
      await openAllButton.evaluate(
        (element: HTMLButtonElement) => element.click(),
      );
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(openAllButton).toHaveText(/Close all/i);
      await expect(openAllButton).toHaveAttribute(
        "title",
        "Close all activity details",
      );
      await expect(
        toolSection.locator(
          '[data-chat-tool-call-item-trigger="true"][aria-expanded="true"]',
        ),
      ).toHaveCount(2);
      await expect(itemCopyButtons).toHaveCount(2);

      await activityTrigger.hover();
      await openAllButton.evaluate(
        (element: HTMLButtonElement) => element.click(),
      );
      await expect(openAllButton).toHaveText(/Open all/i);
      await expect(openAllButton).toHaveAttribute(
        "title",
        "Open all activity details",
      );
      await expect(
        toolSection.locator(
          '[data-chat-tool-call-item-trigger="true"][aria-expanded="false"]',
        ),
      ).toHaveCount(2);
      await expect(itemCopyButtons).toHaveCount(2);

      await activityTrigger.hover();
      await openAllButton.evaluate(
        (element: HTMLButtonElement) => element.click(),
      );
      await expect(openAllButton).toHaveText(/Close all/i);
      await expect(
        toolSection.locator(
          '[data-chat-tool-call-item-trigger="true"][aria-expanded="true"]',
        ),
      ).toHaveCount(2);
      await expect(itemCopyButtons).toHaveCount(2);
      await expect(activityTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      // Activity header should stay compact with inline title in wider widths,
      // and wrap the title below when the pane is narrow.
      const responsiveHeaderGeometry = await toolSection.evaluate(
        (toolSectionElement) => {
          const sectionElement = toolSectionElement as HTMLElement;
          const readHeaderGeometry = () => {
            const trigger = sectionElement.querySelector(
              '[data-chat-assistant-activity-trigger="true"]',
            );
            const countBadge = sectionElement.querySelector(
              '[data-chat-assistant-activity-count-badge="true"]',
            );
            const title = sectionElement.querySelector(
              '[data-chat-assistant-activity-latest="true"]',
            );
            if (!trigger || !countBadge || !title) {
              return null;
            }
            const triggerRect = trigger.getBoundingClientRect();
            const countRect = countBadge.getBoundingClientRect();
            const titleRect = title.getBoundingClientRect();
            const titleStyles = window.getComputedStyle(title);
            return {
              triggerHeight: triggerRect.height,
              sameLine: Math.abs(countRect.top - titleRect.top) <= 4,
              titleFlexGrow: titleStyles.flexGrow,
              titleFlexBasis: titleStyles.flexBasis,
            };
          };

          const originalWidth = sectionElement.style.width;
          const originalMaxWidth = sectionElement.style.maxWidth;

          sectionElement.style.width = "760px";
          sectionElement.style.maxWidth = "760px";
          const wide = readHeaderGeometry();

          sectionElement.style.width = "255px";
          sectionElement.style.maxWidth = "255px";
          const narrow = readHeaderGeometry();

          sectionElement.style.width = originalWidth;
          sectionElement.style.maxWidth = originalMaxWidth;

          return { wide, narrow };
        },
      );

      expect(responsiveHeaderGeometry.wide).not.toBeNull();
      expect(responsiveHeaderGeometry.narrow).not.toBeNull();
      if (!responsiveHeaderGeometry.wide || !responsiveHeaderGeometry.narrow) {
        throw new Error("Missing responsive activity header geometry.");
      }
      expect(responsiveHeaderGeometry.wide.sameLine).toBe(true);
      expect(responsiveHeaderGeometry.wide.triggerHeight).toBeLessThanOrEqual(
        38,
      );
      expect(responsiveHeaderGeometry.wide.titleFlexGrow).toBe("1");
      expect(responsiveHeaderGeometry.wide.titleFlexBasis).toBe("auto");
      expect(responsiveHeaderGeometry.narrow.sameLine).toBe(false);
      expect(
        responsiveHeaderGeometry.narrow.triggerHeight,
      ).toBeGreaterThanOrEqual(32);
      expect(responsiveHeaderGeometry.narrow.titleFlexGrow).toBe("0");
      expect(responsiveHeaderGeometry.narrow.titleFlexBasis).toContain("100");

      await activityTrigger.click();
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(itemCopyButtons).toHaveCount(0);

      await activityTrigger.click();
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(itemCopyButtons).toHaveCount(2);

      const itemCopyClassName = await itemCopyButtons
        .first()
        .getAttribute("class");
      expect(itemCopyClassName ?? "").toContain("transition-opacity");
      expect(itemCopyClassName ?? "").not.toContain("absolute");

      const itemCopyLayout = await toolSection.evaluate(
        (toolSectionElement) => {
          const firstItem = toolSectionElement.querySelector(
            '[data-chat-tool-call-item="true"]',
          );
          const trigger = firstItem?.querySelector(
            '[data-chat-tool-call-item-trigger="true"]',
          );
          const copyButton = firstItem?.querySelector(
            '[data-chat-activity-item-copy-button="true"]',
          );
          if (!firstItem || !trigger || !copyButton) {
            return null;
          }
          const triggerRect = trigger.getBoundingClientRect();
          const copyRect = copyButton.getBoundingClientRect();
          const firstItemRect = firstItem.getBoundingClientRect();
          return {
            triggerRight: triggerRect.right,
            copyLeft: copyRect.left,
            copyWidth: copyRect.width,
            rowLeft: firstItemRect.left,
            rowRight: firstItemRect.right,
          };
        },
      );
      expect(itemCopyLayout).not.toBeNull();
      if (!itemCopyLayout) {
        throw new Error("Missing activity item copy button layout geometry.");
      }
      expect(itemCopyLayout.copyLeft).toBeGreaterThanOrEqual(
        itemCopyLayout.rowLeft,
      );
      expect(itemCopyLayout.copyLeft + itemCopyLayout.copyWidth).toBeLessThanOrEqual(
        itemCopyLayout.rowRight + 1,
      );
      expect(itemCopyLayout.copyWidth).toBeGreaterThanOrEqual(20);

      // Keep tool call rows close to full width with compact vertical height.
      const firstToolItemTrigger = toolSection
        .locator('[data-chat-tool-call-item-trigger="true"]')
        .first();
      await firstToolItemTrigger.click();
      await expect(firstToolItemTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
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
      expect(rowGeometry.leftGap).toBeLessThanOrEqual(18);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("keeps parent and child activity elapsed timers visible after refresh when timestamps are available", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_activity_elapsed_timers__",
      );

      const setState = async () => {
        await setChatSectionState(page, {
          projectConfigId: projectContext.projectConfigId,
          sectionId,
          state: {
            messages: [
              {
                id: "activity-timer-assistant",
                role: "assistant",
                content: [],
                attachments: [],
                tool_calls: [
                  {
                    id: "activity-timer-call-1",
                    type: "function",
                    function: {
                      name: "command_execution",
                      arguments: { command: "rg --files frontend/src" },
                    },
                  },
                  {
                    id: "activity-timer-call-2",
                    type: "function",
                    function: {
                      name: "setta__run_tests",
                      arguments: { target: "chat" },
                    },
                  },
                ],
              },
              {
                id: "activity-timer-result-1",
                role: "tool",
                tool_call_id: "activity-timer-call-1",
                tool_name: "command_execution",
                arguments: { command: "rg --files frontend/src" },
                result: "frontend/src/components/Chat/ChatMessages.tsx",
                content: [],
                is_error: false,
                started_at: "2026-01-01T00:00:00Z",
                completed_at: "2026-01-01T00:00:05Z",
              },
              {
                id: "activity-timer-result-2",
                role: "tool",
                tool_call_id: "activity-timer-call-2",
                tool_name: "setta__run_tests",
                arguments: { target: "chat" },
                result: { ok: true },
                content: [],
                is_error: false,
                started_at: "2026-01-01T00:00:06Z",
                completed_at: "2026-01-01T00:00:08Z",
              },
            ],
            inputText: "",
            waitingForResponse: false,
            toolCallArguments: {},
          },
        });
      };

      await setState();

      let section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const activityTrigger = section.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(
        section.locator('[data-chat-assistant-activity-total-timer="true"]'),
      ).toHaveText("00:08");
      await activityTrigger.click();
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");
      const itemTimers = section.locator(
        '[data-chat-activity-item-timer="true"]',
      );
      const itemTimestamps = section.locator(
        '[data-chat-activity-item-timestamp="true"]',
      );
      await expect(itemTimers).toHaveCount(2);
      await expect(itemTimestamps).toHaveCount(2);
      await expect(itemTimestamps.nth(0)).toHaveText(/\d{1,2}:\d{2}/);
      await expect(itemTimestamps.nth(1)).toHaveText(/\d{1,2}:\d{2}/);
      await expect(itemTimers.nth(0)).toHaveText("00:05");
      await expect(itemTimers.nth(1)).toHaveText("00:02");

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");
      section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const refreshedActivityTrigger = section.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      await expect(refreshedActivityTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(
        section.locator('[data-chat-assistant-activity-total-timer="true"]'),
      ).toHaveText("00:08");
      await refreshedActivityTrigger.click();
      await expect(refreshedActivityTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(
        section.locator('[data-chat-activity-item-timer="true"]'),
      ).toHaveCount(2);
      await expect(
        section.locator('[data-chat-activity-item-timestamp="true"]'),
      ).toHaveCount(2);
      await expect(
        section.locator('[data-chat-activity-item-timer="true"]').nth(0),
      ).toHaveText("00:05");
      await expect(
        section.locator('[data-chat-activity-item-timer="true"]').nth(1),
      ).toHaveText("00:02");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows chat and activity timestamps and stacks assistant actions in narrow chat panes", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const userCreatedAtMs = Date.parse("2026-01-01T09:15:00Z");
      const assistantCreatedAtMs = Date.parse("2026-01-01T09:16:00Z");
      const activityStartedAtMs = Date.parse("2026-01-01T09:16:05Z");
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_timestamps_and_actions__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "timestamp-user-message",
              role: "user",
              content: [{ type: "text", text: "Please summarize the latest run." }],
              attachments: [],
              createdAt: userCreatedAtMs,
            },
            {
              id: "timestamp-assistant-message",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "The latest run passed, and I kept the activity details below.",
                },
              ],
              attachments: [],
              tool_calls: [
                {
                  id: "timestamp-assistant-tool-call",
                  type: "function",
                  function: {
                    name: "command_execution",
                    arguments: { command: "pnpm exec vitest run src/components/Chat" },
                  },
                },
              ],
              createdAt: assistantCreatedAtMs,
            },
            {
              id: "timestamp-assistant-tool-result",
              role: "tool",
              tool_call_id: "timestamp-assistant-tool-call",
              tool_name: "command_execution",
              arguments: { command: "pnpm exec vitest run src/components/Chat" },
              result: "PASS src/components/Chat/ChatMessages.test.tsx",
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

      await expect(
        section.locator('[data-chat-message-timestamp="true"]'),
      ).toHaveCount(2);
      await expect(
        section.locator('[data-chat-message-timestamp="true"]').nth(0),
      ).toHaveText(/\d{1,2}:\d{2}/);
      await expect(
        section.locator('[data-chat-message-timestamp="true"]').nth(1),
      ).toHaveText(/\d{1,2}:\d{2}/);
      await expect(
        section.locator('[data-chat-message-timestamp="true"]').nth(0),
      ).toHaveAttribute(
        "title",
        formatExpectedChatTimestampTitle(userCreatedAtMs),
      );
      await expect(
        section.locator('[data-chat-message-timestamp="true"]').nth(1),
      ).toHaveAttribute(
        "title",
        formatExpectedChatTimestampTitle(assistantCreatedAtMs),
      );

      const activityTrigger = section.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      await activityTrigger.click();
      await expect(
        section.locator('[data-chat-activity-item-timestamp="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-activity-item-timestamp="true"]').first(),
      ).toHaveText(/\d{1,2}:\d{2}/);
      await expect(
        section.locator('[data-chat-activity-item-timestamp="true"]').first(),
      ).toHaveAttribute(
        "title",
        formatExpectedChatTimestampTitle(activityStartedAtMs),
      );

      await section.evaluate((element) => {
        const sectionElement = element as HTMLElement;
        sectionElement.style.width = "235px";
        sectionElement.style.maxWidth = "235px";
      });
      const assistantBubble = section
        .locator('[data-chat-assistant-bubble="true"]')
        .first();
      await assistantBubble.hover();

      const actions = section.locator('[data-chat-message-actions="true"]').last();
      await expect(actions).toBeVisible();
      await expect
        .poll(async () =>
          actions.evaluate(
            (element) => window.getComputedStyle(element).flexDirection,
          ),
        )
        .toBe("column");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows a message timestamp for activity-only assistant messages", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_activity_only_message_timestamp__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "activity-only-assistant-message",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "activity-only-assistant-tool-call",
                  type: "function",
                  function: {
                    name: "command_execution",
                    arguments: {
                      command: "pnpm exec vitest run src/components/Chat",
                    },
                  },
                },
              ],
              createdAt: Date.parse("2026-01-01T09:16:00Z"),
            },
            {
              id: "activity-only-assistant-tool-result",
              role: "tool",
              tool_call_id: "activity-only-assistant-tool-call",
              tool_name: "command_execution",
              arguments: {
                command: "pnpm exec vitest run src/components/Chat",
              },
              result: "PASS src/components/Chat/ChatMessages.test.tsx",
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

      await expect(
        section.locator('[data-chat-assistant-bubble="true"]'),
      ).toHaveCount(0);
      await expect(
        section.locator('[data-chat-assistant-activity-section="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-message-timestamp="true"]'),
      ).toHaveCount(1);
      await expect(
        section.locator('[data-chat-message-timestamp="true"]').first(),
      ).toHaveText(/\d{1,2}:\d{2}/);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("message timestamps do not collapse chat bubbles into narrow columns", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_message_timestamp_bubble_width__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const userMessageText =
        "Please create a simple app. Feel free to spawn subagents to do this. You can choose what to create.";
      const assistantMessageText =
        "Hello. I can help with that and outline the first implementation pass.";

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "timestamp-user-message",
              role: "user",
              content: [{ type: "text", text: userMessageText }],
              attachments: [],
              createdAt: Date.parse("2026-01-01T18:29:00Z"),
            },
            {
              id: "timestamp-assistant-message",
              role: "assistant",
              content: [{ type: "text", text: assistantMessageText }],
              attachments: [],
              createdAt: Date.parse("2026-01-01T18:30:00Z"),
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const userGroup = getMessageGroup(section, userMessageText);
      const assistantGroup = getMessageGroup(section, assistantMessageText);
      const userBubble = userGroup.locator('[data-chat-user-bubble="true"]').first();
      const assistantBubble = assistantGroup
        .locator('[data-chat-assistant-bubble="true"]')
        .first();
      await section.evaluate((element) => {
        const sectionElement = element as HTMLElement;
        sectionElement.style.width = "340px";
        sectionElement.style.maxWidth = "340px";
      });
      await userBubble.scrollIntoViewIfNeeded();
      await assistantBubble.scrollIntoViewIfNeeded();
      await expect(userBubble).toBeVisible();
      await expect(assistantBubble).toBeVisible();

      await expect.poll(() => getBubbleWidth(userBubble)).toBeGreaterThan(120);
      await expect
        .poll(() => getBubbleWidth(assistantBubble))
        .toBeGreaterThan(120);
      await expect
        .poll(() => getHorizontalOverflowMetrics(userBubble))
        .toMatchObject({
          overflowPx: 0,
          hasScrollOverflow: false,
        });
      await expect
        .poll(() => getHorizontalOverflowMetrics(assistantBubble))
        .toMatchObject({
          overflowPx: 0,
          hasScrollOverflow: false,
        });
      await expect(
        section.locator('[data-chat-message-timestamp="true"]'),
      ).toHaveCount(2);
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
                    arguments: {
                      path: "configs/app.yaml",
                      options: { followSymlinks: true },
                    },
                  },
                },
                {
                  id: "tool-highlight-call-3",
                  type: "function",
                  function: {
                    name: "command_execution",
                    arguments: { command: "ls -la" },
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
              arguments: {
                path: "configs/app.yaml",
                options: { followSymlinks: true },
              },
              result: "name: setta\nenabled: true",
              is_error: false,
              content: [],
            },
            {
              id: "tool-highlight-result-3",
              role: "tool",
              tool_call_id: "tool-highlight-call-3",
              tool_name: "command_execution",
              arguments: { command: "ls -la" },
              result: "line 1\nline 2",
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
        .locator('[data-chat-assistant-activity-items="true"]')
        .first();
      const activityTrigger = section
        .locator('[data-chat-assistant-activity-trigger="true"]')
        .first();
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "false");
      await activityTrigger.click();
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(actionSection).toBeVisible();
      const activityContentClassName = await section
        .locator('[data-chat-assistant-activity-content="true"]')
        .first()
        .getAttribute("class");
      expect(activityContentClassName ?? "").not.toContain("animate-slide");
      const actionItems = actionSection.locator(
        '[data-chat-action-item="true"]',
      );
      await expect(actionItems).toHaveCount(3);

      const diffItem = actionItems.nth(0);
      await diffItem.locator('[data-chat-action-item-trigger="true"]').click();
      const actionItemContentClassName = await diffItem
        .locator('[data-chat-action-item-content="true"]')
        .getAttribute("class");
      expect(actionItemContentClassName ?? "").not.toContain("animate-slide");
      const diffOutput = diffItem.locator(
        '[data-chat-structured-output-part="output"][data-chat-structured-output-kind="diff"]',
      );
      await expect(diffOutput).toBeVisible();
      await expect(diffOutput.locator(".cm-gitdiff-add")).toHaveCount(1);
      await expect(diffOutput.locator(".cm-gitdiff-del")).toHaveCount(1);

      const yamlItem = actionItems.nth(1);
      await yamlItem.locator('[data-chat-action-item-trigger="true"]').click();
      const yamlOutput = yamlItem.locator(
        '[data-chat-structured-output-part="output"][data-chat-structured-output-kind="code"][data-chat-structured-output-language="yaml"]',
      );
      await expect(yamlOutput).toBeVisible();
      await expect(yamlOutput).toContainText("name: setta");
      const jsonInput = yamlItem.locator(
        '[data-chat-structured-output-part="input"][data-chat-structured-output-kind="code"][data-chat-structured-output-language="json"]',
      );
      await expect(jsonInput).toBeVisible();
      const jsonIndentation = await jsonInput.evaluate((element) => {
        const lines = Array.from(element.querySelectorAll(".cm-line")).map(
          (line) => line.textContent ?? "",
        );
        return (
          lines.some((line) => line.startsWith('  "options"')) &&
          lines.some((line) => line.startsWith('    "followSymlinks"'))
        );
      });
      expect(jsonIndentation).toBe(true);

      const plainItem = actionItems.nth(2);
      await plainItem.locator('[data-chat-action-item-trigger="true"]').click();
      const plainOutput = plainItem.locator(
        '[data-chat-structured-output-part="output"][data-chat-structured-output-kind="plain"]',
      );
      await expect(plainOutput).toBeVisible();
      await expect(plainOutput).toContainText("line 1");
      await expect(plainOutput.locator(".cm-line")).toHaveCount(2);

      const paneLocator = actionSection.locator(
        '[data-chat-structured-output-pane="true"]',
      );
      const handleLocator = actionSection.locator(
        '[data-chat-structured-output-resize-handle="true"]',
      );
      const paneCount = await paneLocator.count();
      expect(paneCount).toBeGreaterThan(0);
      await expect(handleLocator).toHaveCount(paneCount);
      const handleEdges = await handleLocator.evaluateAll((elements) =>
        elements.map((element) =>
          element.getAttribute("data-chat-structured-output-resize-handle-edge"),
        ),
      );
      expect(handleEdges.every((edge) => edge === "bottom")).toBe(true);
      const paneStyles = await paneLocator.evaluateAll((elements) =>
        elements.map((element) => {
          const style = window.getComputedStyle(element as HTMLElement);
          return {
            maxHeight: style.maxHeight,
            overflowY: style.overflowY,
          };
        }),
      );
      expect(
        paneStyles.every(
          (paneStyle) =>
            paneStyle.maxHeight === "260px" && paneStyle.overflowY === "auto",
        ),
      ).toBe(true);

      const plainOutputPane = plainItem.locator(
        '[data-chat-structured-output-pane-part="output"]',
      );
      await expect(plainOutputPane).toHaveCount(1);
      const plainOutputBottomHandle = plainItem.locator(
        '[data-chat-structured-output-resize-handle-part="output"][data-chat-structured-output-resize-handle-edge="bottom"]',
      );
      await expect(plainOutputBottomHandle).toHaveCount(1);
      await plainOutputBottomHandle.scrollIntoViewIfNeeded();
      await page.mouse.move(10, 10);
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      });
      const handleOpacityBeforeHover = await plainOutputBottomHandle.evaluate(
        (element) =>
          Number.parseFloat(
            window.getComputedStyle(element as HTMLElement).opacity,
          ),
      );
      expect(handleOpacityBeforeHover).toBeLessThan(0.5);
      await plainOutputPane.hover();
      await expect
        .poll(async () =>
          plainOutputBottomHandle.evaluate((element) =>
            Number.parseFloat(
              window.getComputedStyle(element as HTMLElement).opacity,
            ),
          ),
        )
        .toBeGreaterThan(0.9);
      const beforeResizeGeometry = await plainOutputPane.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      });
      const bottomHandleBox = await plainOutputBottomHandle.boundingBox();
      if (!bottomHandleBox) {
        throw new Error("Expected output pane bottom resize handle bounds.");
      }
      const paneBottomY =
        beforeResizeGeometry.top + beforeResizeGeometry.height;
      const handleCenterY = bottomHandleBox.y + bottomHandleBox.height / 2;
      // The visual bar should sit on the pane border while retaining a larger
      // hit area around it.
      expect(Math.abs(handleCenterY - paneBottomY)).toBeLessThan(6);

      const handleCenterX = bottomHandleBox.x + bottomHandleBox.width / 2;
      await page.mouse.move(
        handleCenterX,
        handleCenterY,
      );
      await page.mouse.down();
      await page.mouse.move(handleCenterX, handleCenterY + 1, { steps: 1 });
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      });
      const afterInitialDragGeometry = await plainOutputPane.evaluate(
        (element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, height: rect.height };
        },
      );
      // A tiny initial drag should not force a jump to a larger baseline size.
      expect(
        Math.abs(afterInitialDragGeometry.height - beforeResizeGeometry.height),
      ).toBeLessThan(12);
      await page.mouse.move(
        handleCenterX,
        handleCenterY + 120,
        { steps: 12 },
      );
      await page.mouse.up();
      const afterResizeGeometry = await plainOutputPane.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      });
      expect(afterResizeGeometry.height).toBeGreaterThan(
        beforeResizeGeometry.height + 60,
      );
      await page.mouse.move(10, 10);
      await expect
        .poll(async () =>
          plainOutputBottomHandle.evaluate((element) =>
            Number.parseFloat(
              window.getComputedStyle(element as HTMLElement).opacity,
            ),
          ),
        )
        .toBeLessThan(0.2);
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
      await expect(section).toContainText(
        "Subagent: research_profile",
      );

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

      await section.locator('[data-chat-assistant-activity-trigger="true"]').click();
      const toolCallTrigger = section
        .locator('[data-chat-tool-call-item-trigger="true"]')
        .first();
      await expect(toolCallTrigger).toBeVisible();
      await expect(toolCallTrigger).toHaveClass(/bg-setta-50\/95/);
      await expect(toolCallTrigger).toHaveClass(/hover:bg-setta-100\/95/);
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

async function getHorizontalOverflowMetrics(
  bubble: Locator,
): Promise<{
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
      hasScrollOverflow: bubbleElement.scrollWidth > bubbleElement.clientWidth + 1,
    };
  });
}

function formatExpectedChatTimestampTitle(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(timestampMs);
}
