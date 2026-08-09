import { expect, test, type Page } from "@playwright/test";

import { resetPlaygroundExample, seedEmptyPlaygroundDocument } from "./workspace-test-helpers.js";

type HitAreaOffender = Readonly<{
  height: number;
  name: string;
  selector: string;
  width: number;
}>;

const FINE_POINTER_MINIMUM = 40;
const COARSE_POINTER_MINIMUM = 44;

const INTERACTIVE_TARGETS = [
  "button",
  '[role="button"]',
  "input",
  "select",
  "textarea",
  "summary",
  "a[href]",
  ".setta-workspace__section-resize-control",
].join(", ");

/**
 * Measures every visible interactive control under the root selector against a
 * minimum square CSS-pixel hit area. Controls inside the canvas are normalized
 * by the viewport transform so the contract is judged at 1x workspace zoom,
 * labelled checkboxes and radios measure their clickable label, and a
 * half-pixel tolerance absorbs fitted-zoom rounding.
 */
function collectHitAreaOffenders(
  page: Page,
  minSize: number,
  rootSelector: string,
): Promise<readonly HitAreaOffender[]> {
  return page.evaluate(
    ({ min, root, targets }) => {
      const canvasScale = (element: Element): number => {
        const viewport = element.closest(".react-flow__viewport");
        if (!viewport) return 1;
        const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
        return transform.a || 1;
      };
      const labelledInputTarget = (element: Element): Element => {
        if (!(element instanceof HTMLInputElement)) return element;
        if (element.type !== "checkbox" && element.type !== "radio") return element;
        return element.labels?.[0] ?? element;
      };
      const describe = (element: Element): string =>
        element.getAttribute("aria-label") ??
        element.textContent?.trim().slice(0, 60) ??
        element.tagName.toLowerCase();
      const scope = document.querySelector(root);
      if (!scope) throw new Error(`The hit-area sweep root "${root}" is missing.`);
      const offenders: HitAreaOffender[] = [];
      for (const element of scope.querySelectorAll(targets)) {
        if (!(element instanceof HTMLElement) || !element.checkVisibility()) continue;
        const rect = labelledInputTarget(element).getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        const scale = canvasScale(element);
        const width = rect.width / scale;
        const height = rect.height / scale;
        if (width >= min - 0.5 && height >= min - 0.5) continue;
        offenders.push({
          height: Math.round(height * 10) / 10,
          name: describe(element),
          selector: element.className.split(" ")[0] || element.tagName.toLowerCase(),
          width: Math.round(width * 10) / 10,
        });
      }
      return offenders;
    },
    { min: minSize, root: rootSelector, targets: INTERACTIVE_TARGETS },
  );
}

async function expectCompliantSurface(page: Page, minSize: number, root = "body"): Promise<void> {
  expect(await collectHitAreaOffenders(page, minSize, root)).toEqual([]);
}

/** Sweeps the visual matrix idle, selected, and open style-menu states. */
async function sweepVisualMatrix(page: Page, minSize: number): Promise<void> {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  await page.goto("/?visual-matrix");
  const workspace = page.getByRole("region", { exact: true, name: "Visual matrix workspace" });
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "light");
  await expectCompliantSurface(page, minSize);

  await page.getByRole("button", { name: "Select two sections" }).click();
  const selected = workspace.getByRole("article", { name: "Default chrome" });
  await expect(selected).toHaveAttribute("data-workspace-selected", "true");
  await expectCompliantSurface(page, minSize);

  await selected.getByRole("button", { name: "Style Default chrome" }).click();
  await expect(selected.getByRole("dialog", { name: "Style Default chrome" })).toBeVisible();
  await expectCompliantSurface(page, minSize);
}

/**
 * Sweeps the default playground idle, each disclosure panel, the creation
 * dialog, and the saved-views pane over the representative example document.
 */
async function sweepDefaultPlayground(page: Page, minSize: number): Promise<void> {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  await seedEmptyPlaygroundDocument(page);
  await page.goto("/");
  await resetPlaygroundExample(page);
  await expectCompliantSurface(page, minSize);

  const panels = [
    ["Help", "Try these interactions"],
    ["Settings", "Workspace settings"],
    ["Data", "Data and diagnostics"],
  ] as const;
  for (const [button, dialog] of panels) {
    await page.getByRole("button", { exact: true, name: button }).click();
    await expect(page.getByRole("dialog", { name: dialog })).toBeVisible();
    await expectCompliantSurface(page, minSize);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: dialog })).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("dialog", { name: "Add a section" })).toBeVisible();
  await expectCompliantSurface(page, minSize);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add a section" })).toHaveCount(0);

  const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
  await workspace.getByRole("button", { exact: true, name: "Saved views" }).click();
  await expect(workspace.getByRole("region", { name: "Saved workspace views" })).toBeVisible();
  await expectCompliantSurface(page, minSize);
}

/**
 * Sweeps the package-owned canvas-shell surfaces that never mount on the
 * default page: the outline navigator and the selection-actions dialog. The
 * sweep scopes to the workspace root so harness controls stay out of scope.
 */
async function sweepCanvasShellSurfaces(page: Page, minSize: number): Promise<void> {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  const extensions = page.getByRole("checkbox", { name: "Show host extensions" });
  if (await extensions.isChecked()) await extensions.uncheck();
  await page.getByRole("button", { name: "Fit navigation fixture" }).click();
  const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });

  await workspace.getByRole("button", { name: "Show outline" }).click();
  await expect(workspace.getByRole("navigation", { name: "Workspace outline" })).toBeVisible();
  const selectAlpha = workspace.getByRole("button", { name: "Select Alpha frame" });
  await selectAlpha.click();
  await workspace.getByRole("button", { name: "Select Beta frame" }).click({ modifiers: ["Shift"] });
  await expect(selectAlpha).toHaveAttribute("aria-pressed", "true");
  await selectAlpha.click({ button: "right" });
  await expect(page.getByRole("dialog", { name: "Selection actions" })).toBeVisible();
  await expectCompliantSurface(page, minSize, "[data-setta-workspace]");
}

test("fine-pointer hit areas meet the 40 px minimum across package and playground chrome", async ({
  page,
}) => {
  await sweepVisualMatrix(page, FINE_POINTER_MINIMUM);
  await sweepDefaultPlayground(page, FINE_POINTER_MINIMUM);
  await sweepCanvasShellSurfaces(page, FINE_POINTER_MINIMUM);
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  test("coarse-pointer hit areas meet the 44 px minimum across package and playground chrome", async ({
    page,
  }) => {
    await expect
      .poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches))
      .toBe(true);
    await sweepVisualMatrix(page, COARSE_POINTER_MINIMUM);
    await sweepDefaultPlayground(page, COARSE_POINTER_MINIMUM);
    await sweepCanvasShellSurfaces(page, COARSE_POINTER_MINIMUM);
  });
});
