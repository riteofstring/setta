import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const proofUrl = "/?nested-freeform-proof";

async function waitForStoreCount(locator: Locator, expected: number): Promise<void> {
  await expect.poll(async () => Number(await locator.textContent())).toBe(expected);
}

async function viewportTransform(candidate: Locator): Promise<string> {
  return candidate
    .locator(":scope .react-flow__viewport")
    .first()
    .evaluate((element) => {
      return getComputedStyle(element).transform;
    });
}

async function recursiveSectionBox(page: Page, sectionId: string) {
  const box = await page.locator(`[data-proof-recursive-section="${sectionId}"]`).boundingBox();
  if (!box) throw new Error(`Recursive proof section ${sectionId} must be visible.`);
  return box;
}

test.describe("Phase 6 nested freeform representation proof", () => {
  test("rejects both XYFlow challenger projections on executable DOM and store invariants", async ({
    page,
  }) => {
    await page.goto(proofUrl);

    const flatCandidate = page.locator('[data-proof-candidate="all-sections-xyflow"]');
    const nestedCandidate = page.locator('[data-proof-candidate="nested-xyflow"]');
    const recursiveCandidate = page.locator('[data-proof-candidate="recursive-dom"]');
    await expect(flatCandidate).toHaveAttribute("data-proof-verdict", "rejected");
    await expect(nestedCandidate).toHaveAttribute("data-proof-verdict", "rejected");
    await expect(recursiveCandidate).toHaveAttribute("data-proof-verdict", "selected");

    await expect
      .poll(() =>
        flatCandidate.evaluate((candidate) => {
          const parent = candidate.querySelector('.react-flow__node[data-id="flat-parent"]');
          const child = candidate.querySelector('.react-flow__node[data-id="flat-child"]');
          return Boolean(
            parent &&
            child &&
            parent.parentElement === child.parentElement &&
            !parent.contains(child),
          );
        }),
      )
      .toBe(true);

    await waitForStoreCount(nestedCandidate.locator('[data-proof-store-count="nested-xyflow"]'), 7);
    await expect(nestedCandidate.locator(".react-flow__viewport")).toHaveCount(7);
    await expect(nestedCandidate.locator("[data-proof-inner-flow]")).toHaveCount(6);

    await waitForStoreCount(
      recursiveCandidate.locator('[data-proof-store-count="recursive-dom"]'),
      1,
    );
    await expect(recursiveCandidate.locator(".react-flow__viewport")).toHaveCount(1);
    await expect(recursiveCandidate.locator("[data-proof-recursive-container]")).toHaveCount(6);
  });

  test("keeps one viewport through switching, native scroll, spatial movement, and reparenting", async ({
    page,
  }) => {
    await page.goto(proofUrl);
    const candidate = page.locator('[data-proof-candidate="recursive-dom"]');
    const region = candidate.locator("[data-proof-positioning]");
    const layoutControl = candidate.getByRole("button", { name: "Use freeform layout" });
    const parentControl = candidate.getByRole("button", {
      name: "Move Beta into ordered container",
    });
    const scrollRegion = candidate.getByRole("region", { name: "Nested ordered section list" });

    await expect(region).toHaveAttribute("data-proof-positioning", "ordered");
    await expect
      .poll(() => scrollRegion.evaluate((element) => element.scrollHeight > element.clientHeight))
      .toBe(true);
    const viewportBeforeScroll = await viewportTransform(candidate);
    await scrollRegion.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await candidate.getByRole("button", { name: "Ordered child 8" }).focus();
    await expect(candidate.getByRole("button", { name: "Ordered child 8" })).toBeFocused();
    expect(await viewportTransform(candidate)).toBe(viewportBeforeScroll);

    await layoutControl.click();
    await expect(region).toHaveAttribute("data-proof-positioning", "freeform");
    const alphaBefore = await recursiveSectionBox(page, "alpha");
    const betaBefore = await recursiveSectionBox(page, "beta");
    await candidate.getByRole("button", { name: "Move selected block" }).click();
    const alphaAfter = await recursiveSectionBox(page, "alpha");
    const betaAfter = await recursiveSectionBox(page, "beta");
    expect(alphaAfter.x - alphaBefore.x).toBeCloseTo(betaAfter.x - betaBefore.x, 1);
    expect(alphaAfter.y - alphaBefore.y).toBeCloseTo(betaAfter.y - betaBefore.y, 1);
    expect(alphaAfter.x - alphaBefore.x).toBeCloseTo(24, 1);
    expect(alphaAfter.y - alphaBefore.y).toBeCloseTo(16, 1);
    await expect(candidate.locator('[data-proof-command-count="recursive-dom"]')).toHaveText("1");
    await expect(candidate.getByRole("status")).toContainText("one atomic local-space command");

    await parentControl.click();
    await expect(
      candidate.getByRole("button", { name: "Move Beta to freeform parent" }),
    ).toBeFocused();
    await expect(scrollRegion.locator('[data-proof-recursive-section="beta"]')).toHaveCount(1);
    await expect(candidate.locator('[data-proof-command-count="recursive-dom"]')).toHaveText("2");
    await candidate.getByRole("button", { name: "Move Beta to freeform parent" }).click();
    await expect(region.locator(':scope > [data-proof-recursive-section="beta"]')).toHaveCount(1);
    await expect(candidate.locator('[data-proof-command-count="recursive-dom"]')).toHaveText("3");

    await candidate.getByRole("button", { name: "Use ordered layout" }).click();
    await expect(region).toHaveAttribute("data-proof-positioning", "ordered");
    await expect(region.locator(":scope > [data-proof-recursive-section]").first()).toHaveAttribute(
      "data-proof-recursive-section",
      "alpha",
    );
    expect(await viewportTransform(candidate)).toBe(viewportBeforeScroll);
    await expect(candidate.locator(".react-flow__viewport")).toHaveCount(1);
  });

  test("retains accessible controls and reflow in the selected representation", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ height: 900, width: 320 });
    await page.goto(proofUrl);
    const candidate = page.locator('[data-proof-candidate="recursive-dom"]');
    await candidate.getByRole("button", { name: "Use freeform layout" }).click();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await expect
      .poll(() =>
        candidate.evaluate((element) => {
          const flow = element.querySelector('[data-proof-flow="recursive-dom"]');
          const controls = [
            ...element.querySelectorAll<HTMLElement>("[aria-label='Proof controls'] button"),
          ];
          if (!flow || controls.length === 0) return false;
          const bounds = flow.getBoundingClientRect();
          return controls.every((control) => {
            const rect = control.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right;
          });
        }),
      )
      .toBe(true);
    const results = await new AxeBuilder({ page })
      .include(".setta-nested-freeform-proof")
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("matches the selected narrow visual baseline", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ height: 900, width: 320 });
    await page.goto(proofUrl);
    const candidate = page.locator('[data-proof-candidate="recursive-dom"]');
    await candidate.getByRole("button", { name: "Use freeform layout" }).click();

    await expect(candidate).toHaveScreenshot("nested-freeform-representation-proof.png", {
      animations: "disabled",
    });
  });
});
