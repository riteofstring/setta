import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { addSampleSection } from "./workspace-test-helpers.js";

async function openDetachedWindow(control: Locator, ownerPage: Page): Promise<Page> {
  const popupPromise = ownerPage.waitForEvent("popup");
  await control.click();
  const popup = await popupPromise;
  await expect(popup.locator("[data-setta-workspace-detached-section]")).toHaveAttribute(
    "data-setta-workspace-detached-section",
    "sample-1",
  );
  return popup;
}

test("detached sections preserve live state, theme, accessibility, and redock focus", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await addSampleSection(page);

  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  const article = workspace.getByRole("article", { name: "Sample section 1" });
  await article.getByRole("button", { name: "Select Sample section 1" }).click();
  const detach = article.getByRole("button", {
    name: "Open Sample section 1 in a new window",
  });
  const popup = await openDetachedWindow(detach, page);
  await popup.setViewportSize({ height: 560, width: 720 });

  await expect(page.locator(".announcement")).toHaveText(
    /Sample section 1 opened in a \d+ by \d+ window\./u,
  );
  await expect(article).toHaveAttribute("data-workspace-detached", "true");
  await expect(article.getByText("Detached", { exact: true })).toBeVisible();
  await expect(article.getByRole("button", { name: "Move Sample section 1" })).toBeDisabled();
  await expect(article.locator("[data-workspace-resize-handle]")).toHaveCount(0);
  const placeholder = article.locator("[data-workspace-detached-placeholder]");
  await expect(placeholder).toContainText("Sample section 1 is open in another window.");
  await expect(placeholder.getByRole("button", { name: "Focus window" })).toBeVisible();
  await expect(placeholder.getByRole("button", { name: "Redock section" })).toBeVisible();
  await expect(
    article.getByText("Host-rendered content inside the package-owned section frame."),
  ).toHaveCount(0);

  await expect(popup).toHaveTitle("Sample section 1");
  await expect(popup.getByRole("heading", { name: "Sample section 1", level: 1 })).toBeFocused();
  await expect(
    popup.getByText("Host-rendered content inside the package-owned section frame."),
  ).toBeVisible();
  await expect(popup.locator('meta[name="setta-workspace-renderer"]')).toHaveAttribute(
    "content",
    "playground-note",
  );
  expect(
    await popup.evaluate(() =>
      Boolean(window.opener?.document.querySelector('[aria-label="Section workspace"]')),
    ),
  ).toBe(true);
  await expect(popup.locator(".sample-section-copy")).toHaveCSS("font-weight", "600");

  await article.getByRole("button", { name: "Rename Sample section 1" }).click();
  const titleInput = article.getByRole("textbox", { name: "Section title" });
  await titleInput.fill("Detached planning note");
  await titleInput.press("Enter");
  await expect(popup).toHaveTitle("Detached planning note");
  await expect(
    popup.getByRole("heading", { name: "Detached planning note", level: 1 }),
  ).toBeVisible();

  await page.getByLabel("Appearance").selectOption("dark");
  await expect(popup.locator("[data-setta-workspace-detached-section]")).toHaveAttribute(
    "data-workspace-resolved-appearance",
    "dark",
  );
  await expect(popup.locator(".setta-workspace__detached-window")).toHaveCSS(
    "color-scheme",
    "dark",
  );
  await expect(workspace).toHaveScreenshot("section-detached-placeholder.png");
  await expect(popup).toHaveScreenshot("section-detached-window.png");

  const ownerAccessibility = await new AxeBuilder({ page })
    .include("[data-setta-workspace]")
    .analyze();
  expect(ownerAccessibility.violations).toEqual([]);
  const popupAccessibility = await new AxeBuilder({ page: popup })
    .include("[data-setta-workspace-detached-section]")
    .analyze();
  expect(popupAccessibility.violations).toEqual([]);

  await popup.getByRole("button", { name: "Return to workspace" }).click();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator(".announcement")).toHaveText(
    "Detached planning note returned to the workspace.",
  );
  const redockedArticle = workspace.getByRole("article", { name: "Detached planning note" });
  await expect(redockedArticle).toHaveAttribute("data-workspace-detached", "false");
  await expect(
    redockedArticle.getByText("Host-rendered content inside the package-owned section frame."),
  ).toBeVisible();
  await expect(
    redockedArticle.getByRole("button", {
      name: "Open Detached planning note in a new window",
    }),
  ).toBeFocused();
});

test("popup blocking leaves the renderer docked with actionable feedback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: () => null,
    });
  });
  await page.goto("/");
  await addSampleSection(page);

  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  const article = workspace.getByRole("article", { name: "Sample section 1" });
  await article.getByRole("button", { name: "Select Sample section 1" }).click();
  const detach = article.getByRole("button", {
    name: "Open Sample section 1 in a new window",
  });
  await detach.click();

  await expect(article).toHaveAttribute("data-workspace-detached", "false");
  await expect(
    article.getByText("Host-rendered content inside the package-owned section frame."),
  ).toBeVisible();
  await expect(detach).toBeFocused();
  await expect(page.locator("[data-workspace-detachment-announcement]")).toHaveText(
    "Unable to open Sample section 1 in a new window. Allow pop-ups for this site and try again.",
  );
});

test("host policy can reject detachment before a popup opens", async ({ page }) => {
  await page.goto("/");
  await addSampleSection(page);

  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  const article = workspace.getByRole("article", { name: "Sample section 1" });
  await article.getByRole("button", { name: "Select Sample section 1" }).click();
  await article.getByRole("button", { name: "Rename Sample section 1" }).click();
  const titleInput = article.getByRole("textbox", { name: "Section title" });
  await titleInput.fill("Docked-only note");
  await titleInput.press("Enter");
  const renamedArticle = workspace.getByRole("article", { name: "Docked-only note" });
  const detach = renamedArticle.getByRole("button", {
    name: "Open Docked-only note in a new window",
  });
  await detach.click();

  await expect(renamedArticle).toHaveAttribute("data-workspace-detached", "false");
  await expect(detach).toBeFocused();
  await expect(page.locator("[data-workspace-detachment-announcement]")).toHaveText(
    "Docked-only note stayed in the workspace. The playground host requires this section to stay docked.",
  );
});

test("window closure, reload, and opener loss redock instead of stranding the renderer", async ({
  page,
}) => {
  await page.goto("/");
  await addSampleSection(page);

  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  const article = workspace.getByRole("article", { name: "Sample section 1" });
  await article.getByRole("button", { name: "Select Sample section 1" }).click();
  const detach = article.getByRole("button", {
    name: "Open Sample section 1 in a new window",
  });
  const closedPopup = await openDetachedWindow(detach, page);
  await closedPopup.close();
  await expect(article).toHaveAttribute("data-workspace-detached", "false");
  await expect(detach).toBeFocused();

  const reloadedPopup = await openDetachedWindow(detach, page);
  await reloadedPopup.evaluate(() => {
    window.setTimeout(() => window.location.reload(), 50);
  });
  await expect(article).toHaveAttribute("data-workspace-detached", "false");
  await expect.poll(() => reloadedPopup.isClosed()).toBe(true);
  await expect(detach).toBeFocused();

  const openerlessPopup = await openDetachedWindow(detach, page);
  await openerlessPopup.evaluate(() => {
    window.opener = null;
  });

  await expect(article).toHaveAttribute("data-workspace-detached", "false");
  await expect.poll(() => openerlessPopup.isClosed()).toBe(true);
  await expect(
    article.getByText("Host-rendered content inside the package-owned section frame."),
  ).toBeVisible();
  await expect(page.locator("[data-workspace-detachment-announcement]")).toHaveText(
    "Sample section 1 returned because its window closed, reloaded, or lost its opener.",
  );
  await expect(detach).toBeFocused();
});
