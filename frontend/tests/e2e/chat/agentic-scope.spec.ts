import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  createChatSection,
  emitChatStreamDelta,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

async function seedScopeViolationEdges(
  page: Page,
  projectConfigId: string,
  edges: Array<{
    sourceSectionId: string;
    targetSectionId: string;
    kind: "chat_section" | "section_chat" | "chat_chat";
  }>,
): Promise<void> {
  await page.evaluate(
    async ({ nextProjectConfigId, nextEdges }) => {
      const { receiveAgenticScopeViolationEdges } = await import(
        "/src/state/actions/aiFollow.ts"
      );
      receiveAgenticScopeViolationEdges({
        projectConfigId: nextProjectConfigId,
        edges: nextEdges,
      });
    },
    {
      nextProjectConfigId: projectConfigId,
      nextEdges: edges,
    },
  );
}

async function readScopeViolationEdgeCount(
  page: Page,
  projectConfigId: string,
): Promise<number> {
  return page.evaluate(async (nextProjectConfigId) => {
    const { useAIFollow } = await import("/src/state/definitions.ts");
    return (
      useAIFollow.getState().scopeViolationEdgesByProjectConfigId[
        nextProjectConfigId
      ]?.length ?? 0
    );
  }, projectConfigId);
}

test.describe.serial("agentic scope", () => {
  test("shows scope violation warning and records missing edge highlight state", async ({
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
                sourceSectionId: `tmp-${chatSectionId}`,
                targetSectionId: `tmp-${targetSectionId}`,
                kind: "chat_section",
              },
            ],
            missingEdgesCanonical: [
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

      await emitChatStreamDelta(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        chatId,
        chunk: {
          type: "tool_result",
          result: toolResultMessage,
        },
      });

      const scopeToast = page.locator(".header-notification-fade", {
        hasText: "Use Project Chat for full access.",
      });
      await expect(scopeToast).toHaveCount(1);

      await emitChatStreamDelta(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        chatId,
        chunk: {
          type: "tool_result",
          result: {
            ...toolResultMessage,
            id: `tool-msg-${Date.now()}-second`,
            tool_call_id: `tool-call-${Date.now()}-second`,
          },
        },
      });

      await expect(scopeToast).toHaveCount(1);
      await seedScopeViolationEdges(page, projectContext.projectConfigId, [
        {
          sourceSectionId: chatSectionId,
          targetSectionId,
          kind: "chat_section",
        },
      ]);
      await expect
        .poll(() =>
          readScopeViolationEdgeCount(page, projectContext.projectConfigId),
        )
        .toBe(1);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("does not bleed scope violations across project configs when section ids are shared", async ({
    page,
  }) => {
    await seedLocalStorage(page, { uiEditorVis: true });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    let projectConfigIdB: string | null = null;
    let projectConfigNameB: string | null = null;

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_agentic_scope_cross_config__",
      );
      const targetSectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const chatId = `chat-cross-${Date.now()}`;

      await postBackend(page, "/setChatSectionChatId", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        chatId,
      });

      projectConfigNameB = await postBackend<string>(
        page,
        "/createProjectConfig",
        {
          previewImgColor: "bg-emerald-500/60",
        },
      );
      if (!projectConfigNameB) {
        throw new Error("Missing project config name for config B.");
      }

      const metadata = await postBackend<{
        projectMetadata: Array<{ id: string; name: string }>;
      }>(page, "/loadAllProjectMetadata", {});
      projectConfigIdB =
        metadata?.projectMetadata.find(
          (entry) => entry.name === projectConfigNameB,
        )?.id ?? null;
      if (!projectConfigIdB) {
        throw new Error("Unable to resolve project config id for config B.");
      }

      const clipboard = await postBackend<{
        type?: string;
        data?: unknown;
      }>(page, "/prepareSectionsForCopy", {
        projectConfigId: projectContext.projectConfigId,
        sectionIds: [chatSectionId, targetSectionId],
      });
      if (!clipboard?.data) {
        throw new Error("Missing clipboard payload.");
      }
      await postBackend(page, "/pasteSections", {
        projectConfigId: projectConfigIdB,
        data: clipboard.data as Record<string, unknown>,
        position: { x: 0, y: 0 },
        asRef: true,
      });

      const configBUrl = new URL(page.url());
      configBUrl.pathname = `/${projectConfigNameB}`;
      await page.goto(configBUrl.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");

      await expect(
        page.locator(`.react-flow__node[data-id="${chatSectionId}"]`),
      ).toBeVisible();
      await expect(
        page.locator(`.react-flow__node[data-id="${targetSectionId}"]`),
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
            missingEdgesCanonical: [
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

      await emitChatStreamDelta(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        chatId,
        chunk: {
          type: "tool_result",
          result: toolResultMessage,
        },
      });

      // Scope violation toast is global, but missing-edge highlights are keyed by projectConfigId.
      const scopeToast = page.locator(".header-notification-fade", {
        hasText: "Use Project Chat for full access.",
      });
      await expect(scopeToast).toHaveCount(1);

      await seedScopeViolationEdges(page, projectContext.projectConfigId, [
        {
          sourceSectionId: chatSectionId,
          targetSectionId,
          kind: "chat_section",
        },
      ]);
      await expect
        .poll(() =>
          readScopeViolationEdgeCount(page, projectContext.projectConfigId),
        )
        .toBe(1);
      await expect
        .poll(() => readScopeViolationEdgeCount(page, projectConfigIdB))
        .toBe(0);

      // Now emit the same violation for the *current* project config and confirm the
      // missing-edge highlight appears.
      await seedScopeViolationEdges(page, projectConfigIdB, [
        {
          sourceSectionId: chatSectionId,
          targetSectionId,
          kind: "chat_section",
        },
      ]);
      await expect
        .poll(() => readScopeViolationEdgeCount(page, projectConfigIdB))
        .toBe(1);
    } finally {
      if (projectConfigIdB) {
        await postBackend(page, "/deleteProjectConfigs", {
          ids: [projectConfigIdB],
        });
      }
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows a warning banner when no outgoing scope links exist", async ({
    page,
  }) => {
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
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: true,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });

      const chatNode = page.locator(
        `.react-flow__node[data-id="${chatSectionId}"]`,
      );
      await expect(chatNode).toBeVisible();
      await chatNode.click();

      await expect(
        chatNode.getByTestId("managed-chat-zero-scope-indicator"),
      ).toBeVisible();
      await expect(
        page.getByText(
          "No outgoing scope links. This chat has no project access.",
        ),
      ).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
