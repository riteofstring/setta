import { expect, test, type Locator, type Page } from "@playwright/test";
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
      await page.waitForSelector(".canvas-flow__canvas");

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      const chatId = "pw-stop-null-message-id";
      const windowInstanceId =
        await getVisibleProjectChatWindowInstanceId(projectChatSurface);
      await page.evaluate(
        async ({ instanceId, nextChatId }) => {
          const { setProjectChatWindowChatId } = await import(
            "/src/state/actions/projectChatWindowing.ts"
          );
          const { useAIStore } = await import("/src/state/definitions.ts");
          const { getDefaultChatDetails, receiveLLMResponseChunk } =
            await import("/src/state/actions/ai.ts");
          const {
            StreamingEventTypeEnum,
            createAssistantChatMessage,
            createMessageTextContent,
          } = await import("/src/utils/generatedTypes.ts");

          useAIStore.setState({
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
          setProjectChatWindowChatId(instanceId, nextChatId);

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
        { instanceId: windowInstanceId, nextChatId: chatId },
      );

      const stopButton = projectChatSurface.getByRole("button", {
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

async function getVisibleProjectChatSurface(page: Page): Promise<Locator> {
  const surfaceCandidates = [
    page.getByTestId("project-chat-maximized-window").first(),
    page.getByTestId("project-chat-floating-window").first(),
    page.getByTestId("project-chat-bottom-dock-window-panel").first(),
    page
      .locator('#OverviewPane [data-chat-surface-mode="project_ai_mode"]')
      .first(),
  ];
  await expect
    .poll(async () => {
      for (const candidate of surfaceCandidates) {
        if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  for (const candidate of surfaceCandidates) {
    if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
      return candidate;
    }
  }
  throw new Error("No visible project chat surface found.");
}

async function getVisibleProjectChatWindowInstanceId(
  surface: Locator,
): Promise<string> {
  const instanceId = await surface.getAttribute("data-chat-window-instance-id");
  if (!instanceId) {
    throw new Error("Visible project chat surface is missing an instance id.");
  }
  return instanceId;
}
