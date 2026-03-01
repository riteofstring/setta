import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type ProjectStateUpdatePayload = {
  projectState: {
    sections: Record<string, { name: string }>;
  };
  completedOpIds: string[];
  pendingOpIds: string[];
};

test("all settings keeps non-kwarg param key column widths uniform when narrowed", async ({
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
  await page.getByText("advancedSearchShortcut", { exact: true }).waitFor();

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const latestState = await getLatestProjectState(page, projectConfigId);
  const shortcutsSectionId = findSectionIdByName(latestState, "shortcuts");

  // Reproduce the real user path by narrowing the param column via the backend endpoint.
  await postBackend(page, "/setSectionColumnWidth", {
    projectConfigId,
    sectionId: shortcutsSectionId,
    columnWidth: 44,
  });
  const updatedState = await getLatestProjectState(page, projectConfigId);
  await applyProjectStateUpdate(page, updatedState);

  // Ensure we are measuring a real populated section before asserting width behavior.
  await expect
    .poll(async () => (await readSectionLabelWidthStats(page, shortcutsSectionId)).rowCount)
    .toBeGreaterThan(20);

  // All non-kwarg label cells in the same section should share the same width.
  await expect
    .poll(
      async () =>
        (await readSectionLabelWidthStats(page, shortcutsSectionId)).widthSpread,
    )
    .toBeLessThan(1);
});

test("all settings param resize handle drag updates key width and preserves uniform rows", async ({
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
  await page.getByText("advancedSearchShortcut", { exact: true }).waitFor();

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const latestState = await getLatestProjectState(page, projectConfigId);
  const shortcutsSectionId = findSectionIdByName(latestState, "shortcuts");

  const sectionNode = page.locator(`.react-flow__node[data-id="${shortcutsSectionId}"]`);
  await expect(sectionNode).toBeVisible();

  const firstRow = sectionNode
    .locator('[data-param-row="true"].section-args-nested-key-value')
    .first();
  const label = firstRow.locator("p.section-key").first();
  const resizeHandle = firstRow.locator(".section-center.cursor-col-resize").first();

  await expect(label).toBeVisible();
  await expect(resizeHandle).toBeVisible();

  const beforeWidth = await getElementWidth(label);
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) {
    throw new Error("Missing resize handle bounding box.");
  }

  const handleY = handleBox.y + handleBox.height / 2;
  const handleX = handleBox.x + handleBox.width / 2;

  // Drag right to expand the key column and verify the visual width responds.
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX + 60, handleY, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => await getElementWidth(label)).toBeGreaterThan(
    beforeWidth + 10,
  );

  // The section's non-kwarg rows should remain aligned after interactive resize.
  await expect
    .poll(
      async () =>
        (await readSectionLabelWidthStats(page, shortcutsSectionId)).widthSpread,
    )
    .toBeLessThan(1);
});

async function readSectionLabelWidthStats(
  page: Page,
  sectionId: string,
): Promise<{
  rowCount: number;
  minWidth: number;
  maxWidth: number;
  widthSpread: number;
}> {
  return await page.evaluate((targetSectionId) => {
    const sectionNode = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${targetSectionId}"]`,
    );
    if (!sectionNode) {
      return { rowCount: 0, minWidth: 0, maxWidth: 0, widthSpread: 0 };
    }

    const rowSelector = `[id^="ParamContainer-${targetSectionId}-"][data-param-row="true"].section-args-nested-key-value`;
    const rows = Array.from(sectionNode.querySelectorAll<HTMLElement>(rowSelector));
    const widths = rows
      .map((row) => row.querySelector<HTMLElement>("p.section-key"))
      .filter((label): label is HTMLElement => label !== null)
      .map((label) => label.getBoundingClientRect().width);

    if (widths.length === 0) {
      return { rowCount: rows.length, minWidth: 0, maxWidth: 0, widthSpread: 0 };
    }

    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    return {
      rowCount: rows.length,
      minWidth,
      maxWidth,
      widthSpread: maxWidth - minWidth,
    };
  }, sectionId);
}

async function getElementWidth(locator: Locator): Promise<number> {
  return await locator.evaluate((element) => element.offsetWidth);
}

type ProjectConfigIdResponse = {
  projectConfig: { id: string };
};

async function getProjectConfigIdFromBackend(page: Page): Promise<string> {
  const pathParts = new URL(page.url()).pathname.split("/").filter(Boolean);
  const projectConfigName = pathParts[0] ?? "settings";
  const response = await postBackend<ProjectConfigIdResponse>(
    page,
    "/loadProjectConfig",
    { projectConfigName },
  );
  if (!response?.projectConfig?.id) {
    throw new Error("Missing projectConfig id from backend.");
  }
  return response.projectConfig.id;
}

async function getLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<ProjectStateUpdatePayload> {
  const payload = await postBackend<ProjectStateUpdatePayload>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  if (!payload) {
    throw new Error("Missing project state payload.");
  }
  return payload;
}

function findSectionIdByName(
  payload: ProjectStateUpdatePayload,
  sectionName: string,
): string {
  for (const [sectionId, section] of Object.entries(payload.projectState.sections)) {
    if (section.name === sectionName) {
      return sectionId;
    }
  }
  throw new Error(`Missing section ${sectionName}`);
}

async function applyProjectStateUpdate(
  page: Page,
  payload: ProjectStateUpdatePayload,
): Promise<void> {
  await page.evaluate(async (stateUpdate) => {
    const mod = await import("/src/state/actions/sectionInfos");
    mod.processProjectStateUpdateFromBackend(stateUpdate);
  }, payload);
}
