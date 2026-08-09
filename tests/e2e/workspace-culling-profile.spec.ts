import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Guards the public culling-profile route that perf:culling drives: the
 * deterministic 305-section document, subtree-dropping culling, focus
 * pinning across a far offscreen displacement, and the hidden upstream
 * attribution badge.
 */
test("the culling profile route bounds a large document and pins the focused target", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  // Place the "Pinned target" cell (document 2,184–2,444 × 1,704–1,854) and
  // its "Note r3 c5" neighbor inside the initial canvas viewport.
  await page.goto("/?culling-profile&zoom=1&viewport-x=-1814&viewport-y=-1479");
  await expect(page.getByTestId("culling-profile-section-count")).toHaveText("305");
  const workspace = page.getByRole("region", {
    exact: true,
    name: "Culling profile workspace",
  });
  const canvas = workspace.locator(".setta-workspace__canvas");
  await expect(canvas).toHaveAttribute("data-workspace-viewport-culling", "true");
  await expect
    .poll(() => workspace.locator('[data-workspace-culled="true"]').count())
    .toBeGreaterThan(50);
  // A culled container drops its whole subtree behind one placeholder, so
  // far fewer frames mount than the document's 305 sections.
  expect(await workspace.locator("[data-workspace-section-id]").count()).toBeLessThan(200);
  expect(await workspace.locator(".culling-profile-note").count()).toBeLessThan(60);
  expect(await page.locator(".react-flow__attribution").count()).toBe(0);

  const pinnedTarget = workspace.getByRole("article", { name: "Pinned target" });
  await pinnedTarget.click();
  await expect(pinnedTarget).toHaveAttribute("data-workspace-culled", "false");
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds) {
    throw new Error("The culling profile canvas has no browser bounds.");
  }
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page.mouse.wheel(0, 3_600);
  const neighbor = workspace.getByRole("article", { name: "Note r3 c5" });
  await expect(neighbor).toHaveAttribute("data-workspace-culled", "true");
  await expect(pinnedTarget).toHaveAttribute("data-workspace-culled", "false");
  await expect(pinnedTarget).toContainText("Leaf host content for Pinned target.");

  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Culling profile workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
