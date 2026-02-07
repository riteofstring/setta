import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  createChatSection,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

test.describe.serial("agentic scope", () => {
  test("shows scope violation warning and missing edge highlight", async ({
    page,
  }) => {
    await seedLocalStorage(page, { uiEditorVis: true });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_agentic_scope__",
      );
      const targetSectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const chatId = `chat-scope-${Date.now()}`;

      await postBackend(page, "/setChatSectionChatId", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        chatId,
      });

      const chatNode = page.locator(
        `.react-flow__node[data-id="${chatSectionId}"]`,
      );
      await expect(chatNode).toBeVisible();
      await chatNode.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      await expect(uiEditorPane.getByText("Agentic Scope")).toBeVisible();
      await expect(
        uiEditorPane.getByText("Use Project Chat for full access."),
      ).toBeVisible();

      const now = new Date().toISOString();
      const toolResultMessage = {
        id: `tool-msg-${Date.now()}`,
        role: "tool",
        tool_call_id: `tool-call-${Date.now()}`,
        tool_name: "setta.set_section_name",
        arguments: {},
        result: {
          content: [
            {
              type: "text",
              text: "Tool 'set_section_name' blocked by agentic scope.",
            },
          ],
          structuredContent: {
            error: "ScopeViolation",
            message: "Tool 'set_section_name' blocked by agentic scope.",
            toolName: "set_section_name",
            accessType: "write",
            blockedSectionIds: [targetSectionId],
            targetSectionIds: [targetSectionId],
            unmappedCodeObjIds: [],
            reason: "out_of_scope",
            missingEdges: [
              {
                sourceSectionId: chatSectionId,
                targetSectionId,
                kind: "chat_section",
              },
            ],
          },
          isError: true,
        },
        content: [
          {
            type: "text",
            text: "Tool 'set_section_name' blocked by agentic scope.",
          },
        ],
        is_error: true,
        started_at: now,
        completed_at: now,
      };

      await postBackend(page, "/emitChatStreamDelta", {
        sectionId: chatSectionId,
        chatId,
        chunk: {
          type: "tool_result",
          result: toolResultMessage,
        },
      });

      const notification = page.locator(".header-notification-fade");
      await expect(notification).toContainText(
        "Use Project Chat for full access.",
      );
      await expect(
        page.locator("path.agentic-edge--missing").first(),
      ).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows a warning banner when write scope is empty", async ({ page }) => {
    await seedLocalStorage(page, { uiEditorVis: true });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_agentic_scope_banner__",
      );
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        managed: true,
        engineConfigId: null,
        agentProfileId: null,
        thinking: true,
      });
      const { sectionId: sourceSectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_agentic_scope_banner_source__",
      );
      await postBackend(page, "/createAgenticEdge", {
        projectConfigId: projectContext.projectConfigId,
        sourceSectionId,
        targetSectionId: chatSectionId,
        kind: "section_chat",
        contextMode: "reference_only",
      });

      const chatNode = page.locator(
        `.react-flow__node[data-id="${chatSectionId}"]`,
      );
      await expect(chatNode).toBeVisible();
      await chatNode.click();

      await expect(chatNode.getByText("No writable sections in scope.")).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
