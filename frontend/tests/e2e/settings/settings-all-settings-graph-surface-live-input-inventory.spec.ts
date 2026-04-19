import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type LiveControlEntry = {
  ariaLabel: string | null;
  id: string | null;
  ownerSectionId: string | null;
  ownerRowId: string | null;
  ownerRowText: string | null;
  placeholder: string | null;
  role: string | null;
  searchOwned: boolean;
  tagName: string;
  text: string | null;
  type: string | null;
};

type LiveInputInventory = {
  documentButtonCount: number;
  documentInputCount: number;
  documentTextareaCount: number;
  graphSurfaceButtonEntries: LiveControlEntry[];
  graphSurfaceInputEntries: LiveControlEntry[];
  graphSurfaceTextareaEntries: LiveControlEntry[];
  mountedSectionCount: number;
  outsideGraphButtonEntries: LiveControlEntry[];
  outsideGraphInputEntries: LiveControlEntry[];
  outsideGraphTextareaEntries: LiveControlEntry[];
  stateMachineGateEntries: LiveControlEntry[];
};

test("settings All Settings graph-surface live input inventory identifies remaining mounted editor survivors", async ({
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

  const inventory = await page.evaluate((): LiveInputInventory => {
    const SETTINGS_SECTION_SELECTOR = 'section[data-section-id^="settings-section__"]';
    const stateMachineGateSectionId = "settings-section__stateMachineGateSectionDefault";
    const mountedSections = Array.from(
      document.querySelectorAll<HTMLElement>(SETTINGS_SECTION_SELECTOR),
    );
    const summarize = (element: HTMLElement): LiveControlEntry => {
      const ownerSection = element.closest<HTMLElement>(SETTINGS_SECTION_SELECTOR);
      const ownerRow =
        element.closest<HTMLElement>('[id^="ParamContainer-"]') ??
        element.closest<HTMLElement>('[data-param-row="true"]');
      return {
        ariaLabel: element.getAttribute("aria-label"),
        id: element.id || null,
        ownerSectionId: ownerSection?.dataset.sectionId ?? null,
        ownerRowId: ownerRow?.id ?? null,
        ownerRowText:
          typeof ownerRow?.innerText === "string"
            ? ownerRow.innerText.trim().slice(0, 200)
            : null,
        placeholder: element.getAttribute("placeholder"),
        role: element.getAttribute("role"),
        searchOwned: element.closest("search") !== null,
        tagName: element.tagName.toLowerCase(),
        text:
          element.tagName === "BUTTON"
            ? (element.textContent ?? "").trim()
            : null,
        type: element.getAttribute("type"),
      };
    };
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("input, textarea, button"),
    );
    const entries = controls.map(summarize);
    const graphSurfaceEntries = entries.filter(
      (entry) => entry.ownerSectionId !== null,
    );
    const outsideGraphEntries = entries.filter(
      (entry) => entry.ownerSectionId === null,
    );

    return {
      documentButtonCount: document.querySelectorAll("button").length,
      documentInputCount: document.querySelectorAll("input").length,
      documentTextareaCount: document.querySelectorAll("textarea").length,
      graphSurfaceButtonEntries: graphSurfaceEntries.filter(
        (entry) => entry.tagName === "button",
      ),
      graphSurfaceInputEntries: graphSurfaceEntries.filter(
        (entry) => entry.tagName === "input",
      ),
      graphSurfaceTextareaEntries: graphSurfaceEntries.filter(
        (entry) => entry.tagName === "textarea",
      ),
      mountedSectionCount: mountedSections.length,
      outsideGraphButtonEntries: outsideGraphEntries.filter(
        (entry) => entry.tagName === "button",
      ),
      outsideGraphInputEntries: outsideGraphEntries.filter(
        (entry) => entry.tagName === "input",
      ),
      outsideGraphTextareaEntries: outsideGraphEntries.filter(
        (entry) => entry.tagName === "textarea",
      ),
      stateMachineGateEntries: graphSurfaceEntries.filter(
        (entry) => entry.ownerSectionId === stateMachineGateSectionId,
      ),
    };
  });

  await testInfo.attach("all-settings-graph-surface-live-input-inventory", {
    body: JSON.stringify(inventory, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_GRAPH_SURFACE_LIVE_INPUT_INVENTORY ${JSON.stringify(
      inventory,
      null,
      2,
    )}`,
  );

  expect(inventory.mountedSectionCount).toBeGreaterThan(20);
  expect(inventory.documentInputCount).toBeGreaterThanOrEqual(
    inventory.graphSurfaceInputEntries.length +
      inventory.outsideGraphInputEntries.length,
  );
  expect(inventory.documentTextareaCount).toBeGreaterThanOrEqual(
    inventory.graphSurfaceTextareaEntries.length +
      inventory.outsideGraphTextareaEntries.length,
  );
  expect(inventory.documentButtonCount).toBeGreaterThanOrEqual(
    inventory.graphSurfaceButtonEntries.length +
      inventory.outsideGraphButtonEntries.length,
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
