import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type RemainingRowBodySummary = {
  lightweightLabel: boolean;
  lightweightNestedGuide: boolean;
  lightweightResizeHandle: boolean;
  remainingKinds: string[];
  remainingVisibleChromeElementCount: number;
  remainingVisibleElementCount: number;
  remainingVisibleLabelElementCount: number;
  remainingVisibleValueElementCount: number;
  rowId: string;
  rowLayoutKind: string;
  rowText: string | null;
};

type SectionRowBodySurfaceSummary = {
  lightweightLabelRowCount: number;
  lightweightNestedGuideRowCount: number;
  lightweightResizeHandleRowCount: number;
  remainingRowCount: number;
  remainingVisibleChromeElementCount: number;
  remainingVisibleElementCount: number;
  remainingVisibleLabelElementCount: number;
  remainingVisibleValueElementCount: number;
  rowCount: number;
  sectionId: string;
  topRemainingRows: RemainingRowBodySummary[];
};

type RemainingKindCount = {
  count: number;
  kind: string;
};

type RowBodySurfaceRanking = {
  commonRemainingKinds: RemainingKindCount[];
  mountedSectionCount: number;
  topSections: SectionRowBodySurfaceSummary[];
  totalRemainingRowCount: number;
  totalRemainingVisibleChromeElementCount: number;
  totalRemainingVisibleElementCount: number;
  totalRemainingVisibleLabelElementCount: number;
  totalRemainingVisibleValueElementCount: number;
  totalRowCount: number;
};

test("settings All Settings ranking identifies the remaining ParamContainer row-body surface", async ({
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

  const ranking = await page.evaluate((): RowBodySurfaceRanking => {
    const SETTINGS_SECTION_SELECTOR = 'section[data-section-id^="settings-section__"]';
    const ROW_SELECTOR = 'article[id^="ParamContainer-"]';
    const LIGHTWEIGHT_TREE_SELECTORS = {
      lightweightColorInput:
        '[data-canvas-owned-lightweight-color-input="true"]',
      lightweightFilterActivator:
        '[data-canvas-owned-lightweight-filter-activator="true"]',
      lightweightRestingDropdown:
        '[data-canvas-owned-resting-dropdown-lightweight="true"]',
      lightweightRestingText:
        '[data-canvas-owned-resting-text-lightweight="true"]',
      lightweightSwitch: '[data-canvas-owned-lightweight-switch="true"]',
      lightweightUnderline: '[data-canvas-owned-underline="true"]',
    } as const;
    const LIGHTWEIGHT_TREE_SELECTOR = Object.values(
      LIGHTWEIGHT_TREE_SELECTORS,
    ).join(", ");
    const LABEL_SELECTOR = ".section-key";
    const VALUE_SELECTOR = ".section-value";

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
      const classTokens = (element.getAttribute("class") ?? "")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .filter(
          (token) =>
            token.startsWith("cm-") ||
            token.startsWith("section-") ||
            token.startsWith("single-cell") ||
            token.startsWith("peer/") ||
            token.includes("group/") ||
            token.includes("arg-group"),
        )
        .slice(0, 4);
      if (classTokens.length === 0) {
        return element.tagName.toLowerCase();
      }
      return `${element.tagName.toLowerCase()}.${classTokens.join(".")}`;
    }

    function summarizeRow(row: HTMLElement): RemainingRowBodySummary {
      const remainingVisibleElements = Array.from(
        row.querySelectorAll<HTMLElement>("*"),
      )
        .filter((element) => isVisibleElement(element))
        .filter((element) => element.closest(LIGHTWEIGHT_TREE_SELECTOR) === null);
      const remainingKinds = Array.from(
        new Set(remainingVisibleElements.map(summarizeKind)),
      ).slice(0, 6);
      const remainingVisibleLabelElementCount = remainingVisibleElements.filter(
        (element) => element.closest(LABEL_SELECTOR) !== null,
      ).length;
      const remainingVisibleValueElementCount = remainingVisibleElements.filter(
        (element) => element.closest(VALUE_SELECTOR) !== null,
      ).length;

      return {
        lightweightLabel:
          row.querySelector('[data-lightweight-canvas-root="true"]') !== null,
        lightweightNestedGuide:
          row.dataset.canvasOwnedNestedGuideLightweight === "true",
        lightweightResizeHandle:
          row.querySelector('[data-param-resize-handle-lightweight="true"]') !==
          null,
        remainingKinds,
        remainingVisibleChromeElementCount:
          remainingVisibleElements.length -
          remainingVisibleLabelElementCount -
          remainingVisibleValueElementCount,
        remainingVisibleElementCount: remainingVisibleElements.length,
        remainingVisibleLabelElementCount,
        remainingVisibleValueElementCount,
        rowId: row.id,
        rowLayoutKind: summarizeKind(row),
        rowText:
          typeof row.innerText === "string"
            ? row.innerText.trim().replace(/\s+/g, " ").slice(0, 200)
            : null,
      };
    }

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(SETTINGS_SECTION_SELECTOR),
    );
    const globalKindCounts = new Map<string, number>();
    const sectionSummaries = sections
      .map((section): SectionRowBodySurfaceSummary => {
        const rows = Array.from(section.querySelectorAll<HTMLElement>(ROW_SELECTOR));
        const rowSummaries = rows.map(summarizeRow);
        const remainingRows = rowSummaries
          .filter((rowSummary) => rowSummary.remainingVisibleElementCount > 0)
          .sort((left, right) => {
            if (
              right.remainingVisibleElementCount !==
              left.remainingVisibleElementCount
            ) {
              return (
                right.remainingVisibleElementCount -
                left.remainingVisibleElementCount
              );
            }
            return right.remainingVisibleLabelElementCount -
              left.remainingVisibleLabelElementCount;
          });

        for (const rowSummary of remainingRows) {
          for (const kind of rowSummary.remainingKinds) {
            globalKindCounts.set(kind, (globalKindCounts.get(kind) ?? 0) + 1);
          }
        }

        return {
          lightweightLabelRowCount: rowSummaries.filter(
            (rowSummary) => rowSummary.lightweightLabel,
          ).length,
          lightweightNestedGuideRowCount: rowSummaries.filter(
            (rowSummary) => rowSummary.lightweightNestedGuide,
          ).length,
          lightweightResizeHandleRowCount: rowSummaries.filter(
            (rowSummary) => rowSummary.lightweightResizeHandle,
          ).length,
          remainingRowCount: remainingRows.length,
          remainingVisibleChromeElementCount: remainingRows.reduce(
            (count, rowSummary) =>
              count + rowSummary.remainingVisibleChromeElementCount,
            0,
          ),
          remainingVisibleElementCount: remainingRows.reduce(
            (count, rowSummary) => count + rowSummary.remainingVisibleElementCount,
            0,
          ),
          remainingVisibleLabelElementCount: remainingRows.reduce(
            (count, rowSummary) =>
              count + rowSummary.remainingVisibleLabelElementCount,
            0,
          ),
          remainingVisibleValueElementCount: remainingRows.reduce(
            (count, rowSummary) =>
              count + rowSummary.remainingVisibleValueElementCount,
            0,
          ),
          rowCount: rows.length,
          sectionId: section.dataset.sectionId ?? "",
          topRemainingRows: remainingRows.slice(0, 5),
        };
      })
      .filter((sectionSummary) => sectionSummary.rowCount > 0)
      .sort((left, right) => {
        if (
          right.remainingVisibleElementCount !== left.remainingVisibleElementCount
        ) {
          return (
            right.remainingVisibleElementCount - left.remainingVisibleElementCount
          );
        }
        if (
          right.remainingVisibleLabelElementCount !==
          left.remainingVisibleLabelElementCount
        ) {
          return (
            right.remainingVisibleLabelElementCount -
            left.remainingVisibleLabelElementCount
          );
        }
        return right.rowCount - left.rowCount;
      });

    return {
      commonRemainingKinds: Array.from(globalKindCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 15)
        .map(([kind, count]) => ({ count, kind })),
      mountedSectionCount: sections.length,
      topSections: sectionSummaries.slice(0, 12),
      totalRemainingRowCount: sectionSummaries.reduce(
        (count, sectionSummary) => count + sectionSummary.remainingRowCount,
        0,
      ),
      totalRemainingVisibleChromeElementCount: sectionSummaries.reduce(
        (count, sectionSummary) =>
          count + sectionSummary.remainingVisibleChromeElementCount,
        0,
      ),
      totalRemainingVisibleElementCount: sectionSummaries.reduce(
        (count, sectionSummary) =>
          count + sectionSummary.remainingVisibleElementCount,
        0,
      ),
      totalRemainingVisibleLabelElementCount: sectionSummaries.reduce(
        (count, sectionSummary) =>
          count + sectionSummary.remainingVisibleLabelElementCount,
        0,
      ),
      totalRemainingVisibleValueElementCount: sectionSummaries.reduce(
        (count, sectionSummary) =>
          count + sectionSummary.remainingVisibleValueElementCount,
        0,
      ),
      totalRowCount: sectionSummaries.reduce(
        (count, sectionSummary) => count + sectionSummary.rowCount,
        0,
      ),
    };
  });

  await testInfo.attach("row-body-surface-ranking", {
    body: JSON.stringify(ranking, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_ROW_BODY_SURFACE_RANKING ${JSON.stringify(ranking, null, 2)}`,
  );

  expect(ranking.mountedSectionCount).toBeGreaterThan(20);
  expect(ranking.totalRowCount).toBeGreaterThan(200);
  expect(ranking.totalRemainingRowCount).toBeGreaterThan(0);
  expect(ranking.totalRemainingVisibleElementCount).toBeGreaterThan(0);
  expect(ranking.totalRemainingVisibleLabelElementCount).toBeGreaterThan(0);
  expect(ranking.topSections.length).toBeGreaterThanOrEqual(3);
  expect(ranking.commonRemainingKinds.length).toBeGreaterThan(0);
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button", { name: "fit view" });
  if (await fitView.isVisible()) {
    await fitView.click();
  }
}
