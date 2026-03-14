import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
} from "../helpers";

test.describe.serial("follow ai highlight cleanup", () => {
  test("clears a highlighted section after stop without waiting for a follow websocket echo", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    await page.route("**/api/stopLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    });

    try {
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_follow_highlight_cleanup__",
      );
      const section = page.locator(`[data-section-id="${sectionId}"]`).first();
      await expect(section).toBeVisible();

      const chatId = "pw-follow-highlight-stop";
      await page.evaluate(
        async ({ projectConfigId, sectionId: nextSectionId, chatId: nextChatId }) => {
          const { useAIFollow, useAIStore } = await import(
            "/src/state/definitions.ts"
          );
          const { getDefaultChatDetails } = await import(
            "/src/state/actions/ai.ts"
          );

          useAIStore.setState({
            chatDetails: {
              [nextChatId]: {
                ...getDefaultChatDetails(),
                waitingForResponse: true,
              },
            },
          });
          useAIFollow.setState((state) => {
            const projectEntries =
              state.toolArgumentsIdsByProjectConfigId[projectConfigId] ??
              (state.toolArgumentsIdsByProjectConfigId[projectConfigId] = {});
            projectEntries[nextChatId] = {
              section: [nextSectionId],
            };
          });
        },
        {
          projectConfigId: projectContext.projectConfigId,
          sectionId,
          chatId,
        },
      );

      // The seeded Follow AI state should paint the real section highlight first.
      await expect
        .poll(async () => {
          return (
            (await section.getAttribute("class"))?.includes(
              "setta-ai-gradient-border-active",
            ) ?? false
          );
        })
        .toBe(true);

      await page.evaluate(async ({ chatId: nextChatId }) => {
        const { stopProjectChatResponse } = await import(
          "/src/state/actions/ai.ts"
        );
        await stopProjectChatResponse(nextChatId, false);
      }, { chatId });

      // The local stop path should clear the Follow AI store immediately even
      // though no websocket follow update was emitted by the backend.
      await expect
        .poll(async () => {
          return await page.evaluate(
            async ({ projectConfigId, chatId: nextChatId }) => {
              const { useAIFollow } = await import("/src/state/definitions.ts");
              return (
                useAIFollow.getState().toolArgumentsIdsByProjectConfigId[
                  projectConfigId
                ]?.[nextChatId] ?? null
              );
            },
            {
              projectConfigId: projectContext.projectConfigId,
              chatId,
            },
          );
        })
        .toBeNull();

      // The section hook has a short fade-out, so the visible border should
      // disappear promptly after the underlying follow state is cleared.
      await expect
        .poll(
          async () => {
            return (
              (await section.getAttribute("class"))?.includes(
                "setta-ai-gradient-border-active",
              ) ?? false
            );
          },
          { timeout: 2500 },
        )
        .toBe(false);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
