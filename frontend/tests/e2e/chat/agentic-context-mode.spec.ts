import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type AgenticEdge = {
  sourceSectionId?: string;
  targetSectionId?: string;
  kind?: string;
  contextMode?: string;
};

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      agenticEdges?: AgenticEdge[];
    };
  };
};

test.describe.serial("agentic context mode", () => {
  test("updates section->chat contextMode and persists", async ({ page }) => {
    await seedLocalStorage(page, { uiEditorVis: true });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_agentic_context_chat__",
      );
      const { sectionId: textSectionId, sectionName: textSectionName } =
        await createTextBlockSection(
          page,
          projectContext.projectConfigId,
          "__pw_agentic_context_source__",
        );

      await postBackend(page, "/createAgenticEdge", {
        projectConfigId: projectContext.projectConfigId,
        sourceSectionId: chatSectionId,
        targetSectionId: textSectionId,
        kind: "chat_section",
        contextMode: "reference_only",
      });

      const chatNode = page.locator(
        `.react-flow__node[data-id="${chatSectionId}"]`,
      );
      await expect(chatNode).toBeVisible();
      await chatNode.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const contextSourcesBlock = uiEditorPane
        .getByText("Context sources")
        .locator("..");
      const contextRow = contextSourcesBlock
        .locator("div.flex.items-center", { hasText: textSectionName })
        .first();
      await expect(contextRow).toBeVisible();

      const contextModeSelect = contextRow.locator("select");
      await expect(contextModeSelect).toHaveValue("reference_only");

      await contextModeSelect.selectOption("inline_text");
      await expect(contextModeSelect).toHaveValue("inline_text");

      await expect
        .poll(
          async () => {
            const response = await postBackend<LatestProjectStateResponse>(
              page,
              "/getLatestProjectState",
              { projectConfigId: projectContext.projectConfigId },
            );
            const edges = response?.projectState?.projectConfig?.agenticEdges ?? [];
            const match = edges.find(
              (edge) =>
                edge.sourceSectionId === chatSectionId &&
                edge.targetSectionId === textSectionId &&
                edge.kind === "chat_section",
            );
            return match?.contextMode ?? null;
          },
          { timeout: 8000 },
        )
        .toBe("inline_text");

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");

      const chatNodeAfter = page.locator(
        `.react-flow__node[data-id="${chatSectionId}"]`,
      );
      await expect(chatNodeAfter).toBeVisible();
      await chatNodeAfter.click();

      const uiEditorPaneAfter = page.locator("#UiEditorPane");
      await expect(uiEditorPaneAfter).toBeVisible();

      const contextSourcesBlockAfter = uiEditorPaneAfter
        .getByText("Context sources")
        .locator("..");
      const contextRowAfter = contextSourcesBlockAfter
        .locator("div.flex.items-center", { hasText: textSectionName })
        .first();
      await expect(contextRowAfter).toBeVisible();
      await expect(contextRowAfter.locator("select")).toHaveValue("inline_text");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
