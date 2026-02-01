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
    await expect(paramContainer.first()).toBeVisible({ timeout: 20000 });
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});
