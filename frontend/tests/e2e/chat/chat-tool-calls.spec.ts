import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
} from "../helpers";
import {
  findSectionByName,
  formatExpectedChatTimestampTitle,
  getBubbleWidth,
  getHorizontalOverflowMetrics,
  getMessageGroup,
} from "./chat-tool-calls-helpers";

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
          openAllButton.evaluate((element) =>
            Number(window.getComputedStyle(element).opacity),
          ),
        )
        .toBeLessThan(0.05);
      await activityTrigger.hover();
      await expect(openAllButton).toBeVisible();
      await expect
        .poll(async () =>
          openAllButton.evaluate((element) =>
            Number(window.getComputedStyle(element).opacity),
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
      await activityTrigger.focus();
      await openAllButton.click();
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

      await activityTrigger.focus();
      await openAllButton.click();
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

      await activityTrigger.focus();
      await openAllButton.click();
      await expect(openAllButton).toHaveText(/Close all/i);
      await expect(
        toolSection.locator(
          '[data-chat-tool-call-item-trigger="true"][aria-expanded="true"]',
        ),
      ).toHaveCount(2);
      await expect(itemCopyButtons).toHaveCount(2);
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");

      // The parent activity header keeps the controls on the top row and the
      // latest preview text on its own row beneath, regardless of width.
      const responsiveHeaderGeometry = await toolSection.evaluate(
        (toolSectionElement) => {
          const sectionElement = toolSectionElement as HTMLElement;
          const readHeaderGeometry = () => {
            const trigger = sectionElement.querySelector(
              '[data-chat-assistant-activity-trigger="true"]',
            );
            const headerRow = sectionElement.querySelector(
              '[data-chat-assistant-activity-header-row="true"]',
            );
            const topRow = sectionElement.querySelector(
              '[data-chat-assistant-activity-header-top-row="true"]',
            );
            const primaryLabel = sectionElement.querySelector(
              '[data-chat-assistant-activity-primary-label="true"]',
            );
            const hoverMeta = sectionElement.querySelector(
              '[data-chat-assistant-activity-hover-meta="true"]',
            );
            if (
              !trigger ||
              !headerRow ||
              !topRow ||
              !primaryLabel ||
              !hoverMeta
            ) {
              return null;
            }
            const triggerRect = trigger.getBoundingClientRect();
            const headerRowRect = headerRow.getBoundingClientRect();
            const topRowRect = topRow.getBoundingClientRect();
            const primaryLabelRect = primaryLabel.getBoundingClientRect();
            const hoverMetaRect = hoverMeta.getBoundingClientRect();
            return {
              triggerHeight: triggerRect.height,
              primaryLabelText: primaryLabel.textContent?.trim() ?? "",
              hasSeparateActionPreviewRow:
                sectionElement.querySelector(
                  '[data-chat-assistant-activity-preview-row="true"]',
                ) !== null,
              hasThoughtPreviewShell:
                sectionElement.querySelector(
                  '[data-chat-assistant-activity-thought-preview-shell="true"]',
                ) !== null,
              primaryLabelWithinTopRow:
                primaryLabelRect.top >= topRowRect.top - 1 &&
                primaryLabelRect.bottom <= topRowRect.bottom + 1,
              hoverMetaWithinTopRow:
                hoverMetaRect.top >= headerRowRect.top - 1 &&
                hoverMetaRect.bottom <= topRowRect.bottom + 1,
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
      expect(responsiveHeaderGeometry.wide.primaryLabelText).toContain(
        "setta__run_tests",
      );
      expect(responsiveHeaderGeometry.wide.hasSeparateActionPreviewRow).toBe(
        false,
      );
      expect(responsiveHeaderGeometry.wide.hasThoughtPreviewShell).toBe(false);
      expect(responsiveHeaderGeometry.wide.primaryLabelWithinTopRow).toBe(true);
      expect(responsiveHeaderGeometry.wide.hoverMetaWithinTopRow).toBe(true);
      expect(responsiveHeaderGeometry.narrow.primaryLabelText).toContain(
        "setta__run_tests",
      );
      expect(responsiveHeaderGeometry.narrow.hasSeparateActionPreviewRow).toBe(
        false,
      );
      expect(responsiveHeaderGeometry.narrow.hasThoughtPreviewShell).toBe(
        false,
      );
      expect(responsiveHeaderGeometry.narrow.primaryLabelWithinTopRow).toBe(
        true,
      );
      expect(responsiveHeaderGeometry.narrow.hoverMetaWithinTopRow).toBe(true);

      const firstChildTrigger = toolSection
        .locator('[data-chat-tool-call-item-trigger="true"]')
        .first();
      await firstChildTrigger.click();
      await expect(firstChildTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(openAllButton).toHaveText(/Open all/i);

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
      expect(
        itemCopyLayout.copyLeft + itemCopyLayout.copyWidth,
      ).toBeLessThanOrEqual(itemCopyLayout.rowRight + 1);
      expect(itemCopyLayout.copyWidth).toBeGreaterThanOrEqual(20);

      // Keep tool call rows close to full width with compact vertical height.
      const firstToolItemTrigger = toolSection
        .locator('[data-chat-tool-call-item-trigger="true"]')
        .first();
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
              content: [
                { type: "text", text: "Please summarize the latest run." },
              ],
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
                    arguments: {
                      command: "pnpm exec vitest run src/components/Chat",
                    },
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

      const actions = section
        .locator('[data-chat-message-actions="true"]')
        .last();
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

  test("uses activity-row timestamps instead of a separate message footer for activity-only assistant messages", async ({
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
      ).toHaveCount(0);
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
        formatExpectedChatTimestampTitle(Date.parse("2026-01-01T09:16:05Z")),
      );
      await expect(
        section
          .locator('[data-chat-assistant-activity-trigger="true"]')
          .first()
          .evaluate(
            (element) =>
              element.querySelector('[data-chat-message-timestamp="true"]') ===
              null,
          ),
      ).resolves.toBe(true);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows timestamps on thinking activity rows", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_thinking_row_timestamp__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const thinkingCreatedAtMs = Date.parse("2026-01-01T09:16:00Z");

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "thinking-timestamp-assistant-message",
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking:
                    "Reviewing the implementation plan before producing the final answer.",
                  summary: "Reviewing the implementation plan.",
                  signature: null,
                },
              ],
              attachments: [],
              tool_calls: null,
              createdAt: thinkingCreatedAtMs,
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
      await activityTrigger.click();

      const activityTimestamps = section.locator(
        '[data-chat-activity-item-timestamp="true"]',
      );
      await expect(activityTimestamps).toHaveCount(1);
      await expect(activityTimestamps.first()).toHaveText(/\d{1,2}:\d{2}/);
      await expect(activityTimestamps.first()).toHaveAttribute(
        "title",
        formatExpectedChatTimestampTitle(thinkingCreatedAtMs),
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("hides the parent thought preview only when the referenced thought row is open and keeps child timestamps hover-only", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_activity_hover_meta_and_summary__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "activity-hover-meta-assistant-message",
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking:
                    "Inspecting the graph state before applying a cleanup.",
                  summary: "Graph state inspection summary",
                  signature: null,
                },
              ],
              attachments: [],
              tool_calls: [
                {
                  id: "activity-hover-meta-tool-call",
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
              id: "activity-hover-meta-tool-result",
              role: "tool",
              tool_call_id: "activity-hover-meta-tool-call",
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
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const activityTrigger = section.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      await activityTrigger.click();
      const previewShell = section.locator(
        '[data-chat-assistant-activity-thought-preview-shell="true"]',
      );
      await expect(previewShell).toHaveAttribute(
        "data-chat-assistant-activity-thought-preview-visible",
        "true",
      );

      const toolTrigger = section
        .locator('[data-chat-action-item-trigger="true"]')
        .first();
      await toolTrigger.click();
      await expect(previewShell).toHaveAttribute(
        "data-chat-assistant-activity-thought-preview-visible",
        "true",
      );

      const thinkingTrigger = section.locator(
        '[data-chat-thinking-trigger="true"]',
      );
      await thinkingTrigger.click();
      await expect(previewShell).toHaveAttribute(
        "data-chat-assistant-activity-thought-preview-visible",
        "false",
      );
      await activityTrigger.hover();
      await section
        .locator('[data-chat-assistant-activity-open-all-button="true"]')
        .click();

      const activityPrimaryLabel = section.locator(
        '[data-chat-assistant-activity-primary-label="true"]',
      );
      await expect(activityPrimaryLabel).toContainText(
        "Action: pnpm exec vitest run src/components/Chat",
      );
      await expect(activityPrimaryLabel).not.toContainText(
        "Graph state inspection summary",
      );
      await expect(previewShell).toHaveAttribute(
        "data-chat-assistant-activity-thought-preview-visible",
        "false",
      );

      await expect(thinkingTrigger).toContainText("Reasoning");
      await expect(thinkingTrigger).not.toContainText(
        "Graph state inspection summary",
      );

      const rowHoverMeta = section.locator(
        '[data-chat-activity-item-hover-meta="true"]',
      );
      await expect(rowHoverMeta).toHaveCount(2);
      await expect
        .poll(async () =>
          rowHoverMeta
            .nth(0)
            .evaluate((element) =>
              Number.parseFloat(
                window.getComputedStyle(element as HTMLElement).opacity,
              ),
            ),
        )
        .toBeLessThan(0.2);

      const toolRow = section.locator('[data-chat-action-item="true"]').first();
      await toolRow.hover();
      await expect
        .poll(async () =>
          rowHoverMeta
            .nth(1)
            .evaluate((element) =>
              Number.parseFloat(
                window.getComputedStyle(element as HTMLElement).opacity,
              ),
            ),
        )
        .toBeGreaterThan(0.8);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows the braille startup indicator before assistant output begins", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_pending_assistant_braille__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "pending-user-message",
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Run the next check and tell me what you find.",
                },
              ],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: true,
          toolCallArguments: {},
        },
      });

      const typingIndicator = section.locator(
        '[data-chat-assistant-typing-indicator="true"]',
      );
      await expect(typingIndicator).toBeVisible();
      await expect(
        typingIndicator.locator('[data-unicode-spinner="braille"]'),
      ).toHaveCount(1);
      await expect(typingIndicator.locator(".chat-typing-inline")).toHaveCount(
        0,
      );
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
      const userBubble = userGroup
        .locator('[data-chat-user-bubble="true"]')
        .first();
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
});
