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

test.describe.serial("agentic summary cache status", () => {
  test("shows cached/missing/deferred counts for summary context edges", async ({
    page,
  }) => {
    await seedLocalStorage(page, { uiEditorVis: true });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_agentic_summary_cache_chat__",
      );

      for (let idx = 0; idx < 8; idx++) {
        const { sectionId: sourceSectionId } = await createTextBlockSection(
          page,
          projectContext.projectConfigId,
          `__pw_agentic_summary_cache_source_${idx}__`,
        );
        await postBackend(page, "/setTextBlockText", {
          projectConfigId: projectContext.projectConfigId,
          sectionId: sourceSectionId,
          text: `hello ${idx}`,
        });
        await postBackend(page, "/createAgenticEdge", {
          projectConfigId: projectContext.projectConfigId,
          sourceSectionId,
          targetSectionId: chatSectionId,
          kind: "section_chat",
          contextMode: "summary",
        });
      }

      const chatNode = page.locator(
        `.react-flow__node[data-id="${chatSectionId}"]`,
      );
      await expect(chatNode).toBeVisible();
      await chatNode.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const summaryCachePanel = uiEditorPane
        .getByText("Summary cache")
        .locator("..")
        .locator("..");
      await expect(summaryCachePanel).toContainText("Cached: 0/8");
      await expect(summaryCachePanel).toContainText("Missing: 8");
      await expect(summaryCachePanel).toContainText("Deferred due to cap (6): 2");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
