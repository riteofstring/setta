import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__chatSectionDefault";
const SIBLING_SECTION_ID = "settings-section__spreadsheetSectionDefault";
const TERTIARY_SECTION_ID = "settings-section__browserSectionDefault";

type SectionResizeHandleSummary = {
  legacyResizeHandleCount: number;
  lightweightResizeHandleCount: number;
  rowCount: number;
  sectionId: string;
};

type LightweightResizeHandleSummary = {
  sectionsWithLegacyResizeHandles: string[];
  sectionsWithLightweightResizeHandles: string[];
  settingsLegacyResizeHandleCount: number;
  settingsLightweightResizeHandleCount: number;
  sibling: SectionResizeHandleSummary;
  target: SectionResizeHandleSummary;
  tertiary: SectionResizeHandleSummary;
};

test("canvas shell path generalizes lightweight resize handles across the shared settings surface", async ({
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
    [TARGET_SECTION_ID, SIBLING_SECTION_ID, TERTIARY_SECTION_ID],
    { timeout: 15000 },
  );

  const summary = await page.evaluate(
    ({
      siblingSectionId,
      targetSectionId,
      tertiarySectionId,
    }): LightweightResizeHandleSummary => {
      function summarizeSection(sectionId: string): SectionResizeHandleSummary {
        const section = document.querySelector<HTMLElement>(
          `section[data-section-id="${sectionId}"]`,
        );
        if (!(section instanceof HTMLElement)) {
          throw new Error(`Missing section ${sectionId}`);
        }

        return {
          legacyResizeHandleCount: section.querySelectorAll(
            '[data-param-resize-handle="true"]:not([data-param-resize-handle-lightweight="true"])',
          ).length,
          lightweightResizeHandleCount: section.querySelectorAll(
            '[data-param-resize-handle-lightweight="true"]',
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
      const sectionSummaries = settingsSections.map((section) => ({
        legacyResizeHandleCount: section.querySelectorAll(
          '[data-param-resize-handle="true"]:not([data-param-resize-handle-lightweight="true"])',
        ).length,
        lightweightResizeHandleCount: section.querySelectorAll(
          '[data-param-resize-handle-lightweight="true"]',
        ).length,
        sectionId: section.dataset.sectionId ?? "",
      }));

      return {
        sectionsWithLegacyResizeHandles: sectionSummaries
          .filter((section) => section.legacyResizeHandleCount > 0)
          .map((section) => section.sectionId)
          .filter((sectionId) => sectionId.length > 0)
          .sort(),
        sectionsWithLightweightResizeHandles: sectionSummaries
          .filter((section) => section.lightweightResizeHandleCount > 0)
          .map((section) => section.sectionId)
          .filter((sectionId) => sectionId.length > 0)
          .sort(),
        settingsLegacyResizeHandleCount: sectionSummaries.reduce(
          (count, section) => count + section.legacyResizeHandleCount,
          0,
        ),
        settingsLightweightResizeHandleCount: sectionSummaries.reduce(
          (count, section) => count + section.lightweightResizeHandleCount,
          0,
        ),
        sibling: summarizeSection(siblingSectionId),
        target: summarizeSection(targetSectionId),
        tertiary: summarizeSection(tertiarySectionId),
      };
    },
    {
      siblingSectionId: SIBLING_SECTION_ID,
      targetSectionId: TARGET_SECTION_ID,
      tertiarySectionId: TERTIARY_SECTION_ID,
    },
  );

  await testInfo.attach("lightweight-resize-handle-summary", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_LIGHTWEIGHT_RESIZE_HANDLE_GENERALIZATION ${JSON.stringify(summary, null, 2)}`,
  );

  expect(summary.target.rowCount).toBeGreaterThan(10);
  expect(summary.target.lightweightResizeHandleCount).toBeGreaterThan(10);
  expect(summary.target.legacyResizeHandleCount).toBe(0);

  expect(summary.sibling.rowCount).toBeGreaterThan(10);
  expect(summary.sibling.lightweightResizeHandleCount).toBeGreaterThan(10);
  expect(summary.sibling.legacyResizeHandleCount).toBe(0);

  expect(summary.tertiary.rowCount).toBeGreaterThan(10);
  expect(summary.tertiary.lightweightResizeHandleCount).toBeGreaterThan(10);
  expect(summary.tertiary.legacyResizeHandleCount).toBe(0);

  expect(summary.settingsLightweightResizeHandleCount).toBeGreaterThan(500);
  expect(summary.settingsLegacyResizeHandleCount).toBe(0);
  expect(summary.sectionsWithLegacyResizeHandles).toEqual([]);
  expect(summary.sectionsWithLightweightResizeHandles).toContain(
    TARGET_SECTION_ID,
  );
  expect(summary.sectionsWithLightweightResizeHandles).toContain(
    SIBLING_SECTION_ID,
  );
  expect(summary.sectionsWithLightweightResizeHandles).toContain(
    TERTIARY_SECTION_ID,
  );
  expect(summary.sectionsWithLightweightResizeHandles.length).toBeGreaterThan(20);
});
