import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test.describe.serial("project chat pending promotion", () => {
  test("ignores chunks from an existing chat while a new-thread draft is pending", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      await page.evaluate(async () => {
        const { useAIStore } = await import("/src/state/definitions.ts");
        const { getDefaultChatDetails, receiveLLMResponseChunk } =
          await import("/src/state/actions/ai.ts");
        const {
          StreamingEventTypeEnum,
          createAssistantChatMessage,
          createMessageTextContent,
          createUserChatMessage,
        } = await import("/src/utils/generatedTypes.ts");

        const pendingUserMessage = createUserChatMessage({
          id: "pending-user-msg",
          content: [
            createMessageTextContent({
              text: "Can you run a bunch of read only bash commands?",
            }),
          ],
          attachments: [],
        });
        const existingUserMessage = createUserChatMessage({
          id: "existing-user-msg",
          content: [createMessageTextContent({ text: "Write a long poem" })],
          attachments: [],
        });

        useAIStore.setState({
          activeChatId: undefined,
          pendingChatDetails: {
            ...getDefaultChatDetails(),
            messages: [pendingUserMessage],
            waitingForResponse: true,
          },
          chatDetails: {
            "existing-chat": {
              ...getDefaultChatDetails(),
              messages: [existingUserMessage],
              waitingForResponse: true,
            },
          },
        });

        // Old chat continues streaming after the user has started drafting a new thread.
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
            const pendingMessageIds =
              state.pendingChatDetails?.messages.map((message) => message.id) ??
              [];
            const existingMessageIds =
              state.chatDetails["existing-chat"]?.messages.map(
                (message) => message.id,
              ) ?? [];
            return {
              activeChatIdState:
                state.activeChatId === undefined ? "undefined" : "other",
              pendingMessageIds,
              existingContainsPendingMessage: existingMessageIds.includes(
                "pending-user-msg",
              ),
            };
          });
        })
        .toEqual({
          activeChatIdState: "undefined",
          pendingMessageIds: ["pending-user-msg"],
          existingContainsPendingMessage: false,
        });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
