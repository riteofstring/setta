import { expect, test, type Page } from "@playwright/test";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
  seedLocalStorage,
} from "../helpers";

const OVERFLOW_TOLERANCE_PX = 6;

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

async function assertPaneHasNoRightBleed(
  page: Page,
  paneSelector: string,
  contextLabel: string,
): Promise<void> {
  const paneRoot = page.locator(paneSelector).first();
  await expect(paneRoot).toBeVisible();

  const overflowStats = await paneRoot.evaluate((root) => {
    const rootRect = root.getBoundingClientRect();
    let maxOverflow = 0;

    for (const child of root.querySelectorAll<HTMLElement>("*")) {
      if (!child.offsetParent) {
        continue;
      }
      const styles = getComputedStyle(child);
      if (styles.position === "fixed") {
        continue;
      }
      const childRect = child.getBoundingClientRect();
      if (childRect.width <= 0 || childRect.height <= 0) {
        continue;
      }
      maxOverflow = Math.max(maxOverflow, childRect.right - rootRect.right);
    }

    return { maxOverflow };
  });

  if (overflowStats.maxOverflow > OVERFLOW_TOLERANCE_PX) {
    throw new Error(
      `${contextLabel} exceeded geometry overflow tolerance: ${overflowStats.maxOverflow}px`,
    );
  }
}

async function createCallableSectionAndFocus(page: Page): Promise<void> {
  const projectConfigId = await getCurrentProjectConfigId(page);
  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Callable",
    },
  );
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error("Failed to create callable section for overflow test.");
  }

  await page.evaluate(async (targetSectionId: string) => {
    const { applyActiveSectionChange } = await import(
      "/src/state/actions/activeSectionController"
    );
    applyActiveSectionChange({
      interaction: "go-to",
      sectionId: targetSectionId,
    });
  }, sectionId);
}

test("overview and ui-editor pane content stays clipped at narrow widths", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewVis: true,
    uiEditorVis: true,
    overviewWidth: 250,
    overviewTrueWidth: 250,
    uiEditorWidth: 425,
    uiEditorTrueWidth: 425,
    overviewTab: "RunInstructions",
  });
  await ensureAppReady(page);

  await createCallableSectionAndFocus(page);

  const overviewTabs = [
    "overview-tab-run-instructions",
    "overview-tab-project-configs",
    "overview-tab-notifications",
  ];
  for (const tabTestId of overviewTabs) {
    await page.getByTestId(tabTestId).click();
    await assertPaneHasNoRightBleed(
      page,
      "#OverviewPane aside",
      `overview tab ${tabTestId}`,
    );
  }

  const uiEditorTabs = [
    "ui-editor-tab-section-config",
    "ui-editor-tab-ui-config",
    "ui-editor-tab-quick-info-config",
    "ui-editor-tab-section-variants-config",
  ];
  for (const tabTestId of uiEditorTabs) {
    await page.getByTestId(tabTestId).click();
    await assertPaneHasNoRightBleed(
      page,
      "#UiEditorPane aside",
      `ui editor tab ${tabTestId}`,
    );
  }
});
