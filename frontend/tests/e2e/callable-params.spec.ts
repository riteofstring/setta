import { expect, test } from "@playwright/test";
import {
  ensureAppReady,
  createCallableSection,
  getCurrentProjectConfigId,
  postBackend,
} from "./helpers";

const CALLABLE_NAME = "sorted";

test("callable params render after set_callable", async ({ page }) => {
  await ensureAppReady(page);
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await createCallableSection(page, projectConfigId);

  try {
    await postBackend(page, "/setCallable", {
      projectConfigId,
      sectionId,
      callableName: CALLABLE_NAME,
      refetchParams: true,
    });

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
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
          const param = document.querySelector(
            `[id^="ParamContainer-${id}-"]`,
          );
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
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});
