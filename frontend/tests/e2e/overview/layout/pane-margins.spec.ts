import { expect, test, type Locator } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../../helpers";

const MIN_PADDING_PX = 8;
const MAX_PADDING_PX = 12;
const MIN_LEFT_PADDING_PX = 34;
const MAX_LEFT_PADDING_PX = 38;
const MIN_RIGHT_PADDING_PX = 26;
const MAX_RIGHT_PADDING_PX = 30;

test("overview and ui editor panes use reduced padding", async ({ page }) => {
  await seedLocalStorage(page, {
    overviewVis: true,
    overviewTab: "FileBrowser",
    uiEditorVis: true,
  });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane aside").first();
  await expect(overviewPane).toBeVisible();
  const overviewPadding = await getPadding(overviewPane);
  expect(overviewPadding.top).toBeGreaterThanOrEqual(MIN_PADDING_PX);
  expect(overviewPadding.top).toBeLessThanOrEqual(MAX_PADDING_PX);
  expect(overviewPadding.left).toBeGreaterThanOrEqual(MIN_LEFT_PADDING_PX);
  expect(overviewPadding.left).toBeLessThanOrEqual(MAX_LEFT_PADDING_PX);

  const uiEditorPane = page.locator("#UiEditorPane aside").first();
  await expect(uiEditorPane).toBeVisible();
  const uiEditorPadding = await getPadding(uiEditorPane);
  expect(uiEditorPadding.top).toBeGreaterThanOrEqual(MIN_PADDING_PX);
  expect(uiEditorPadding.top).toBeLessThanOrEqual(MAX_PADDING_PX);
  expect(uiEditorPadding.right).toBeGreaterThanOrEqual(MIN_RIGHT_PADDING_PX);
  expect(uiEditorPadding.right).toBeLessThanOrEqual(MAX_RIGHT_PADDING_PX);
});

async function getPadding(locator: Locator): Promise<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}> {
  return locator.evaluate((el) => {
    const styles = getComputedStyle(el);
    return {
      top: Number.parseFloat(styles.paddingTop),
      right: Number.parseFloat(styles.paddingRight),
      bottom: Number.parseFloat(styles.paddingBottom),
      left: Number.parseFloat(styles.paddingLeft),
    };
  });
}
