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

test("params area uses section scroll and removes pinned resize handles", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const sectionId = await createCallableSection(page, projectConfigId);
  const minParamsHeight = 38;

  try {
    await setCallableFromFrontend(page, {
      projectConfigId,
      sectionId,
      callableName: CALLABLE_NAME,
      refetchParams: true,
    });

    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();

    const firstParam = sectionNode
      .locator(`[id^="ParamContainer-${sectionId}-"]`)
      .first();
    await expect(firstParam).toBeVisible();

    const paramGroup = sectionNode.locator(
      "div.section-args-nested.overflow-y-scroll",
    );
    await expect(paramGroup).toBeVisible();
    await expect(paramGroup).toHaveCSS("overflow-y", /auto|scroll/);
    const paramGroupHeight = await paramGroup.evaluate((el) =>
      Math.round(el.getBoundingClientRect().height),
    );
    expect(paramGroupHeight).toBeGreaterThanOrEqual(minParamsHeight);
    await expect(page.locator(".pinned-resize-handle")).toHaveCount(0);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("unpinned area keeps its minimum height when pinned params are present", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const sectionId = await createCallableSection(page, projectConfigId);
  const minUnpinnedHeight = 36;

  try {
    await setCallableFromFrontend(page, {
      projectConfigId,
      sectionId,
      callableName: CALLABLE_NAME,
      refetchParams: true,
    });

    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();

    const firstParam = sectionNode
      .locator(`[id^="ParamContainer-${sectionId}-"]`)
      .first();
    await expect(firstParam).toBeVisible({ timeout: 20000 });
    const pinnedHeader = sectionNode.locator("text=Pinned Params");

    const getUnpinnedParamIds = async () => {
      const idPrefix = `ParamContainer-${sectionId}-`;
      return await sectionNode
        .locator(
          `div.section-args-nested.overflow-y-scroll > [id^="${idPrefix}"]`,
        )
        .evaluateAll(
          (nodes, prefix) =>
            nodes
              .map((node) => node.id)
              .filter((id) => id.startsWith(prefix))
              .map((id) => id.slice(prefix.length)),
          idPrefix,
        );
    };

    if ((await pinnedHeader.count()) === 0) {
      const unpinnedParamIds = await getUnpinnedParamIds();
      if (unpinnedParamIds.length === 0) {
        throw new Error("Missing unpinned params to pin.");
      }
      await postBackend(page, "/setSectionPinnedParams", {
        projectConfigId,
        sectionId,
        pinnedParams: unpinnedParamIds,
      });
      await refreshProjectStateFromBackend(page, projectConfigId);
      await expect(pinnedHeader).toBeVisible();
    }

    await sectionNode.hover();
    const handle = sectionNode.locator(".section-resize-handle-bottom-right");
    await expect(handle).toHaveCount(1);

    const box = await handle.boundingBox();
    if (!box) {
      throw new Error("Missing resize handle bounding box.");
    }

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 400);
    await page.mouse.up();

    const unpinnedContainer = sectionNode.locator(
      "div.section-args-nested.overflow-y-scroll",
    );
    await expect(unpinnedContainer).toBeVisible();
    const unpinnedHeight = await unpinnedContainer.evaluate((el) =>
      Math.round(el.getBoundingClientRect().height),
    );
    expect(unpinnedHeight).toBeGreaterThanOrEqual(minUnpinnedHeight);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
    await cleanupIsolatedProject(page, projectContext);
  }
});
