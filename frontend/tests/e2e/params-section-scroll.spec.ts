import { expect, test } from "@playwright/test";
import {
  createCallableSection,
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
} from "./helpers";

test("params area uses section scroll and removes pinned resize handles", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await createCallableSection(page, projectConfigId);

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    const paramGroup = sectionNode.locator("div.section-row-pin-main").first();
    await expect(paramGroup).toBeVisible();
    await expect(paramGroup).toHaveCSS("overflow-y", /auto|scroll/);
    await expect(page.locator(".pinned-resize-handle")).toHaveCount(0);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});
