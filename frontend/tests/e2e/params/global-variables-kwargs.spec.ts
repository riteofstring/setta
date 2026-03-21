import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateSectionResponse = { sectionId?: string };

async function createGlobalVariablesSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }

  const response = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "GlobalVariables",
      viewportBounds,
    },
  );
  const sectionId = response?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating global variables section.");
  }
  return sectionId;
}

async function addSingleKwargAndReturnParamId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  await postBackend(page, "/addKwarg", { projectConfigId, sectionId });

  const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
  const firstParam = sectionNode.locator(
    `[id^="ParamContainer-${sectionId}-"]`,
  );
  await expect(firstParam.first()).toBeVisible({ timeout: 20000 });

  const id = await firstParam.first().getAttribute("id");
  if (!id) {
    throw new Error("Missing ParamContainer id attribute.");
  }
  const match = id.match(new RegExp(`^ParamContainer-${sectionId}-(.+)$`));
  const paramId = match?.[1] ?? null;
  if (!paramId) {
    throw new Error(`Unable to parse param id from "${id}".`);
  }
  return paramId;
}

test.describe.serial("global variables kwargs", () => {
  test("global variables kwargs render after add_kwarg", async ({ page }) => {
    await ensureAppReady(page);
    const context = await openIsolatedProject(page);
    const sectionIds: string[] = [];

    try {
      const sectionId = await createGlobalVariablesSection(
        page,
        context.projectConfigId,
      );
      sectionIds.push(sectionId);

      await addSingleKwargAndReturnParamId(
        page,
        context.projectConfigId,
        sectionId,
      );

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();

      const firstParam = sectionNode.locator(
        `[id^="ParamContainer-${sectionId}-"]`,
      );
      await expect(firstParam.first()).toBeVisible({ timeout: 20000 });

      // The shared row shell should produce a real row box, not a collapsed shell.
      const rowBox = await firstParam.first().boundingBox();
      expect(rowBox?.height ?? 0).toBeGreaterThan(10);
    } finally {
      if (sectionIds.length > 0) {
        await postBackend(page, "/deleteSections", {
          projectConfigId: context.projectConfigId,
          sectionIds,
        });
      }
      await cleanupIsolatedProject(page, context);
    }
  });

  test("global variables kwargs use the shared flex row contract", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const context = await openIsolatedProject(page);
    const sectionIds: string[] = [];

    try {
      const sectionId = await createGlobalVariablesSection(
        page,
        context.projectConfigId,
      );
      sectionIds.push(sectionId);
      const paramId = await addSingleKwargAndReturnParamId(
        page,
        context.projectConfigId,
        sectionId,
      );

      const rowContract = await page.evaluate(
        ({ currentSectionId, currentParamId }) => {
          const row = document.getElementById(
            `ParamContainer-${currentSectionId}-${currentParamId}`,
          );
          if (!(row instanceof HTMLElement)) {
            throw new Error("Missing rendered GlobalVariables row.");
          }

          const nested = row.closest(".section-args-nested");
          if (!(nested instanceof HTMLElement)) {
            throw new Error("Missing shared nested row container.");
          }

          const value = row.querySelector(".section-value");
          if (!(value instanceof HTMLElement)) {
            throw new Error("Missing shared value shell.");
          }

          return {
            rowClassName: row.className,
            rowDisplay: window.getComputedStyle(row).display,
            nestedClassName: nested.className,
            nestedDisplay: window.getComputedStyle(nested).display,
            nestedFlexDirection: window.getComputedStyle(nested).flexDirection,
            valueDisplay: window.getComputedStyle(value).display,
            hasSectionParamRowClass: row.classList.contains("section-param-row"),
            hasGridClass: row.classList.contains("grid"),
            hasResizeHandle: Boolean(
              row.querySelector('[data-param-resize-handle="true"]'),
            ),
          };
        },
        { currentSectionId: sectionId, currentParamId: paramId },
      );

      // This is the live DOM contract the reopened checkpoint cares about.
      expect(rowContract.hasSectionParamRowClass).toBe(true);
      expect(rowContract.hasGridClass).toBe(false);
      expect(rowContract.rowDisplay).toBe("flex");
      expect(rowContract.nestedDisplay).toBe("flex");
      expect(rowContract.nestedFlexDirection).toBe("column");
      expect(rowContract.valueDisplay).toBe("flex");
      expect(rowContract.hasResizeHandle).toBe(true);
    } finally {
      if (sectionIds.length > 0) {
        await postBackend(page, "/deleteSections", {
          projectConfigId: context.projectConfigId,
          sectionIds,
        });
      }
      await cleanupIsolatedProject(page, context);
    }
  });
});
