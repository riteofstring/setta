import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test.describe.serial("project chat routing isolation", () => {
  test("keeps first-submit draft messages isolated from late chunks in another chat", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    const nextChatId = "pw-routing-isolation-new-chat";
    let releaseSubmit: (() => void) | null = null;
    const submitGate = new Promise<void>((resolve) => {
      releaseSubmit = resolve;
    });

    await page.route("**/api/getLLMResponse", async (route) => {
      await submitGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(nextChatId),
      });
    });
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-routing-config",
            model: "gpt-4o-mini",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
          contextUsage: null,
        }),
      });
    });
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

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      await page.evaluate(async () => {
        const { useAIStore } = await import("/src/state/definitions.ts");
        const { getDefaultChatDetails } = await import("/src/state/actions/ai.ts");
        const { createMessageTextContent, createUserChatMessage } =
          await import("/src/utils/generatedTypes.ts");

        useAIStore.setState({
          activeChatId: "existing-chat",
          pendingChatDetails: null,
          chatDetails: {
            "existing-chat": {
              ...getDefaultChatDetails(),
              messages: [
                createUserChatMessage({
                  id: "existing-user-msg",
                  content: [
                    createMessageTextContent({ text: "Write a long poem" }),
                  ],
                  attachments: [],
                }),
              ],
              waitingForResponse: true,
            },
          },
        });
      });

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await overviewPane.getByRole("button", { name: "New Chat" }).click();
      const input = overviewPane.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Can you run a bunch of read only bash commands?");
      await input.press("Enter");

      // Wait for optimistic draft state to exist while the backend response is delayed.
      await expect
        .poll(async () => {
          return await page.evaluate(async () => {
            const { useAIStore } = await import("/src/state/definitions.ts");
            const pendingMessages =
              useAIStore.getState().pendingChatDetails?.messages ?? [];
            return pendingMessages.some((message) => message.role === "user");
          });
        })
        .toBe(true);

      // Simulate a late chunk from the old chat while the first-submit draft is still pending.
      await page.evaluate(async () => {
        const { receiveLLMResponseChunk } = await import("/src/state/actions/ai.ts");
        const {
          StreamingEventTypeEnum,
          createAssistantChatMessage,
          createMessageTextContent,
        } = await import("/src/utils/generatedTypes.ts");

        receiveLLMResponseChunk({
          chatId: "existing-chat",
          projectConfigId: "project-e2e",
          chunk: {
            type: StreamingEventTypeEnum.MESSAGE_START,
            message: createAssistantChatMessage({
              id: "existing-assistant-msg",
              content: [createMessageTextContent({ text: "Continuing poem..." })],
            }),
          },
        });
      });

      await expect
        .poll(async () => {
          return await page.evaluate(async () => {
            const { useAIStore } = await import("/src/state/definitions.ts");
            const state = useAIStore.getState();
            const pendingUserText =
              state.pendingChatDetails?.messages
                .filter((message) => message.role === "user")
                .map((message) =>
                  message.content
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join(" ")
                    .trim(),
                )
                .join(" | ") ?? "";
            const existingUserTexts =
              state.chatDetails["existing-chat"]?.messages
                .filter((message) => message.role === "user")
                .map((message) =>
                  message.content
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join(" ")
                    .trim(),
                ) ?? [];
            return {
              activeChatIdState:
                state.activeChatId === undefined ? "undefined" : "other",
              pendingUserText,
              existingUserTexts,
            };
          });
        })
        .toEqual({
          activeChatIdState: "undefined",
          pendingUserText: "Can you run a bunch of read only bash commands?",
          existingUserTexts: ["Write a long poem"],
        });

      releaseSubmit?.();
      await expect
        .poll(async () => {
          return await page.evaluate(async ({ expectedChatId }) => {
            const { useAIStore } = await import("/src/state/definitions.ts");
            return useAIStore.getState().activeChatId === expectedChatId;
          }, { expectedChatId: nextChatId });
        })
        .toBe(true);
    } finally {
      releaseSubmit?.();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
