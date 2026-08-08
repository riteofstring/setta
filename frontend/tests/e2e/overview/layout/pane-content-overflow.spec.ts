import { expect, test, type Page } from "@playwright/test";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  openOverviewMoreDestination,
  postBackend,
  seedLocalStorage,
} from "../../helpers";

const OVERFLOW_TOLERANCE_PX = 6;
const MIN_CONTENT_INSET_PX = 4;

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

async function assertPaneContentHasHorizontalInset(
  page: Page,
  paneSelector: string,
  shellTestId: string,
  contextLabel: string,
): Promise<void> {
  const shell = page.getByTestId(shellTestId).first();
  await expect(shell).toBeVisible();

  const insetStats = await page.evaluate(
    ({ targetPaneSelector, targetShellTestId }) => {
      const pane = document.querySelector(targetPaneSelector);
      const shellElement = document.querySelector(
        `[data-testid="${targetShellTestId}"]`,
      );
      if (
        !(pane instanceof HTMLElement) ||
        !(shellElement instanceof HTMLElement)
      ) {
        return null;
      }
      const paneRect = pane.getBoundingClientRect();
      const shellRect = shellElement.getBoundingClientRect();
      return {
        leftInset: shellRect.left - paneRect.left,
        rightInset: paneRect.right - shellRect.right,
      };
    },
    { targetPaneSelector: paneSelector, targetShellTestId: shellTestId },
  );

  if (!insetStats) {
    throw new Error(`Unable to compute inset stats for ${contextLabel}.`);
  }
  if (insetStats.leftInset < MIN_CONTENT_INSET_PX) {
    throw new Error(
      `${contextLabel} left inset too small: ${insetStats.leftInset}px`,
    );
  }
  if (insetStats.rightInset < MIN_CONTENT_INSET_PX) {
    throw new Error(
      `${contextLabel} right inset too small: ${insetStats.rightInset}px`,
    );
  }
}

async function assertPaneTitleClearsFullscreenButton(
  page: Page,
  {
    fullscreenButtonTestId,
    headingText,
    contextLabel,
  }: {
    fullscreenButtonTestId: string;
    headingText: string;
    contextLabel: string;
  },
): Promise<void> {
  const titleStats = await page.evaluate(
    ({ targetButtonTestId, targetHeadingText }) => {
      const button = document.querySelector(
        `[data-testid="${targetButtonTestId}"]`,
      );
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === targetHeadingText,
      );
      if (!(button instanceof HTMLElement) || !(heading instanceof HTMLElement)) {
        return null;
      }
      const buttonRect = button.getBoundingClientRect();
      const textNode = Array.from(heading.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      const textRange = textNode ? document.createRange() : null;
      if (textNode && textRange) {
        textRange.selectNodeContents(textNode);
      }
      const headingRect =
        textRange?.getBoundingClientRect() ?? heading.getBoundingClientRect();
      return {
        buttonRight: buttonRect.right,
        headingLeft: headingRect.left,
      };
    },
    {
      targetButtonTestId: fullscreenButtonTestId,
      targetHeadingText: headingText,
    },
  );

  if (!titleStats) {
    throw new Error(`Unable to compute title clearance for ${contextLabel}.`);
  }
  if (titleStats.headingLeft <= titleStats.buttonRight) {
    throw new Error(
      `${contextLabel} heading overlaps the fullscreen button: headingLeft=${titleStats.headingLeft}px buttonRight=${titleStats.buttonRight}px`,
    );
  }
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
    overviewTab: "Overview",
  });
  await ensureAppReady(page);

  await createCallableSectionAndFocus(page);

  const overviewTabs: Array<{
    label: string;
    open: () => Promise<void>;
  }> = [
    {
      label: "overview custom runs",
      open: () => openOverviewMoreDestination(page, "Custom Runs"),
    },
    {
      label: "overview-tab-view-modes",
      open: () => page.getByTestId("overview-tab-view-modes").click(),
    },
    {
      label: "overview-tab-notifications",
      open: () => page.getByTestId("overview-tab-notifications").click(),
    },
  ];
  for (const overviewTab of overviewTabs) {
    await overviewTab.open();
    await assertPaneHasNoRightBleed(
      page,
      "#OverviewPane aside",
      `overview tab ${overviewTab.label}`,
    );
    await assertPaneContentHasHorizontalInset(
      page,
      "#OverviewPane aside",
      "overview-tab-content-shell",
      `overview tab ${overviewTab.label}`,
    );
  }

  const uiEditorTabs = [
    "ui-editor-tab-ui-config",
    "ui-editor-tab-quick-info-config",
    "ui-editor-tab-section-variants-config",
    "ui-editor-tab-section-config",
  ];
  for (const tabTestId of uiEditorTabs) {
    await page.getByTestId(tabTestId).click();
    await assertPaneHasNoRightBleed(
      page,
      "#UiEditorPane aside",
      `ui editor tab ${tabTestId}`,
    );
    await assertPaneContentHasHorizontalInset(
      page,
      "#UiEditorPane aside",
      "ui-editor-tab-content-shell",
      `ui editor tab ${tabTestId}`,
    );
  }
});

test("right-side pane titles clear the fullscreen button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ensureAppReady(page);
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("home-selected-project-details")).toBeVisible();
  await expect(
    page.getByTestId("homeSelectedProject-pane-fullscreen-button"),
  ).toBeVisible();

  await assertPaneTitleClearsFullscreenButton(page, {
    fullscreenButtonTestId: "homeSelectedProject-pane-fullscreen-button",
    headingText: "Selected Project",
    contextLabel: "home selected-project pane",
  });
});
