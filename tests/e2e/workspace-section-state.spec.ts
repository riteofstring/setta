import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { addSampleSection } from "./workspace-test-helpers.js";

test("locks, minimizes, restores focus, and preserves host content state", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await addSampleSection(page);

  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  const article = workspace.getByRole("article", { name: "Sample section 1" });
  const selection = article.getByRole("button", { name: "Select Sample section 1" });
  const move = article.getByRole("button", { name: "Move Sample section 1" });
  const announcement = workspace.locator("[data-workspace-section-state-announcement]");
  await selection.click();
  const expandedBounds = await article.boundingBox();
  if (!expandedBounds) {
    throw new Error("The expanded section frame must be measurable.");
  }

  const lock = article.getByRole("button", { name: "Lock Sample section 1" });
  await expect(lock).toBeVisible();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  const lockBounds = await lock.boundingBox();
  expect(lockBounds?.height).toBeGreaterThanOrEqual(40);
  expect(lockBounds?.width).toBeGreaterThanOrEqual(40);

  await lock.focus();
  await lock.press("Enter");
  const unlock = article.getByRole("button", { name: "Unlock Sample section 1" });
  await expect(unlock).toHaveAttribute("aria-pressed", "true");
  await expect(unlock).toBeFocused();
  await expect(move).toBeDisabled();
  await expect(article).toHaveAttribute("data-workspace-locked", "true");
  await expect(article.getByText("Locked", { exact: true })).toBeVisible();
  await expect(announcement).toHaveText("Sample section 1 locked.");
  await expect(selection).toHaveAttribute("aria-pressed", "true");

  const minimize = article.getByRole("button", { name: "Minimize Sample section 1" });
  const contentId = await minimize.getAttribute("aria-controls");
  if (!contentId) {
    throw new Error("The minimize control must reference the section content target.");
  }
  const content = workspace.locator(`[id="${contentId}"]`);
  await expect(minimize).toHaveAttribute("aria-expanded", "true");
  await expect(content).toBeVisible();
  await expect(
    article.getByText("Host-rendered content inside the package-owned section frame."),
  ).toBeVisible();

  await minimize.focus();
  await minimize.press("Space");
  const expand = article.getByRole("button", { name: "Expand Sample section 1" });
  await expect(expand).toHaveAttribute("aria-controls", contentId);
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toBeFocused();
  await expect(content).toBeHidden();
  await expect(article.getByText("Minimized", { exact: true })).toBeVisible();
  await expect(
    article.getByText("Host-rendered content inside the package-owned section frame."),
  ).toHaveCount(0);
  await expect(announcement).toHaveText("Sample section 1 minimized.");
  await expect
    .poll(async () => (await article.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
    .toBeLessThan(expandedBounds.height);
  await expect(workspace).toHaveScreenshot("section-lock-minimize-controls.png");

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);

  await expand.press("Enter");
  const restoredMinimize = article.getByRole("button", { name: "Minimize Sample section 1" });
  await expect(restoredMinimize).toBeFocused();
  await expect(content).toBeVisible();
  await expect(
    article.getByText("Host-rendered content inside the package-owned section frame."),
  ).toBeVisible();
  await expect(announcement).toHaveText("Sample section 1 expanded.");
  await expect.poll(async () => (await article.boundingBox())?.height).toBe(expandedBounds.height);

  await unlock.press("Space");
  const restoredLock = article.getByRole("button", { name: "Lock Sample section 1" });
  await expect(restoredLock).toHaveAttribute("aria-pressed", "false");
  await expect(restoredLock).toBeFocused();
  await expect(move).toBeEnabled();
  await expect(article.getByText("Locked", { exact: true })).toHaveCount(0);
  await expect(announcement).toHaveText("Sample section 1 unlocked.");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(restoredLock).toHaveCSS("transition-duration", "0s");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  const coarseMinimizeBounds = await restoredMinimize.boundingBox();
  expect(coarseMinimizeBounds?.height).toBeGreaterThanOrEqual(44);
  expect(coarseMinimizeBounds?.width).toBeGreaterThanOrEqual(44);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect(restoredLock).toBeVisible();
  await expect(restoredMinimize).toBeVisible();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();

  await page.setViewportSize({ height: 800, width: 320 });
  await workspace.getByRole("button", { name: "Fit sections" }).click();
  await expect(restoredLock).toBeVisible();
  await expect(restoredMinimize).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test("live policy gates state controls and controlled rejection keeps canonical state", async ({
  page,
}) => {
  await page.goto("/?state-contract");

  const uncontrolled = page.getByRole("region", {
    name: "Uncontrolled workspace",
    exact: true,
  });
  await uncontrolled.getByRole("button", { name: "Select Alpha" }).click();
  const uncontrolledLock = uncontrolled.getByRole("button", { name: "Lock Alpha" });
  const uncontrolledMinimize = uncontrolled.getByRole("button", { name: "Minimize Alpha" });
  await expect(uncontrolledLock).toBeEnabled();
  await expect(uncontrolledMinimize).toBeEnabled();
  await page.getByRole("button", { name: "Turn read-only on" }).click();
  await expect(uncontrolledLock).toBeDisabled();
  await expect(uncontrolledMinimize).toBeDisabled();
  await page.getByRole("button", { name: "Turn editing on" }).click();
  await expect(uncontrolledLock).toBeEnabled();
  await expect(uncontrolledMinimize).toBeEnabled();

  const controlled = page.getByRole("region", { name: "Controlled workspace", exact: true });
  await controlled.getByRole("button", { name: "Select Alpha" }).click();
  await page.getByRole("checkbox", { name: "Accept controlled changes" }).uncheck();
  const controlledAnnouncement = controlled.locator("[data-workspace-section-state-announcement]");

  const controlledLock = controlled.getByRole("button", { name: "Lock Alpha" });
  await controlledLock.focus();
  await controlledLock.press("Enter");
  await expect(controlledLock).toHaveAttribute("aria-pressed", "false");
  await expect(controlledLock).toBeFocused();
  await expect(controlled.getByText("Locked", { exact: true })).toHaveCount(0);
  await expect(controlledAnnouncement).toHaveText(
    "Alpha remains unlocked because the host did not accept the change.",
  );

  const controlledMinimize = controlled.getByRole("button", { name: "Minimize Alpha" });
  await controlledMinimize.focus();
  await controlledMinimize.press("Enter");
  await expect(controlledMinimize).toHaveAttribute("aria-expanded", "true");
  await expect(controlledMinimize).toBeFocused();
  await expect(controlled.getByText("Minimized", { exact: true })).toHaveCount(0);
  await expect(controlledAnnouncement).toHaveText(
    "Alpha remains expanded because the host did not accept the change.",
  );
  await expect(controlled.getByText("alpha host renderer is editable.")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("restores minimize focus when headerless chrome is replaced", async ({ page }) => {
  await page.goto("/");
  await addSampleSection(page);

  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  const article = workspace.getByRole("article", { name: "Sample section 1" });
  await article.getByRole("button", { name: "Select Sample section 1" }).click();
  await article.getByRole("button", { name: "Style Sample section 1" }).click();
  const stylePanel = article.getByRole("dialog", { name: "Style Sample section 1" });
  await stylePanel.getByLabel("Chrome").selectOption("none");
  await stylePanel.getByRole("button", { name: "Close section style" }).click();
  await expect(article).toHaveAttribute("data-workspace-chrome", "none");

  const minimize = article.getByRole("button", { name: "Minimize Sample section 1" });
  await minimize.focus();
  await minimize.press("Enter");
  const expand = article.getByRole("button", { name: "Expand Sample section 1" });
  await expect(expand).toBeFocused();

  await expand.press("Enter");
  await expect(article).toHaveAttribute("data-workspace-chrome", "none");
  await expect(article.getByRole("button", { name: "Minimize Sample section 1" })).toBeFocused();
});
