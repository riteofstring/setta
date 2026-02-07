import { promises as fs } from "node:fs";
import path from "node:path";
import { type Page, expect, test } from "@playwright/test";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  getViewportBoundsForPlacement,
  postBackend,
} from "../helpers";

type ProjectStateResponse = {
  projectConfig: {
    sectionVariantMap: Record<string, string>;
  };
  sections: Record<string, { name?: string; displayName?: string }>;
  sectionVariants: Record<string, { impl: string }>;
  sectionImpls: Record<
    string,
    { type: string; format?: string; textDisplayMode?: string; text?: string }
  >;
};

type TextSectionExpectations = {
  format: string;
  textDisplayMode: string;
  textIncludes: string;
};

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  projectMetadata: ProjectMetadataEntry[];
};

function normalizePathForComparison(value: string): string {
  const withoutPrivate = value.startsWith("/private")
    ? value.slice("/private".length)
    : value;
  return withoutPrivate.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

async function resolveProjectConfigName(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const match = metadata.projectMetadata.find(
    (entry) => entry.id === projectConfigId,
  );
  if (!match?.name) {
    throw new Error(
      `Unable to resolve project config name for ${projectConfigId}.`,
    );
  }
  return match.name;
}

async function loadProjectState(
  page: Page,
  projectConfigName: string,
): Promise<ProjectStateResponse> {
  const response = await postBackend<ProjectStateResponse>(
    page,
    "/loadProjectConfig",
    { projectConfigName },
  );
  if (!response) {
    throw new Error("Missing project config response.");
  }
  return response;
}

function findSectionIdByText(
  state: ProjectStateResponse,
  expectations: TextSectionExpectations,
): string | null {
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const implId = state.sectionVariants[variantId]?.impl;
    const impl = implId ? state.sectionImpls[implId] : null;
    if (
      impl &&
      impl.type === "TextBlock" &&
      impl.format === expectations.format &&
      impl.textDisplayMode === expectations.textDisplayMode &&
      typeof impl.text === "string" &&
      impl.text.includes(expectations.textIncludes)
    ) {
      return sectionId;
    }
  }
  return null;
}

async function readCodeMirrorValue(page: Page, id: string): Promise<string> {
  const value = await page.evaluate((targetId) => {
    const root = document.getElementById(targetId);
    if (!root) {
      return null;
    }
    const content =
      root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
    return content?.textContent ?? root.textContent ?? "";
  }, id);
  return value ?? "";
}

async function setBrowserPath(
  page: Page,
  sectionNode: ReturnType<Page["locator"]>,
  sectionId: string,
  targetPath: string,
): Promise<string> {
  const pathInputId = `CodeMirror-${sectionId}-browser-path`;
  const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
  await expect(pathInput).toBeVisible();
  const currentValue = await readCodeMirrorValue(page, pathInputId);
  const normalizedCurrent = normalizePathForComparison(currentValue);
  const normalizedTarget = normalizePathForComparison(targetPath);
  const nextValue =
    normalizedCurrent === normalizedTarget &&
    !targetPath.endsWith(path.sep)
      ? `${targetPath}${path.sep}`
      : targetPath;

  const cmContent = pathInput.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  await cmContent.click();
  await cmContent.fill(nextValue);
  await page.keyboard.press("Enter");

  await expect
    .poll(async () =>
      normalizePathForComparison(await readCodeMirrorValue(page, pathInputId)),
    )
    .toContain(normalizedTarget);

  return pathInputId;
}

async function waitForTextSection(
  page: Page,
  projectConfigName: string,
  name: string,
  expectations: TextSectionExpectations,
): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await loadProjectState(page, projectConfigName);
    const sectionId = findSectionIdByText(state, expectations);
    if (sectionId) {
      return sectionId;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for ${name} TextBlock.`);
}

test("browser opens markdown and text files in text sections", async ({
  page,
}) => {
  await ensureAppReady(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const projectConfigId = await getCurrentProjectConfigId(page);
  const projectConfigName = await resolveProjectConfigName(
    page,
    projectConfigId,
  );
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }

  const browserSection = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Browser",
      viewportBounds,
    },
  );
  const sectionId = browserSection?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating browser section.");
  }

  const markdownName = "browser_test.md";
  const textName = "browser_test.txt";
  const markdownPath = path.join(workspaceRoot, markdownName);
  const textPath = path.join(workspaceRoot, textName);
  await fs.writeFile(markdownPath, "# Browser Test\n\nHello.");
  await fs.writeFile(textPath, "Plaintext browser test.");

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    await expect(
      sectionNode.locator('button[aria-label="Go back"]'),
    ).toBeVisible();
    await expect(
      sectionNode.locator('button[aria-label="Go forward"]'),
    ).toBeVisible();

    await sectionNode
      .locator('button[aria-label="Carousel view"]')
      .click();

    await setBrowserPath(page, sectionNode, sectionId, workspaceRoot);

    const thumbnailRow = sectionNode
      .locator('[class*="overflow-x-scroll"]')
      .first();
    const readmeTile = thumbnailRow
      .locator("button")
      .filter({ hasText: markdownName })
      .first();
    await expect(readmeTile).toBeVisible();
    await readmeTile.dblclick();

    await waitForTextSection(
      page,
      projectConfigName,
      markdownName,
      {
        format: "Markdown",
        textDisplayMode: "Render",
        textIncludes: "Browser Test",
      },
    );

    const textTile = thumbnailRow
      .locator("button")
      .filter({ hasText: textName })
      .first();
    await expect(textTile).toBeVisible();
    await textTile.dblclick();

    await waitForTextSection(
      page,
      projectConfigName,
      textName,
      {
        format: "Plaintext",
        textDisplayMode: "Edit",
        textIncludes: "Plaintext browser test.",
      },
    );
  } finally {
    await fs.rm(markdownPath, { force: true });
    await fs.rm(textPath, { force: true });
  }
});

test("browser history buttons navigate folders", async ({ page }) => {
  await ensureAppReady(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const normalizedWorkspaceRoot = normalizePathForComparison(workspaceRoot);
  const projectConfigId = await getCurrentProjectConfigId(page);
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }

  const browserSection = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Browser",
      viewportBounds,
    },
  );
  const sectionId = browserSection?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating browser section.");
  }

  const folderName = "browser_history_folder";
  const folderPath = path.join(workspaceRoot, folderName);
  await fs.mkdir(folderPath, { recursive: true });

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    await sectionNode
      .locator('button[aria-label="Carousel view"]')
      .click();

    const pathInputId = await setBrowserPath(
      page,
      sectionNode,
      sectionId,
      workspaceRoot,
    );

    const thumbnailRow = sectionNode
      .locator('[class*="overflow-x-scroll"]')
      .first();
    const backendTile = thumbnailRow
      .locator("button")
      .filter({ hasText: folderName })
      .first();
    await expect(backendTile).toBeVisible();
    await backendTile.dblclick();

    await expect
      .poll(() => readCodeMirrorValue(page, pathInputId))
      .toContain(folderName);

    const backButton = sectionNode.locator('button[aria-label="Go back"]');
    const forwardButton = sectionNode.locator(
      'button[aria-label="Go forward"]',
    );

    await expect(backButton).toBeEnabled();
    await backButton.click();
    await expect
      .poll(async () =>
        normalizePathForComparison(await readCodeMirrorValue(page, pathInputId)),
      )
      .toContain(normalizedWorkspaceRoot);

    await expect(forwardButton).toBeEnabled();
    await forwardButton.click();
    await expect
      .poll(() => readCodeMirrorValue(page, pathInputId))
      .toContain(folderName);
  } finally {
    await fs.rm(folderPath, { recursive: true, force: true });
  }
});

test("browser list view opens folders on double click", async ({ page }) => {
  await ensureAppReady(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const normalizedWorkspaceRoot = normalizePathForComparison(workspaceRoot);
  const projectConfigId = await getCurrentProjectConfigId(page);
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }

  const browserSection = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Browser",
      viewportBounds,
    },
  );
  const sectionId = browserSection?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating browser section.");
  }

  const folderName = "browser_list_folder";
  const folderPath = path.join(workspaceRoot, folderName);
  await fs.mkdir(folderPath, { recursive: true });

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    // List view is the default; ensure we're rooted at the workspace.
    const pathInputId = await setBrowserPath(
      page,
      sectionNode,
      sectionId,
      workspaceRoot,
    );

    const folderRow = sectionNode
      .locator('section[aria-label="File explorer"] [title]')
      .filter({ hasText: folderName })
      .first();
    await expect(folderRow).toBeVisible();

    const backButton = sectionNode.locator('button[aria-label="Go back"]');
    const forwardButton = sectionNode.locator('button[aria-label="Go forward"]');

    // Double-click on the folder label itself (not the expand/collapse caret).
    const folderLabel = folderRow.locator("span").filter({ hasText: folderName });
    await folderRow.scrollIntoViewIfNeeded();
    await folderLabel.first().click({ clickCount: 2 });
    // Ensure the row click handler ran (selection is a good proxy for events
    // reaching the virtualized list row).
    await expect(folderRow).toHaveClass(/bg-blue-50/);

    await expect
      .poll(async () =>
        normalizePathForComparison(await readCodeMirrorValue(page, pathInputId)),
      )
      .toContain(folderName);
    await expect(backButton).toBeEnabled();

    await backButton.click();
    await expect
      .poll(async () =>
        normalizePathForComparison(await readCodeMirrorValue(page, pathInputId)),
      )
      .toContain(normalizedWorkspaceRoot);

    await expect(forwardButton).toBeEnabled();
    await forwardButton.click();
    await expect
      .poll(async () =>
        normalizePathForComparison(await readCodeMirrorValue(page, pathInputId)),
      )
      .toContain(folderName);
  } finally {
    await fs.rm(folderPath, { recursive: true, force: true });
  }
});
