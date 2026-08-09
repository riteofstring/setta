import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the visual matrix renders every chrome, state, and nesting sample", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?visual-matrix");

  const workspace = page.getByRole("region", { exact: true, name: "Visual matrix workspace" });
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "light");

  const chromeSamples = [
    ["Default chrome", "default"],
    ["Compact chrome", "compact"],
    ["Transparent chrome", "transparent"],
    ["Headerless chrome", "none"],
  ] as const;
  for (const [title, chrome] of chromeSamples) {
    await expect(workspace.getByRole("article", { name: title })).toHaveAttribute(
      "data-workspace-chrome",
      chrome,
    );
  }

  const accentTag = workspace.getByRole("article", { name: "Accent and tag" });
  await expect(accentTag).toHaveAttribute("data-workspace-accent-color", "oklch(0.62 0.14 255)");
  await expect(accentTag).toHaveAttribute("data-workspace-tag-color", "oklch(0.72 0.11 80)");

  const locked = workspace.getByRole("article", { name: "Locked section" });
  await expect(locked.getByText("Locked", { exact: true })).toBeVisible();
  await expect(locked.getByRole("button", { name: "Move Locked section" })).toBeDisabled();
  await expect(workspace.getByRole("article", { name: "Minimized section" })).toHaveAttribute(
    "data-workspace-minimized",
    "true",
  );

  const tower = workspace.getByRole("article", { name: "Vertical pair" });
  const deepGroup = tower.getByRole("article", { name: "Deep group" });
  await expect(deepGroup.getByRole("article", { name: "Deep leaf" })).toBeVisible();
  await expect(workspace.getByRole("article", { name: "Freeform container" })).toHaveAttribute(
    "data-workspace-child-positioning",
    "freeform",
  );
  await expect(workspace.getByRole("article", { name: "Empty container" })).toBeVisible();

  await page.getByRole("button", { name: "Select two sections" }).click();
  await expect(workspace.getByRole("article", { name: "Selection target" })).toHaveAttribute(
    "data-workspace-selected",
    "true",
  );
  await expect(workspace.getByRole("article", { name: "Default chrome" })).toHaveAttribute(
    "data-workspace-selected",
    "true",
  );

  await expect(
    page.getByRole("toolbar", { name: "Visual matrix workspace controls" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "Visual matrix workspace minimap" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the visual matrix honors the appearance and read-only query modes", async ({ page }) => {
  await page.goto("/?visual-matrix&appearance=dark&read-only");
  const workspace = page.getByRole("region", { exact: true, name: "Visual matrix workspace" });
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "dark");
  await expect(workspace.getByRole("article", { name: "Default chrome" })).toHaveAttribute(
    "data-workspace-read-only",
    "true",
  );
});
