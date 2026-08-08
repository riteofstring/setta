import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("structural history preserves viewport, selection, focus, and keyboard parity", async ({
  page,
}) => {
  await page.goto("/?state-contract");

  const workspace = page.getByRole("region", { name: "Uncontrolled workspace", exact: true });
  const panel = page.getByRole("region", { name: "Uncontrolled document" });
  const documentActions = panel.getByRole("group", { name: "Document actions" });
  const documentJson = page.getByTestId("uncontrolled-document");
  const selectAlpha = workspace.getByRole("button", { name: "Select Alpha" });
  const undo = page.getByRole("button", { name: "Undo uncontrolled change" });
  const redo = page.getByRole("button", { name: "Redo uncontrolled change" });
  const announcement = workspace.locator("[data-workspace-history-announcement]");

  await selectAlpha.click();
  await workspace.getByRole("button", { name: "Lock Alpha" }).click();
  await expect(workspace.getByRole("button", { name: "Unlock Alpha" })).toBeVisible();
  await expect(panel.getByText("Committed changes: 1")).toBeVisible();

  await page.getByRole("button", { name: "Pan uncontrolled viewport" }).click();
  await expect(documentJson).toHaveValue(/"x": 64/u);
  await expect(documentJson).toHaveValue(/"zoom": 1\.5/u);

  await selectAlpha.focus();
  await page.keyboard.press("Control+z");
  await expect(announcement).toHaveText("Undo complete.");
  await expect(workspace.getByRole("button", { name: "Lock Alpha" })).toBeVisible();
  await expect(selectAlpha).toHaveAttribute("aria-pressed", "true");
  await expect(selectAlpha).toBeFocused();
  await expect(documentJson).toHaveValue(/"x": 64/u);
  await expect(documentJson).toHaveValue(/"zoom": 1\.5/u);

  await page.keyboard.press("Control+Shift+z");
  await expect(announcement).toHaveText("Redo complete.");
  await expect(workspace.getByRole("button", { name: "Unlock Alpha" })).toBeVisible();

  await undo.click();
  await expect(announcement).toHaveText("Undo complete.");
  await expect(undo).toBeFocused();
  await redo.click();
  await expect(announcement).toHaveText("Redo complete.");
  await expect(redo).toBeFocused();

  const hostInput = workspace.getByRole("textbox", { name: "Host note" });
  await hostInput.fill("Local text history");
  await hostInput.press("Control+z");
  await expect(hostInput).toHaveValue("Local text history");
  await expect(announcement).toHaveText("Redo complete.");
  await expect(workspace.getByRole("button", { name: "Unlock Alpha" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).include("#state-contract-content").analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(documentActions).toHaveScreenshot("structural-history-controls.png");

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect(undo).toBeVisible();
  await expect(redo).toBeVisible();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();

  await page.setViewportSize({ height: 720, width: 320 });
  const reflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(reflow.scrollWidth).toBeLessThanOrEqual(reflow.clientWidth);
});

test("controlled history records acceptance and retains entries after host rejection", async ({
  page,
}) => {
  await page.goto("/?state-contract");

  const workspace = page.getByRole("region", { name: "Controlled workspace", exact: true });
  const acceptChanges = page.getByRole("checkbox", { name: "Accept controlled changes" });
  const documentJson = page.getByTestId("controlled-document");
  const undo = page.getByRole("button", { name: "Undo controlled change" });
  const redo = page.getByRole("button", { name: "Redo controlled change" });
  const announcement = workspace.locator("[data-workspace-history-announcement]");

  await workspace.getByRole("button", { name: "Select Alpha" }).click();
  await workspace.getByRole("button", { name: "Lock Alpha" }).click();
  await expect(documentJson).toHaveValue(/"positionAndSizeLocked": true/u);

  await acceptChanges.uncheck();
  await undo.click();
  await expect(announcement).toHaveText("Undo was not accepted by the controlled host.");
  await expect(documentJson).toHaveValue(/"positionAndSizeLocked": true/u);
  await expect(undo).toBeFocused();

  await acceptChanges.check();
  await undo.click();
  await expect(announcement).toHaveText("Undo complete.");
  await expect(documentJson).toHaveValue(/"positionAndSizeLocked": false/u);
  await redo.click();
  await expect(announcement).toHaveText("Redo complete.");
  await expect(documentJson).toHaveValue(/"positionAndSizeLocked": true/u);
});
