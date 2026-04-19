import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__callableSectionDefault";
const KWARGS_ACTION_LABELS = [
  "Remove arg",
  "Add arg",
  "Pin selected args",
  "Convert to edge connectors",
  "Delete selected args",
] as const;

test("canvas shell path uses lightweight kwargs toolbar action buttons across callable-style sections", async ({
  page,
}) => {
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
    ({ sectionId }) =>
      document.querySelector(`section[data-section-id="${sectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      sectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(
    ({ labels, sectionId }) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }

      const sectionLabelState = labels.map((label) => {
        const lightweightRoots = Array.from(
          section.querySelectorAll<HTMLElement>(
            '[data-canvas-owned-lightweight-action-button="true"]',
          ),
        ).filter((candidate) => candidate.getAttribute("aria-label") === label);
        const legacyButtons = Array.from(section.querySelectorAll("button")).filter(
          (candidate) => candidate.getAttribute("aria-label") === label,
        );

        return {
          label,
          legacyButtonCount: legacyButtons.length,
          lightweightCount: lightweightRoots.length,
          rootTagName: lightweightRoots[0]?.tagName ?? null,
          rootRole: lightweightRoots[0]?.getAttribute("role") ?? null,
        };
      });

      const globalLabelState = labels.map((label) => ({
        buttonCount: Array.from(document.querySelectorAll("button")).filter(
          (candidate) => candidate.getAttribute("aria-label") === label,
        ).length,
        label,
        lightweightCount: Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-canvas-owned-lightweight-action-button="true"]',
          ),
        ).filter((candidate) => candidate.getAttribute("aria-label") === label)
          .length,
      }));

      return {
        globalLabelState,
        sectionLabelState,
        sectionLightweightActionButtonCount: section.querySelectorAll(
          '[data-canvas-owned-lightweight-action-button="true"]',
        ).length,
      };
    },
    {
      labels: KWARGS_ACTION_LABELS,
      sectionId: TARGET_SECTION_ID,
    },
  );

  expect(restingState.sectionLightweightActionButtonCount).toBeGreaterThanOrEqual(
    KWARGS_ACTION_LABELS.length,
  );
  expect(
    restingState.sectionLabelState.every(
      (labelState) =>
        labelState.legacyButtonCount === 0 &&
        labelState.lightweightCount === 1 &&
        labelState.rootTagName === "DIV" &&
        labelState.rootRole === "button",
    ),
  ).toBe(true);

  const sharedLightweightCounts = new Set(
    restingState.globalLabelState.map((labelState) => labelState.lightweightCount),
  );
  expect(sharedLightweightCounts.size).toBe(1);
  expect(restingState.globalLabelState.every((labelState) => labelState.buttonCount === 0)).toBe(
    true,
  );
  const repeatedCount = restingState.globalLabelState[0]?.lightweightCount ?? 0;
  expect(repeatedCount).toBeGreaterThan(20);
});
