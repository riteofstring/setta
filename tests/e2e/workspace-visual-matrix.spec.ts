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
  await expect(locked).toHaveAttribute("data-workspace-locked", "true");
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

test("the matrix reset control restores the canonical document arrangement", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?visual-matrix");
  const workspace = page.getByRole("region", { exact: true, name: "Visual matrix workspace" });
  const article = workspace.getByRole("article", { name: "Default chrome" });
  const before = await article.boundingBox();
  const handle = article.getByRole("button", { name: "Move Default chrome" });
  const handleBox = await handle.boundingBox();
  if (!before || !handleBox) {
    throw new Error("The default chrome section must expose browser geometry.");
  }

  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 96, start.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const moved = await article.boundingBox();
      return moved ? Math.round(moved.x - before.x) : null;
    })
    .toBeGreaterThan(48);

  await page.getByRole("button", { name: "Reset matrix document" }).click();
  await expect(page.getByText("Reset the matrix document.", { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const restored = await article.boundingBox();
      return restored ? Math.round(restored.x - before.x) : null;
    })
    .toBe(0);
});

test("the visual matrix honors the viewport query used by the interaction profiler", async ({
  page,
}) => {
  await page.goto("/?visual-matrix&zoom=1&viewport-x=0&viewport-y=0");
  const workspace = page.getByRole("region", { exact: true, name: "Visual matrix workspace" });
  const article = workspace.getByRole("article", { name: "Default chrome" });
  await expect(article).toBeVisible();
  const box = await article.boundingBox();
  if (!box) {
    throw new Error("The default chrome section must expose browser geometry.");
  }
  expect(Math.round(box.width)).toBe(240);
});
