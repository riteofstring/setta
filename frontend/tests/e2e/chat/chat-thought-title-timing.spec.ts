import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  cleanupIsolatedProject,
  createChatSection,
  emitChatStreamDelta,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  setChatSectionState,
} from "../helpers";

test.describe.serial("chat thought title timing", () => {
  test("promotes backend summary metadata during an active thought stream without dropping local reasoning text", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_thought_title_timing__",
      );
      const chatId = `chat-thought-title-${Date.now()}`;
      const messageId = `msg-thought-title-${Date.now()}`;
      const localThinking =
        "Reviewing grouped activity rows before final answer output.";
      const backendSummary = "Structured summary title from backend metadata.";
      const llmConfig = {
        id: "llm-title-timing",
        model: "test-model",
        provider: null,
        base_url: null,
        api_key_env: null,
        other_params: null,
        mcpServerIds: null,
        temporary: false,
      };

      await postBackend(page, "/setChatSectionChatId", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        chatId,
      });

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [],
          inputText: "",
          waitingForResponse: true,
          toolCallArguments: {},
        },
      });

      await emitChatStreamDelta(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        chatId,
        chunk: {
          type: "message_start",
          message: {
            id: messageId,
            role: "assistant",
            content: [],
            attachments: [],
            tool_calls: null,
          },
        },
      });
      await emitChatStreamDelta(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        chatId,
        chunk: {
          type: "delta",
          message_id: messageId,
          content: [
            {
              type: "thinking_delta",
              index: 0,
              thinking: localThinking,
              summary: "",
              signature: "",
            },
          ],
        },
      });

      const section = findSectionByName(page, sectionName);
      const activityPrimaryLabel = section.locator(
        '[data-chat-assistant-activity-primary-label="true"]',
      );

      await expect(activityPrimaryLabel).toContainText("Thinking", {
        timeout: 10000,
      });

      await page.route("**/api/getLLMChat", async (route) => {
        const payload = route.request().postDataJSON() as
          | { chatId?: string; projectConfigId?: string }
          | undefined;
        if (
          payload?.chatId !== chatId ||
          payload?.projectConfigId !== projectContext.projectConfigId
        ) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            messages: [
              {
                id: messageId,
                role: "assistant",
                content: [
                  {
                    type: "thinking",
                    thinking: "",
                    summary: backendSummary,
                    signature: "backend-signature",
                  },
                ],
                attachments: [],
                tool_calls: null,
              },
            ],
            waitingForResponse: true,
            llmConfig,
            contextUsage: null,
          }),
        });
      });

      // The hydrate path carries only the structured title metadata. The active
      // stream still owns the fuller reasoning body and should keep it.
      await page.evaluate(
        async ({ chatId: nextChatId, sectionId: nextSectionId }) => {
          const { getLLMChat } = await import("/src/state/actions/ai.ts");
          await getLLMChat(nextChatId, nextSectionId);
        },
        {
          chatId,
          sectionId,
        },
      );

      await expect(activityPrimaryLabel).toContainText("Thinking", {
        timeout: 10000,
      });

      const activityTrigger = section.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      const thinkingTrigger = section.locator(
        '[data-chat-thinking-trigger="true"]',
      );
      await expect(activityTrigger).toBeVisible({ timeout: 10000 });
      if (!(await thinkingTrigger.isVisible())) {
        await activityTrigger.click();
      }
      await expect(thinkingTrigger).toContainText(backendSummary, {
        timeout: 10000,
      });
      await expect(thinkingTrigger).toHaveAttribute(
        "data-chat-thinking-expandable",
        "true",
      );
      await thinkingTrigger.click();
      await expect(
        section.locator('[data-chat-thinking-content="true"]'),
      ).toContainText(localThinking, {
        timeout: 10000,
      });
    } finally {
      await page.unroute("**/api/getLLMChat");
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
