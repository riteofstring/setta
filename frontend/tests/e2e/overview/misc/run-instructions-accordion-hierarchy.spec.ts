import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
  setOverviewTab,
} from "../../helpers";

test.describe.serial("run instructions accordion hierarchy", () => {
  test("major custom-run categories are accordionized with persisted open state", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "RunInstructions",
      overviewVis: true,
    });
    await ensureAppReady(page);

    const projectContext = await openIsolatedProject(page);
    try {
      const viewportBounds = await getViewportBoundsForPlacement(page);
      if (!viewportBounds) {
        throw new Error("Unable to resolve viewport bounds for code section.");
      }
      await postBackend<{ sectionId?: string }>(
        page,
        "/createTopLevelSection",
        {
          projectConfigId: projectContext.projectConfigId,
          implType: "Code",
          viewportBounds,
        },
      );

      await setOverviewTab(page, "RunInstructions");
      await page.reload({ waitUntil: "domcontentloaded" });
      await ensureAppReady(page);

      const customRunsTrigger = page.getByTestId(
        "run-instructions-accordion-custom-runs",
      );
      const addFromCodeBlocksTrigger = page.getByTestId(
        "run-instructions-accordion-add-from-code-blocks",
      );
      const runSnapshotModeTrigger = page.getByTestId(
        "run-instructions-accordion-run-snapshot-mode",
      );
      const codegenTargetsTrigger = page.getByTestId(
        "run-instructions-accordion-codegen-targets",
      );
      const codegenPolicyTrigger = page.getByTestId(
        "run-instructions-accordion-codegen-policy",
      );

      const railAndGapMetrics = await page.evaluate(() => {
        const triggerIds = [
          "run-instructions-accordion-run-snapshot-mode",
          "run-instructions-accordion-codegen-targets",
          "run-instructions-accordion-codegen-policy",
          "run-instructions-accordion-custom-runs",
        ];
        const rects = triggerIds.map((id) => {
          const element = document.querySelector(`[data-testid='${id}']`);
          if (!(element instanceof HTMLElement)) {
            return null;
          }
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
          };
        });
        if (rects.some((entry) => entry === null)) {
          return null;
        }
        const lefts = rects.map((entry) => entry!.left);
        const rights = rects.map((entry) => entry!.right);
        const codegenPolicyItem = document.querySelector<HTMLElement>(
          "[data-testid='run-instructions-accordion-codegen-policy-item']",
        );
        const customRunsItem = document.querySelector<HTMLElement>(
          "[data-testid='run-instructions-accordion-custom-runs-item']",
        );
        if (
          !(codegenPolicyItem instanceof HTMLElement) ||
          !(customRunsItem instanceof HTMLElement)
        ) {
          return null;
        }
        const codegenPolicyItemRect = codegenPolicyItem.getBoundingClientRect();
        const customRunsItemRect = customRunsItem.getBoundingClientRect();
        return {
          leftSpread: Math.max(...lefts) - Math.min(...lefts),
          rightSpread: Math.max(...rights) - Math.min(...rights),
          policyToCustomGap:
            customRunsItemRect.top - codegenPolicyItemRect.bottom,
        };
      });
      if (!railAndGapMetrics) {
        throw new Error(
          "Unable to compute Run Instructions accordion rail and gap metrics.",
        );
      }
      expect(railAndGapMetrics.leftSpread).toBeLessThanOrEqual(2);
      expect(railAndGapMetrics.rightSpread).toBeLessThanOrEqual(2);
      expect(railAndGapMetrics.policyToCustomGap).toBeGreaterThanOrEqual(6);

      await expect(runSnapshotModeTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(codegenTargetsTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(codegenPolicyTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(customRunsTrigger).toHaveAttribute("aria-expanded", "true");

      const addFromCodeBlocksDisabled =
        (await addFromCodeBlocksTrigger.getAttribute("disabled")) !== null;
      const addFromCodeBlocksExpandedBefore =
        (await addFromCodeBlocksTrigger.getAttribute("aria-expanded")) ===
        "true";
      if (addFromCodeBlocksDisabled) {
        await expect(addFromCodeBlocksTrigger).toHaveAttribute(
          "aria-expanded",
          "false",
        );
        await expect(addFromCodeBlocksTrigger).toHaveAttribute(
          "title",
          "No runnable code blocks are available",
        );
      } else {
        await expect(addFromCodeBlocksTrigger).toHaveAttribute(
          "aria-expanded",
          "true",
        );
      }

      await runSnapshotModeTrigger.click();
      await codegenPolicyTrigger.click();
      await customRunsTrigger.click();
      await expect(customRunsTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(runSnapshotModeTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(codegenPolicyTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      await ensureAppReady(page);

      await expect(
        page.getByTestId("run-instructions-accordion-run-snapshot-mode"),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByTestId("run-instructions-accordion-codegen-policy"),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByTestId("run-instructions-accordion-custom-runs"),
      ).toHaveAttribute("aria-expanded", "false");

      if (addFromCodeBlocksDisabled) {
        await expect(
          page.getByTestId("run-instructions-accordion-add-from-code-blocks"),
        ).toHaveAttribute("aria-expanded", "false");
      } else {
        await expect(
          page.getByTestId("run-instructions-accordion-add-from-code-blocks"),
        ).toHaveAttribute(
          "aria-expanded",
          addFromCodeBlocksExpandedBefore ? "true" : "false",
        );
      }
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
