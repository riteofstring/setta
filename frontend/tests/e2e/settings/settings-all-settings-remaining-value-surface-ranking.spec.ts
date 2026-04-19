import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type RemainingRowSummary = {
  lightweightValueKinds: string[];
  remainingKinds: string[];
  remainingValueElementCount: number;
  rowId: string;
  rowText: string | null;
};

type SectionValueSurfaceSummary = {
  lightweightColorInputRowCount: number;
  lightweightDropdownRowCount: number;
  lightweightFilterActivatorRowCount: number;
  lightweightRestingTextRowCount: number;
  lightweightSwitchRowCount: number;
  remainingValueElementCount: number;
  remainingValueRowCount: number;
  rowCount: number;
  sectionId: string;
  topRemainingRows: RemainingRowSummary[];
};

type RemainingValueSurfaceRanking = {
  mountedSectionCount: number;
  topSections: SectionValueSurfaceSummary[];
  totalRemainingValueElementCount: number;
  totalRemainingValueRowCount: number;
  totalRowCount: number;
};

test("settings All Settings ranking identifies the remaining non-lightweight value surface", async ({
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
    () => document.querySelectorAll(".react-flow__node").length > 13,
  );
  await clickFitViewIfVisible(page);
  await page.waitForFunction(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    );
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    return (
      nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right >= 0 &&
          rect.bottom >= 0 &&
          rect.left <= windowWidth &&
          rect.top <= windowHeight
        );
      }).length > 20
    );
  });
  await page.waitForTimeout(500);

  const ranking = await page.evaluate((): RemainingValueSurfaceRanking => {
    const SETTINGS_SECTION_SELECTOR = 'section[data-section-id^="settings-section__"]';
    const ROW_SELECTOR = 'article[id^="ParamContainer-"]';
    const VALUE_ROOT_SELECTOR = ".section-value";
    const LIGHTWEIGHT_KIND_SELECTORS = {
      lightweightColorInput:
        '[data-canvas-owned-lightweight-color-input="true"]',
      lightweightDropdown:
        '[data-canvas-owned-resting-dropdown-lightweight="true"]',
      lightweightFilterActivator:
        '[data-canvas-owned-lightweight-filter-activator="true"]',
      lightweightRestingText:
        '[data-canvas-owned-resting-text-lightweight="true"]',
      lightweightSwitch: '[data-canvas-owned-lightweight-switch="true"]',
    } as const;
    const LIGHTWEIGHT_VALUE_SELECTOR = Object.values(
      LIGHTWEIGHT_KIND_SELECTORS,
    ).join(", ");

    function isVisibleElement(element: Element | null): element is HTMLElement {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function summarizeKind(element: HTMLElement): string {
      const classTokens = element.className
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .filter(
          (token) =>
            token.startsWith("cm-") ||
            token.startsWith("section-") ||
            token.startsWith("single-cell") ||
            token.startsWith("peer/") ||
            token.includes("combobox") ||
            token.includes("search"),
        )
        .slice(0, 3);
      if (classTokens.length === 0) {
        return element.tagName.toLowerCase();
      }
      return `${element.tagName.toLowerCase()}.${classTokens.join(".")}`;
    }

    function summarizeRow(row: HTMLElement): RemainingRowSummary {
      const lightweightKinds = Object.entries(LIGHTWEIGHT_KIND_SELECTORS)
        .filter(([, selector]) => row.querySelector(selector))
        .map(([kind]) => kind)
        .sort();

      const remainingValueElements = Array.from(
        row.querySelectorAll<HTMLElement>(VALUE_ROOT_SELECTOR),
      )
        .flatMap((valueRoot) => [
          valueRoot,
          ...Array.from(valueRoot.querySelectorAll<HTMLElement>("*")),
        ])
        .filter((element) => isVisibleElement(element))
        .filter((element) => element.closest(LIGHTWEIGHT_VALUE_SELECTOR) === null);

      const remainingKinds = Array.from(
        new Set(remainingValueElements.map(summarizeKind)),
      ).slice(0, 5);

      return {
        lightweightValueKinds: lightweightKinds,
        remainingKinds,
        remainingValueElementCount: remainingValueElements.length,
        rowId: row.id,
        rowText:
          typeof row.innerText === "string"
            ? row.innerText.trim().replace(/\s+/g, " ").slice(0, 200)
            : null,
      };
    }

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(SETTINGS_SECTION_SELECTOR),
    );
    const sectionSummaries = sections
      .map((section): SectionValueSurfaceSummary => {
        const rows = Array.from(section.querySelectorAll<HTMLElement>(ROW_SELECTOR));
        const rowSummaries = rows.map(summarizeRow);
        const remainingRows = rowSummaries
          .filter((rowSummary) => rowSummary.remainingValueElementCount > 0)
          .sort(
            (left, right) =>
              right.remainingValueElementCount - left.remainingValueElementCount,
          );

        return {
          lightweightColorInputRowCount: rowSummaries.filter((rowSummary) =>
            rowSummary.lightweightValueKinds.includes("lightweightColorInput"),
          ).length,
          lightweightDropdownRowCount: rowSummaries.filter((rowSummary) =>
            rowSummary.lightweightValueKinds.includes("lightweightDropdown"),
          ).length,
          lightweightFilterActivatorRowCount: rowSummaries.filter((rowSummary) =>
            rowSummary.lightweightValueKinds.includes(
              "lightweightFilterActivator",
            ),
          ).length,
          lightweightRestingTextRowCount: rowSummaries.filter((rowSummary) =>
            rowSummary.lightweightValueKinds.includes("lightweightRestingText"),
          ).length,
          lightweightSwitchRowCount: rowSummaries.filter((rowSummary) =>
            rowSummary.lightweightValueKinds.includes("lightweightSwitch"),
          ).length,
          remainingValueElementCount: remainingRows.reduce(
            (count, rowSummary) => count + rowSummary.remainingValueElementCount,
            0,
          ),
          remainingValueRowCount: remainingRows.length,
          rowCount: rows.length,
          sectionId: section.dataset.sectionId ?? "",
          topRemainingRows: remainingRows.slice(0, 5),
        };
      })
      .filter((sectionSummary) => sectionSummary.rowCount > 0)
      .sort((left, right) => {
        if (right.remainingValueElementCount !== left.remainingValueElementCount) {
          return right.remainingValueElementCount - left.remainingValueElementCount;
        }
        if (right.remainingValueRowCount !== left.remainingValueRowCount) {
          return right.remainingValueRowCount - left.remainingValueRowCount;
        }
        return right.rowCount - left.rowCount;
      });

    return {
      mountedSectionCount: sections.length,
      topSections: sectionSummaries.slice(0, 12),
      totalRemainingValueElementCount: sectionSummaries.reduce(
        (count, sectionSummary) =>
          count + sectionSummary.remainingValueElementCount,
        0,
      ),
      totalRemainingValueRowCount: sectionSummaries.reduce(
        (count, sectionSummary) => count + sectionSummary.remainingValueRowCount,
        0,
      ),
      totalRowCount: sectionSummaries.reduce(
        (count, sectionSummary) => count + sectionSummary.rowCount,
        0,
      ),
    };
  });

  await testInfo.attach("remaining-value-surface-ranking", {
    body: JSON.stringify(ranking, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_REMAINING_VALUE_SURFACE_RANKING ${JSON.stringify(
      ranking,
      null,
      2,
    )}`,
  );

  expect(ranking.mountedSectionCount).toBeGreaterThan(20);
  expect(ranking.totalRowCount).toBeGreaterThan(200);
  expect(ranking.totalRemainingValueRowCount).toBeGreaterThan(0);
  expect(ranking.totalRemainingValueElementCount).toBeGreaterThan(0);
  expect(ranking.topSections.length).toBeGreaterThanOrEqual(3);
  expect(ranking.topSections[0]?.remainingValueElementCount ?? 0).toBeGreaterThan(
    0,
  );
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button", { name: "fit view" });
  if (await fitView.isVisible()) {
    await fitView.click();
  }
}
