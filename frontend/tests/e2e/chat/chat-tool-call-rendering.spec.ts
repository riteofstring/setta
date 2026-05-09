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
  getHorizontalOverflowMetrics,
} from "./chat-tool-calls-helpers";

test.describe.serial("chat tool call rendering", () => {
  test("keeps assistant bubbles within bounds when rich markdown includes tables and code blocks", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_rich_markdown_bubble_width__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const assistantMessageText = [
        "## Summary: What to Cut/Simplify",
        "",
        "| Feature | Action |",
        "| --- | --- |",
        "| MetaControl sections | Merge with regular params |",
        "| Name sanitization ceremony | Use IDs primarily; name mapping only when needed |",
        "",
        "```ts",
        "const sectionKinds = ['chart', 'browser', 'terminal'];",
        "```",
      ].join("\n");

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "rich-markdown-assistant-message",
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

      const assistantBubble = section
        .locator('[data-chat-assistant-bubble="true"]')
        .first();
      await section.evaluate((element) => {
        const sectionElement = element as HTMLElement;
        sectionElement.style.width = "340px";
        sectionElement.style.maxWidth = "340px";
      });
      await assistantBubble.scrollIntoViewIfNeeded();
      await expect(assistantBubble).toBeVisible();
      await expect(
        assistantBubble.locator('[data-chat-markdown-table-wrapper="true"]'),
      ).toHaveCount(1);
      await expect
        .poll(() => getHorizontalOverflowMetrics(assistantBubble))
        .toMatchObject({
          overflowPx: 0,
          hasScrollOverflow: false,
        });
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
          element.getAttribute(
            "data-chat-structured-output-resize-handle-edge",
          ),
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
      await page.mouse.move(handleCenterX, handleCenterY);
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
      await page.mouse.move(handleCenterX, handleCenterY + 120, { steps: 12 });
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
});
