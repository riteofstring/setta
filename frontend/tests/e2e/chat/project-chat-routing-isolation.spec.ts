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
      const primaryWindowId = await page.evaluate(async () => {
        const { useProjectState } = await import("/src/state/definitions.ts");
        const instanceId =
          useProjectState.getState().projectChatWindowing.order[0];
        if (!instanceId) {
          throw new Error("Expected at least one project chat window.");
        }
        return instanceId;
      });

      await page.evaluate(
        async ({ windowId }) => {
          const { useAIStore, useProjectState } = await import(
            "/src/state/definitions.ts"
          );
          const { getDefaultChatDetails } = await import(
            "/src/state/actions/ai.ts"
          );
          const { createMessageTextContent, createUserChatMessage } =
            await import("/src/utils/generatedTypes.ts");

          useAIStore.setState({
            activeChatId: undefined,
            pendingChatDetailsBySurfaceId: {},
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
          useProjectState.setState((state) => {
            const instance = state.projectChatWindowing.instancesById[windowId];
            if (!instance) {
              throw new Error(`Missing project chat window ${windowId}.`);
            }
            instance.chatId = "existing-chat";
          });
        },
        { windowId: primaryWindowId },
      );

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await page.evaluate(
        async ({ projectConfigId, windowId }) => {
          const { finalizePendingChatDetails, submitMessage } = await import(
            "/src/state/actions/ai.ts"
          );
          const { setProjectChatWindowChatId } = await import(
            "/src/state/actions/projectChatWindowing.ts"
          );
          const { buildWorkspaceProjectChatWindowSurfaceId } = await import(
            "/src/components/ChatWindowing/projectChatSurfaceIds.ts"
          );
          const { useAIStore } = await import("/src/state/definitions.ts");
          const surfaceId = buildWorkspaceProjectChatWindowSurfaceId(
            projectConfigId,
            windowId,
          );
          const engineConfigId = useAIStore.getState().engineConfigs[0]?.id;
          if (!engineConfigId) {
            throw new Error(
              "Expected a managed engine config for the routing test.",
            );
          }
          (
            globalThis as {
              __pwRoutingIsolationSubmit?: Promise<void>;
            }
          ).__pwRoutingIsolationSubmit = submitMessage(
            null,
            "Can you run a bunch of read only bash commands?",
            [],
            true,
            engineConfigId,
            false,
            {
              pendingSurfaceId: surfaceId,
            },
          ).then((nextChatId) => {
            if (!nextChatId) {
              return;
            }
            setProjectChatWindowChatId(windowId, nextChatId);
            finalizePendingChatDetails(nextChatId, surfaceId);
          });
        },
        {
          projectConfigId: projectContext.projectConfigId,
          windowId: primaryWindowId,
        },
      );

      // Wait for optimistic draft state to exist while the backend response is delayed.
      await expect
        .poll(async () => {
          return await page.evaluate(
            async ({ projectConfigId, windowId }) => {
              const { useAIStore } = await import("/src/state/definitions.ts");
              const { buildWorkspaceProjectChatWindowSurfaceId } = await import(
                "/src/components/ChatWindowing/projectChatSurfaceIds.ts"
              );
              const surfaceId = buildWorkspaceProjectChatWindowSurfaceId(
                projectConfigId,
                windowId,
              );
              const pendingMessages =
                useAIStore.getState().pendingChatDetailsBySurfaceId[surfaceId]
                  ?.messages ?? [];
              return pendingMessages.some((message) => message.role === "user");
            },
            {
              projectConfigId: projectContext.projectConfigId,
              windowId: primaryWindowId,
            },
          );
        })
        .toBe(true);

      // Simulate a late chunk from the old chat while the first-submit draft is still pending.
      await page.evaluate(
        async ({ projectConfigId }) => {
          const { receiveLLMResponseChunk } = await import(
            "/src/state/actions/ai.ts"
          );
          const {
            StreamingEventTypeEnum,
            createAssistantChatMessage,
            createMessageTextContent,
          } = await import("/src/utils/generatedTypes.ts");

          receiveLLMResponseChunk({
            chatId: "existing-chat",
            projectConfigId,
            chunk: {
              type: StreamingEventTypeEnum.MESSAGE_START,
              message: createAssistantChatMessage({
                id: "existing-assistant-msg",
                content: [
                  createMessageTextContent({ text: "Continuing poem..." }),
                ],
              }),
            },
          });
        },
        { projectConfigId: projectContext.projectConfigId },
      );

      await expect
        .poll(async () => {
          return await page.evaluate(
            async ({ projectConfigId, windowId }) => {
              const { useAIStore } = await import("/src/state/definitions.ts");
              const { buildWorkspaceProjectChatWindowSurfaceId } = await import(
                "/src/components/ChatWindowing/projectChatSurfaceIds.ts"
              );
              const state = useAIStore.getState();
              const surfaceId = buildWorkspaceProjectChatWindowSurfaceId(
                projectConfigId,
                windowId,
              );
              const pendingUserText =
                state.pendingChatDetailsBySurfaceId[surfaceId]?.messages
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
            },
            {
              projectConfigId: projectContext.projectConfigId,
              windowId: primaryWindowId,
            },
          );
        })
        .toEqual({
          activeChatIdState: "undefined",
          pendingUserText: "Can you run a bunch of read only bash commands?",
          existingUserTexts: ["Write a long poem"],
        });

      releaseSubmit?.();
      await expect
        .poll(async () => {
          return await page.evaluate(
            async ({ expectedChatId, windowId }) => {
              const { useProjectState } = await import(
                "/src/state/definitions.ts"
              );
              return (
                useProjectState.getState().projectChatWindowing.instancesById[
                  windowId
                ]?.chatId === expectedChatId
              );
            },
            { expectedChatId: nextChatId, windowId: primaryWindowId },
          );
        })
        .toBe(true);
      await page.evaluate(async () => {
        await (
          globalThis as {
            __pwRoutingIsolationSubmit?: Promise<void>;
          }
        ).__pwRoutingIsolationSubmit;
      });
    } finally {
      releaseSubmit?.();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
