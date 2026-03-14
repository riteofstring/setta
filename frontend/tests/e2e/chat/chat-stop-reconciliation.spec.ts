import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test.describe.serial("chat stop reconciliation", () => {
  test("project chat stop restores optimistic interruption markers when backend omits stoppedMessageId", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    await page.route("**/api/getExternalAgentChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          toolCallArguments: {},
          contextUsage: null,
        }),
      });
    });

    await page.route("**/api/stopLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alreadyStopped: false,
          stoppedRunId: "run-1",
          stoppedMessageId: null,
        }),
      });
    });

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const chatId = "pw-stop-null-message-id";
      await page.evaluate(
        async ({ nextChatId }) => {
          const { useAIStore } = await import("/src/state/definitions.ts");
          const { getDefaultChatDetails, receiveLLMResponseChunk } =
            await import("/src/state/actions/ai.ts");
          const {
            StreamingEventTypeEnum,
            createAssistantChatMessage,
            createMessageTextContent,
          } = await import("/src/utils/generatedTypes.ts");

          useAIStore.setState({
            activeChatId: nextChatId,
            chatDetails: {
              [nextChatId]: {
                ...getDefaultChatDetails(),
                messages: [
                  createAssistantChatMessage({
                    id: "assistant-prior",
                    content: [
                      createMessageTextContent({ text: "Prior response" }),
                    ],
                  }),
                ],
                waitingForResponse: true,
              },
            },
            interruptedAssistantMessageIdsByChatId: {
              [nextChatId]: {
                "assistant-prior": true,
              },
            },
          });

          receiveLLMResponseChunk({
            chatId: nextChatId,
            projectConfigId: "project-a",
            chunk: {
              type: StreamingEventTypeEnum.MESSAGE_START,
              message: createAssistantChatMessage({
                id: "assistant-current",
                content: [createMessageTextContent({ text: "Streaming now" })],
              }),
            },
          });
        },
        { nextChatId: chatId },
      );

      const stopButton = overviewPane.getByRole("button", {
        name: "Stop response",
      });
      await expect(stopButton).toBeVisible();
      await stopButton.click();

      await expect
        .poll(async () => {
          return await page.evaluate(
            async ({ nextChatId }) => {
              const { useAIStore } = await import("/src/state/definitions.ts");
              return (
                useAIStore.getState().interruptedAssistantMessageIdsByChatId[
                  nextChatId
                ] ?? null
              );
            },
            { nextChatId: chatId },
          );
        })
        .toEqual({
          "assistant-prior": true,
        });
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
