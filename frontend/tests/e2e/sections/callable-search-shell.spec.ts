import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
} from "../helpers";

test.describe.serial("callable search shell", () => {
  test("keeps the callable search shell off single-cell helpers before and after activation", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

      const node = page
        .locator(".react-flow__nodes")
        .getByTestId(`rf__node-${sectionId}`);
      await expect(node).toBeVisible();

      await page.getByRole("button", { name: "fit view" }).click();

      const search = node.locator("search.section-search");
      await expect(search).toBeVisible();

      const dummyId = `${sectionId}-search`;
      const realId = `CodeMirror-${sectionId}-null`;

      const readSearchShell = async () => {
        return await search.evaluate(
          (element, ids: { dummyId: string; realId: string }) => {
            const dummy = document.getElementById(ids.dummyId);
            const real = document.getElementById(ids.realId);
            const readyIcon = element.querySelector(
              ".setta-callable-ready-icon",
            );
            const indicatorWrapper =
              readyIcon instanceof HTMLElement
                ? readyIcon.parentElement?.parentElement
                : null;
            return {
              searchClassName:
                element instanceof HTMLElement ? element.className : null,
              dummyClassName:
                dummy instanceof HTMLElement ? dummy.className : null,
              realClassName:
                real instanceof HTMLElement ? real.className : null,
              indicatorWrapperClassName:
                indicatorWrapper instanceof HTMLElement
                  ? indicatorWrapper.className
                  : null,
              searchMarkup: element.innerHTML,
            };
          },
          { dummyId, realId },
        );
      };

      const initialClassRead = await readSearchShell();
      expect(initialClassRead.searchClassName).not.toContain(
        "single-cell-container",
      );
      expect(initialClassRead.searchMarkup).not.toContain(
        "single-cell-container",
      );
      expect(initialClassRead.searchMarkup).not.toContain("single-cell-child");
      expect(initialClassRead.dummyClassName).not.toContain(
        "single-cell-child",
      );

      const dummyEditor = node.locator(`[id="${dummyId}"]`);
      await expect(dummyEditor).toBeVisible();
      await dummyEditor.click();

      const realEditor = node.locator(`[id="${realId}"]`);
      await expect(realEditor).toBeVisible();
      await realEditor.click();
      await page.keyboard.type("math");

      await expect(search.locator(".setta-callable-ready-icon")).toBeVisible({
        timeout: 3000,
      });

      const activatedClassRead = await readSearchShell();
      expect(activatedClassRead.searchClassName).not.toContain(
        "single-cell-container",
      );
      expect(activatedClassRead.searchMarkup).not.toContain(
        "single-cell-container",
      );
      expect(activatedClassRead.searchMarkup).not.toContain(
        "single-cell-child",
      );
      expect(activatedClassRead.realClassName).not.toContain(
        "single-cell-child",
      );
      expect(activatedClassRead.indicatorWrapperClassName).not.toContain(
        "single-cell-child",
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
