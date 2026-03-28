import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  setCallableFromFrontend,
} from "../helpers";

const CALLABLE_NAME = "sorted";

test("callable params render after set_callable", async ({ page }) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );

  try {
    const setCallableResponse = await setCallableFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      callableName: CALLABLE_NAME,
      refetchParams: true,
    });
    await expect(setCallableResponse).toMatchObject({ lspStatus: "matched" });

    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();

    const paramContainer = sectionNode.locator(
      `[id^="ParamContainer-${sectionId}-"]`,
    );
    const firstParam = paramContainer.first();
    await expect(firstParam).toBeVisible({ timeout: 20000 });

    const paramLabel = firstParam.locator(".section-key").first();
    await expect(paramLabel).toBeVisible();
    await expect(paramLabel).toHaveText(/iterable/i);

    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const param = document.querySelector(`[id^="ParamContainer-${id}-"]`);
          if (!param) {
            return false;
          }
          const label = param.querySelector(".section-key");
          if (!(label instanceof HTMLElement)) {
            return false;
          }
          const rect = label.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            return false;
          }
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return hit ? label.contains(hit) : false;
        }, sectionId);
      })
      .toBe(true);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId: projectContext.projectConfigId,
      sectionIds: [sectionId],
    });
    await cleanupIsolatedProject(page, projectContext);
  }
});
