import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { addSampleSection } from "./workspace-test-helpers.js";

test("section title and presentation editing stay accessible and canonical", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await addSampleSection(page);

  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  let article = workspace.getByRole("article", { name: "Sample section 1" });
  await article.getByRole("button", { name: "Select Sample section 1" }).click();
  const rename = article.getByRole("button", { name: "Rename Sample section 1" });
  await expect(rename).toBeVisible();
  await rename.click();

  let titleInput = workspace.getByRole("textbox", { name: "Section title" });
  await expect(titleInput).toBeFocused();
  await titleInput.fill("   ");
  await titleInput.press("Enter");
  await expect(titleInput).toHaveAttribute("aria-invalid", "true");
  await expect(titleInput).toBeFocused();
  await expect(workspace.getByText("Enter a section title.")).toBeVisible();

  await titleInput.fill("Reserved");
  await titleInput.press("Enter");
  await expect(workspace.getByText("Checking title…")).toBeVisible();
  await expect(titleInput).toHaveAttribute("readonly", "");
  await expect(
    workspace.getByText("Choose a different title. Reserved is unavailable."),
  ).toBeVisible();
  await expect(titleInput).toHaveAttribute("aria-invalid", "true");
  await expect(titleInput).toBeFocused();

  await titleInput.fill("Pending cancellation");
  await titleInput.press("Enter");
  await expect(workspace.getByText("Checking title…")).toBeVisible();
  await titleInput.press("Escape");
  await expect(article.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(rename).toBeFocused();
  await page.waitForTimeout(200);
  await expect(article.getByRole("heading", { name: "Sample section 1" })).toBeVisible();

  await rename.click();
  titleInput = workspace.getByRole("textbox", { name: "Section title" });
  await titleInput.fill("Cancelled title");
  await titleInput.press("Escape");
  await expect(article.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(rename).toBeFocused();

  await rename.click();
  titleInput = workspace.getByRole("textbox", { name: "Section title" });
  await titleInput.fill("  Planning note  ");
  await titleInput.press("Enter");
  article = workspace.getByRole("article", { name: "Planning note" });
  await expect(article.getByRole("heading", { name: "Planning note" })).toBeVisible();
  await expect(page.locator(".announcement")).toHaveText("Document change: section-title.");
  await expect(article.getByRole("button", { name: "Rename Planning note" })).toBeFocused();

  const style = article.getByRole("button", { name: "Style Planning note" });
  await style.click();
  const stylePanel = article.getByRole("dialog", { name: "Style Planning note" });
  const chrome = stylePanel.getByLabel("Chrome");
  await expect(chrome).toBeFocused();
  const tealAccent = stylePanel.getByRole("button", { name: "Use Teal accent" });
  await tealAccent.focus();
  await expect(article).toHaveAttribute("data-workspace-accent-color", "oklch(0.64 0.1 195)");
  await expect(page.locator(".announcement")).toHaveText("Document change: section-title.");
  await chrome.focus();
  await expect(article).not.toHaveAttribute("data-workspace-accent-color");
  await chrome.selectOption("transparent");
  await expect(article).toHaveAttribute("data-workspace-chrome", "transparent");
  await chrome.selectOption("default");
  await expect(article).toHaveAttribute("data-workspace-chrome", "default");
  await chrome.selectOption("compact");
  await expect(article).toHaveAttribute("data-workspace-chrome", "compact");
  await stylePanel.getByRole("button", { name: "Use Blue accent" }).click();
  await expect(article).toHaveAttribute("data-workspace-accent-color", "oklch(0.62 0.14 255)");
  await stylePanel.getByRole("button", { name: "Use Amber tag" }).click();
  await expect(article).toHaveAttribute("data-workspace-tag-color", "oklch(0.72 0.11 80)");
  await expect(article.getByText("Tagged")).toBeVisible();

  await stylePanel.getByRole("button", { name: "Reset accent" }).click();
  await expect(article).not.toHaveAttribute("data-workspace-accent-color");
  await stylePanel.getByRole("button", { name: "Use Blue accent" }).click();
  await expect(page.locator(".announcement")).toHaveText("Document change: section-presentation.");
  await stylePanel.evaluate((element) => element.scrollTo({ top: 0 }));
  await expect(workspace).toHaveScreenshot("section-presentation-editors.png");

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "dark");
  await expect(style).toHaveCSS("transition-duration", "0s");
  const darkAccessibility = await new AxeBuilder({ page })
    .include("[data-setta-workspace]")
    .analyze();
  expect(darkAccessibility.violations).toEqual([]);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });

  await chrome.selectOption("none");
  await stylePanel.getByRole("button", { name: "Close section style" }).click();
  await expect(article).toHaveAttribute("data-workspace-chrome", "none");
  await expect(style).toBeFocused();
  await style.press("Enter");
  await article
    .getByRole("dialog", { name: "Style Planning note" })
    .getByLabel("Chrome")
    .press("Escape");
  await expect(article.getByRole("dialog", { name: "Style Planning note" })).toHaveCount(0);
  await expect(style).toBeFocused();

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  const coarseRename = article.getByRole("button", { name: "Rename Planning note" });
  const coarseRenameBox = await coarseRename.boundingBox();
  expect(coarseRenameBox?.width).toBeGreaterThanOrEqual(44);
  expect(coarseRenameBox?.height).toBeGreaterThanOrEqual(44);
  await coarseRename.click();
  const coarseCancel = article.getByRole("button", { name: "Cancel title editing" });
  const coarseCancelBox = await coarseCancel.boundingBox();
  expect(coarseCancelBox?.width).toBeGreaterThanOrEqual(44);
  expect(coarseCancelBox?.height).toBeGreaterThanOrEqual(44);
  await workspace.getByRole("textbox", { name: "Section title" }).press("Escape");
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await article.getByRole("button", { name: "Rename Planning note" }).click();
  await expect(workspace.getByRole("textbox", { name: "Section title" })).toBeVisible();
  await workspace.getByRole("textbox", { name: "Section title" }).press("Escape");
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();

  await page.setViewportSize({ width: 320, height: 800 });
  await workspace.getByRole("button", { name: "Fit sections" }).click();
  await article.getByRole("button", { name: "Rename Planning note" }).click();
  await expect(workspace.getByRole("textbox", { name: "Section title" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await workspace.getByRole("textbox", { name: "Section title" }).press("Escape");
});

test("controlled hosts reconcile rejected title and style proposals truthfully", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?state-contract");

  const workspace = page.getByRole("region", { name: "Controlled workspace", exact: true });
  await page.getByRole("checkbox", { name: "Accept controlled changes" }).uncheck();
  const article = workspace.getByRole("article", { name: "Alpha" });
  await workspace.getByRole("button", { name: "Select Alpha" }).click();

  const rename = article.getByRole("button", { name: "Rename Alpha" });
  await rename.click();
  const titleInput = workspace.getByRole("textbox", { name: "Section title" });
  await titleInput.fill("Rejected Alpha");
  await titleInput.press("Enter");
  await expect(
    workspace.getByText(
      "Alpha remains the section title because the host did not accept the change.",
    ),
  ).toBeVisible();
  await expect(titleInput).toBeFocused();
  await expect(article).toHaveAccessibleName("Alpha");
  await titleInput.press("Escape");
  await expect(rename).toBeFocused();

  const style = article.getByRole("button", { name: "Style Alpha" });
  await style.click();
  const stylePanel = article.getByRole("dialog", { name: "Style Alpha" });
  const chrome = stylePanel.getByLabel("Chrome");
  await chrome.selectOption("compact");
  await expect(
    stylePanel.getByText("Chrome remains unchanged because the host did not accept the change."),
  ).toBeVisible();
  await expect(chrome).toHaveValue("default");
  await expect(article).toHaveAttribute("data-workspace-chrome", "default");
});

test("live presentation capability prevents frame editors before they start", async ({ page }) => {
  await page.goto("/?state-contract");
  const workspace = page.getByRole("region", { name: "Uncontrolled workspace", exact: true });
  const selection = workspace.getByRole("button", { name: "Select Alpha" });
  await selection.focus();
  await selection.press("Enter");
  const rename = workspace.getByRole("button", { name: "Rename Alpha" });
  const style = workspace.getByRole("button", { name: "Style Alpha" });
  await expect(rename).toBeEnabled();
  await expect(style).toBeEnabled();

  await style.focus();
  await style.press("Enter");
  await expect(workspace.getByRole("dialog", { name: "Style Alpha" })).toBeVisible();

  await page.getByRole("button", { name: "Turn read-only on" }).click();
  await expect(workspace.getByRole("dialog", { name: "Style Alpha" })).toHaveCount(0);
  await expect(rename).toBeDisabled();
  await expect(style).toBeDisabled();
  await expect(workspace.getByRole("textbox", { name: "Section title" })).toHaveCount(0);

  await page.getByRole("button", { name: "Turn editing on" }).click();
  await expect(rename).toBeEnabled();
  await expect(style).toBeEnabled();
  await rename.focus();
  await rename.press("Enter");
  await expect(workspace.getByRole("textbox", { name: "Section title" })).toBeVisible();
  await page.getByRole("button", { name: "Turn read-only on" }).click();
  await expect(workspace.getByRole("textbox", { name: "Section title" })).toHaveCount(0);
});
