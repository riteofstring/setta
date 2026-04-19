import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__backend";
const TARGET_ROW_ID =
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__runSnapshotMode";
const BACKEND_DROPDOWN_ROW_IDS = [
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__renameRefactorMode",
  TARGET_ROW_ID,
] as const;

test("canvas shell path owns backend dropdown params at rest and keeps first-click activation", async ({
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
    ({ rowIds, sectionId }) =>
      rowIds.every((rowId) => document.getElementById(rowId) instanceof HTMLElement) &&
      document.querySelector(`section[data-section-id="${sectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      rowIds: BACKEND_DROPDOWN_ROW_IDS,
      sectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(
    ({ rowIds, sectionId }) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const inner = document.getElementById(`${sectionId}-CustomResizable`);
      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }
      if (!(inner instanceof HTMLElement)) {
        throw new Error(`Missing inner shell for ${sectionId}`);
      }

      const familyState = rowIds.map((rowId) => {
        const row = document.getElementById(rowId);
        if (!(row instanceof HTMLElement)) {
          throw new Error(`Missing row ${rowId}`);
        }

        const lightweightRoot = row.querySelector<HTMLElement>(
          '[data-canvas-owned-resting-dropdown-lightweight="true"]',
        );
        const lightweightBox = row.querySelector<HTMLElement>(
          '[data-canvas-owned-resting-dropdown-box="true"]',
        );
        if (!(lightweightRoot instanceof HTMLElement)) {
          throw new Error(`Missing lightweight root for ${rowId}`);
        }
        if (!(lightweightBox instanceof HTMLElement)) {
          throw new Error(`Missing lightweight box for ${rowId}`);
        }

        return {
          rowId,
          hasLiveSearchInput: row.querySelector("search input") !== null,
          hasLiveSearchButton: row.querySelector("search button") !== null,
          lightweightFlag:
            lightweightRoot.dataset.canvasOwnedRestingDropdownLightweight ??
            null,
          lightweightRootOpacity:
            window.getComputedStyle(lightweightRoot).opacity,
          lightweightBoxOpacity: window.getComputedStyle(lightweightBox).opacity,
        };
      });

      return {
        familyRowCount: familyState.length,
        familyState,
        innerBackground: window.getComputedStyle(inner).backgroundColor,
        innerBeforeBorderWidth:
          window.getComputedStyle(inner, "::before").borderTopWidth,
        innerOwnershipFlag: inner.dataset.canvasOwnedShell ?? null,
        outerBackground: window.getComputedStyle(section).backgroundColor,
        outerBorderColor: window.getComputedStyle(section).borderTopColor,
        outerOwnershipFlag: section.dataset.canvasOwnedShell ?? null,
        sectionSearchInputCount: section.querySelectorAll("search input").length,
        sectionSearchButtonCount:
          section.querySelectorAll("search button").length,
      };
    },
    {
      rowIds: BACKEND_DROPDOWN_ROW_IDS,
      sectionId: TARGET_SECTION_ID,
    },
  );

  expect(restingState.familyRowCount).toBe(BACKEND_DROPDOWN_ROW_IDS.length);
  expect(restingState.outerOwnershipFlag).toBe("true");
  expect(restingState.innerOwnershipFlag).toBe("true");
  expect(restingState.outerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(restingState.outerBorderColor).toBe("rgba(0, 0, 0, 0)");
  expect(restingState.innerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(restingState.innerBeforeBorderWidth).toBe("0px");
  expect(restingState.sectionSearchInputCount).toBe(0);
  expect(restingState.sectionSearchButtonCount).toBe(0);
  expect(
    restingState.familyState.every(
      (rowState) =>
        rowState.lightweightFlag === "true" &&
        rowState.hasLiveSearchInput === false &&
        rowState.hasLiveSearchButton === false &&
        rowState.lightweightRootOpacity === "1" &&
        rowState.lightweightBoxOpacity === "0",
    ),
  ).toBe(true);

  await page.evaluate(({ rowId }) => {
    const lightweightRoot = document.querySelector<HTMLElement>(
      `#${rowId} [data-canvas-owned-resting-dropdown-lightweight="true"]`,
    );
    if (!(lightweightRoot instanceof HTMLElement)) {
      throw new Error(`Missing lightweight activator for ${rowId}`);
    }

    lightweightRoot.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
  }, { rowId: TARGET_ROW_ID });

  await page.waitForFunction(
    ({ rowId }) => {
      const row = document.getElementById(rowId);
      if (!(row instanceof HTMLElement)) {
        return false;
      }

      const input = row.querySelector<HTMLInputElement>(
        'search input[placeholder="Search"]',
      );
      const button = row.querySelector<HTMLButtonElement>("search button");
      return (
        input instanceof HTMLInputElement &&
        button instanceof HTMLButtonElement &&
        input.offsetWidth > 0 &&
        button.offsetWidth > 0 &&
        input.getAttribute("aria-expanded") === "true" &&
        button.getAttribute("aria-expanded") === "true" &&
        row.querySelector(
          '[data-canvas-owned-resting-dropdown-lightweight="true"]',
        ) === null
      );
    },
    { rowId: TARGET_ROW_ID },
    { timeout: 15000 },
  );

  const liveState = await page.evaluate(({ rowId, sectionId }) => {
    const row = document.getElementById(rowId);
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );
    if (!(row instanceof HTMLElement)) {
      throw new Error(`Missing row ${rowId}`);
    }
    if (!(section instanceof HTMLElement)) {
      throw new Error(`Missing section ${sectionId}`);
    }

    const input = row.querySelector<HTMLInputElement>(
      'search input[placeholder="Search"]',
    );
    const button = row.querySelector<HTMLButtonElement>("search button");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Missing active search input for ${rowId}`);
    }
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Missing active search button for ${rowId}`);
    }

    return {
      ariaExpanded: input.getAttribute("aria-expanded"),
      buttonExpanded: button.getAttribute("aria-expanded"),
      sectionSearchInputCount: section.querySelectorAll("search input").length,
      sectionSearchButtonCount: section.querySelectorAll("search button").length,
      value: input.value,
    };
  }, {
    rowId: TARGET_ROW_ID,
    sectionId: TARGET_SECTION_ID,
  });

  expect(liveState.value.length).toBeGreaterThan(0);
  expect(liveState.ariaExpanded).toBe("true");
  expect(liveState.buttonExpanded).toBe("true");
  expect(liveState.sectionSearchInputCount).toBe(1);
  expect(liveState.sectionSearchButtonCount).toBe(1);
});
