import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__codeSectionDefault";
const SIBLING_SECTION_ID = "settings-section__stateMachineGateSectionDefault";
const BROWSER_SECTION_ID = "settings-section__browserSectionDefault";
const NEGATIVE_CONTROL_SECTION_ID = "settings-section__callableSectionDefault";

type SectionNestedGuideSummary = {
  legacyNestedWrapperCount: number;
  lightweightGuideRootCount: number;
  rowCount: number;
  sectionId: string;
};

type LightweightNestedChildrenSummary = {
  browser: SectionNestedGuideSummary;
  callable: SectionNestedGuideSummary;
  sectionsWithLightweightGuides: string[];
  sibling: SectionNestedGuideSummary;
  target: SectionNestedGuideSummary;
};

test("canvas shell path generalizes lightweight nested children across shared resting-text sections without widening the shell canary", async ({
  page,
}, testInfo) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();

  await page.waitForFunction(
    (sectionIds) =>
      sectionIds.every(
        (sectionId) =>
          document.querySelector(`section[data-section-id="${sectionId}"]`) instanceof
          HTMLElement,
      ) &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    [
      TARGET_SECTION_ID,
      SIBLING_SECTION_ID,
      BROWSER_SECTION_ID,
      NEGATIVE_CONTROL_SECTION_ID,
    ],
    { timeout: 15000 },
  );

  const summary = await page.evaluate(
    ({
      browserSectionId,
      negativeControlSectionId,
      siblingSectionId,
      targetSectionId,
    }): LightweightNestedChildrenSummary => {
      function summarizeSection(sectionId: string): SectionNestedGuideSummary {
        const section = document.querySelector<HTMLElement>(
          `section[data-section-id="${sectionId}"]`,
        );
        if (!(section instanceof HTMLElement)) {
          throw new Error(`Missing section ${sectionId}`);
        }

        return {
          legacyNestedWrapperCount: section.querySelectorAll(
            "div.section-args-nested.section-key-value.relative.grid",
          ).length,
          lightweightGuideRootCount: section.querySelectorAll(
            'article[data-canvas-owned-nested-guide-lightweight="true"]',
          ).length,
          rowCount: section.querySelectorAll('article[id^="ParamContainer-"]').length,
          sectionId,
        };
      }

      const settingsSections = Array.from(
        document.querySelectorAll<HTMLElement>(
          'section[data-section-id^="settings-section__"]',
        ),
      );

      return {
        browser: summarizeSection(browserSectionId),
        callable: summarizeSection(negativeControlSectionId),
        sectionsWithLightweightGuides: settingsSections
          .filter(
            (section) =>
              section.querySelectorAll(
                'article[data-canvas-owned-nested-guide-lightweight="true"]',
              ).length > 0,
          )
          .map((section) => section.dataset.sectionId ?? "")
          .filter((sectionId) => sectionId.length > 0)
          .sort(),
        sibling: summarizeSection(siblingSectionId),
        target: summarizeSection(targetSectionId),
      };
    },
    {
      browserSectionId: BROWSER_SECTION_ID,
      negativeControlSectionId: NEGATIVE_CONTROL_SECTION_ID,
      siblingSectionId: SIBLING_SECTION_ID,
      targetSectionId: TARGET_SECTION_ID,
    },
  );

  await testInfo.attach("lightweight-nested-children-summary", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_LIGHTWEIGHT_NESTED_CHILDREN ${JSON.stringify(summary, null, 2)}`,
  );

  expect(summary.target.rowCount).toBeGreaterThan(5);
  expect(summary.target.legacyNestedWrapperCount).toBe(0);
  expect(summary.target.lightweightGuideRootCount).toBeGreaterThan(0);

  expect(summary.sibling.rowCount).toBeGreaterThan(5);
  expect(summary.sibling.legacyNestedWrapperCount).toBe(0);
  expect(summary.sibling.lightweightGuideRootCount).toBeGreaterThan(0);

  expect(summary.browser.rowCount).toBeGreaterThan(5);
  expect(summary.browser.legacyNestedWrapperCount).toBe(0);
  expect(summary.browser.lightweightGuideRootCount).toBeGreaterThan(0);

  expect(summary.callable.rowCount).toBeGreaterThan(5);
  expect(summary.callable.lightweightGuideRootCount).toBe(0);
  expect(summary.callable.legacyNestedWrapperCount).toBeGreaterThan(0);

  expect(summary.sectionsWithLightweightGuides).toContain(TARGET_SECTION_ID);
  expect(summary.sectionsWithLightweightGuides).toContain(SIBLING_SECTION_ID);
  expect(summary.sectionsWithLightweightGuides).toContain(BROWSER_SECTION_ID);
  expect(summary.sectionsWithLightweightGuides).not.toContain(
    NEGATIVE_CONTROL_SECTION_ID,
  );
  expect(summary.sectionsWithLightweightGuides.length).toBeGreaterThanOrEqual(8);
});
