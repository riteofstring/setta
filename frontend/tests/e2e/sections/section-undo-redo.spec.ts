import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

function isUndoRedoRegressionError(message: string): boolean {
  return (
    message.includes("getCurrSectionVariantId") ||
    message.includes("getCurrShownParamIds") ||
    message.includes("UiEditor") ||
    message.includes("sectionInfos.ts:") ||
    message.includes("tabbingLogic") ||
    message.includes("Cannot read properties of null (reading 'focus')")
  );
}

test.describe.serial("section undo/redo", () => {
  test("create callable section undo/redo does not trigger runtime errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error?.message ?? String(error));
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const sectionNode = page.locator(`[data-testid="rf__node-${sectionId}"]`);
      await expect(sectionNode).toBeVisible();
      await page.evaluate(async (activeSectionId) => {
        const mod = await import("/src/state/definitions");
        mod.useProjectState.setState((state) => {
          state.projectConfig.activeIds = [activeSectionId];
        });
      }, sectionId);

      await postBackend(page, "/undo", {
        projectConfigId: projectContext.projectConfigId,
        steps: 1,
      });
      await expect(sectionNode).toHaveCount(0);

      await postBackend(page, "/redo", {
        projectConfigId: projectContext.projectConfigId,
        steps: 1,
      });
      await expect(sectionNode).toBeVisible();

      const undoRedoPageErrors = pageErrors.filter(isUndoRedoRegressionError);
      const undoRedoConsoleErrors = consoleErrors.filter(
        isUndoRedoRegressionError,
      );
      expect(undoRedoPageErrors).toEqual([]);
      expect(undoRedoConsoleErrors).toEqual([]);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
