import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../../helpers";

type PersistedPaneState = {
  overviewVis: boolean;
  overviewTrueWidth: number;
  uiEditorVis: boolean;
  uiEditorTrueWidth: number;
};

async function readPaneState(page: Page): Promise<PersistedPaneState> {
  const state = await page.evaluate(() => {
    const raw = window.localStorage.getItem("setta_data");
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const persisted = parsed.state;
    if (!persisted) {
      return null;
    }
    return {
      overviewVis: Boolean(persisted.overviewVis),
      overviewTrueWidth: Number(persisted.overviewTrueWidth ?? 0),
      uiEditorVis: Boolean(persisted.uiEditorVis),
      uiEditorTrueWidth: Number(persisted.uiEditorTrueWidth ?? 0),
    };
  });
  if (!state) {
    throw new Error("Missing persisted pane state.");
  }
  return state;
}

test("opening the opposing pane pushes the current pane just enough", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedLocalStorage(page, {
    overviewVis: true,
    overviewWidth: 1050,
    overviewTrueWidth: 1050,
    uiEditorVis: false,
    uiEditorWidth: 500,
    uiEditorTrueWidth: 40,
  });
  await ensureAppReady(page);

  await page.getByTestId("ui-editor-tab-section-config").click();
  await expect.poll(() => readPaneState(page)).toMatchObject({
    uiEditorVis: true,
    overviewVis: true,
  });

  const paneState = await readPaneState(page);
  expect(paneState.overviewTrueWidth).toBeLessThan(1050);
  expect(paneState.overviewTrueWidth).toBeGreaterThanOrEqual(250);
  expect(paneState.uiEditorTrueWidth).toBe(500);
});

test("full-screen pane mode closes the opposite pane and swaps cleanly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedLocalStorage(page, {
    overviewVis: true,
    overviewWidth: 420,
    overviewTrueWidth: 420,
    uiEditorVis: true,
    uiEditorWidth: 500,
    uiEditorTrueWidth: 500,
  });
  await ensureAppReady(page);

  await page.getByTestId("overview-pane-fullscreen-button").click();
  await expect.poll(() => readPaneState(page)).toMatchObject({
    overviewVis: true,
    overviewTrueWidth: 1240,
    uiEditorVis: false,
    uiEditorTrueWidth: 40,
  });

  await page.getByTestId("ui-editor-tab-section-config").click();
  await expect.poll(() => readPaneState(page)).toMatchObject({
    uiEditorVis: true,
    overviewVis: false,
  });
});
