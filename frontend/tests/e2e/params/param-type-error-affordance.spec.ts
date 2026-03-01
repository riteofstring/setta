import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const TARGET_CALLABLE = "sorted";
const IS_DARWIN = process.platform === "darwin";
let warnedAboutCrossPlatformScreenshots = false;

test("type error context menu includes ignore action for a param", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(page, context.projectConfigId);
    await postBackend(page, "/setCallable", {
      projectConfigId: context.projectConfigId,
      sectionId,
      callableName: TARGET_CALLABLE,
      refetchParams: true,
    });

    const sectionNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    await expect(sectionNode).toBeVisible();

    const paramId = await getFirstParamId(page, sectionId);
    await openTypeErrorContextMenuForParam(page, sectionId, paramId);

    const ignoreTypeErrorsItem = page.getByText("Ignore Type Errors", {
      exact: true,
    });
    await expect(ignoreTypeErrorsItem).toBeVisible();
    await expectMacOnlyScreenshot(
      ignoreTypeErrorsItem,
      "type-error-ignore-item.png",
    );
  } finally {
    await cleanupIsolatedProject(page, context);
  }
});

async function getFirstParamId(page: Page, sectionId: string): Promise<string> {
  const id = await page
    .locator(`[id^="ParamContainer-${sectionId}-"][data-param-row="true"]`)
    .first()
    .getAttribute("id");
  if (!id) {
    throw new Error("Missing first param row id.");
  }
  const prefix = `ParamContainer-${sectionId}-`;
  if (!id.startsWith(prefix)) {
    throw new Error(`Unexpected param row id format: ${id}`);
  }
  const paramId = id.slice(prefix.length);
  if (!paramId) {
    throw new Error("Parsed empty param id.");
  }
  return paramId;
}

async function openTypeErrorContextMenuForParam(
  page: Page,
  sectionId: string,
  paramId: string,
): Promise<void> {
  await page.evaluate(
    async ({ targetSectionId, targetParamId }) => {
      const { openTypeErrorContextMenu } = await import(
        "/src/state/actions/contextMenus"
      );
      openTypeErrorContextMenu(
        {
          preventDefault: () => {},
          clientX: window.innerWidth * 0.5,
          clientY: window.innerHeight * 0.5,
        },
        targetSectionId,
        targetParamId,
      );
    },
    { targetSectionId: sectionId, targetParamId: paramId },
  );
}

async function expectMacOnlyScreenshot(
  locator: Locator,
  fileName: string,
): Promise<void> {
  if (!IS_DARWIN) {
    if (!warnedAboutCrossPlatformScreenshots) {
      warnedAboutCrossPlatformScreenshots = true;
      console.warn(
        "[param-type-error-affordance] Screenshot assertions are currently macOS-only. Cross-platform baselines remain to be added.",
      );
    }
    return;
  }
  await expect(locator).toHaveScreenshot(fileName, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
  });
}
