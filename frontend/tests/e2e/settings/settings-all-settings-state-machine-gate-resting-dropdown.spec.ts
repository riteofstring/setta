import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__stateMachineGateSectionDefault";
const TARGET_ROW_ID =
  "ParamContainer-settings-section__stateMachineGateSectionDefault-settings-codeobj__stateMachineGateSectionDefault__stateMachineGateSectionDefault__gateType";

test("canvas shell path owns the state-machine Gate Type dropdown at rest and keeps first-click activation", async ({
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
    ({ rowId, sectionId }) =>
      document.getElementById(rowId) instanceof HTMLElement &&
      document.querySelector(`section[data-section-id="${sectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      rowId: TARGET_ROW_ID,
      sectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(({ rowId, sectionId }) => {
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
      hasLiveSearchInput: row.querySelector("search input") !== null,
      hasLiveSearchButton: row.querySelector("search button") !== null,
      lightweightFlag:
        lightweightRoot.dataset.canvasOwnedRestingDropdownLightweight ?? null,
      lightweightRootOpacity: window.getComputedStyle(lightweightRoot).opacity,
      lightweightBoxOpacity: window.getComputedStyle(lightweightBox).opacity,
      sectionSearchButtonCount: section.querySelectorAll("search button").length,
      sectionSearchInputCount: section.querySelectorAll("search input").length,
    };
  }, {
    rowId: TARGET_ROW_ID,
    sectionId: TARGET_SECTION_ID,
  });

  expect(restingState.hasLiveSearchInput).toBe(false);
  expect(restingState.hasLiveSearchButton).toBe(false);
  expect(restingState.lightweightFlag).toBe("true");
  expect(restingState.lightweightRootOpacity).toBe("1");
  expect(restingState.lightweightBoxOpacity).toBe("0");
  expect(restingState.sectionSearchInputCount).toBe(0);
  expect(restingState.sectionSearchButtonCount).toBe(0);

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
      sectionSearchButtonCount: section.querySelectorAll("search button").length,
      sectionSearchInputCount: section.querySelectorAll("search input").length,
      value: input.value,
    };
  }, {
    rowId: TARGET_ROW_ID,
    sectionId: TARGET_SECTION_ID,
  });

  expect(liveState.value).toBe("AND");
  expect(liveState.ariaExpanded).toBe("true");
  expect(liveState.buttonExpanded).toBe("true");
  expect(liveState.sectionSearchInputCount).toBe(1);
  expect(liveState.sectionSearchButtonCount).toBe(1);
});
