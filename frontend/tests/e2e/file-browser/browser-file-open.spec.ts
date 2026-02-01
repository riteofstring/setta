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
    { type: string; format?: string; textDisplayMode?: string }
  >;
};

type TextSectionExpectations = {
  format: string;
  textDisplayMode: string;
};

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  projectMetadata: ProjectMetadataEntry[];
};

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

function findSectionIdByName(
  state: ProjectStateResponse,
  name: string,
): string | null {
  for (const [sectionId, section] of Object.entries(state.sections)) {
    if (section.name === name || section.displayName === name) {
      return sectionId;
    }
  }
  return null;
}

async function waitForTextSection(
  page: Page,
  projectConfigName: string,
  name: string,
  expectations: TextSectionExpectations,
): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await loadProjectState(page, projectConfigName);
    const sectionId = findSectionIdByName(state, name);
    if (sectionId) {
      const variantId = state.projectConfig.sectionVariantMap[sectionId];
      const implId = state.sectionVariants[variantId]?.impl;
      const impl = implId ? state.sectionImpls[implId] : null;
      if (
        impl &&
        impl.type === "TextBlock" &&
        impl.format === expectations.format &&
        impl.textDisplayMode === expectations.textDisplayMode
      ) {
        return sectionId;
      }
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

  const createdSectionIds: string[] = [sectionId];

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    await sectionNode
      .locator('button[aria-label="Carousel view"]')
      .click();

    const pathInput = sectionNode.locator("search input");
    await expect(pathInput).toBeVisible();
    await pathInput.fill(workspaceRoot);
    await pathInput.press("Enter");

    const thumbnailRow = sectionNode
      .locator('[class*="overflow-x-scroll"]')
      .first();
    const readmeTile = thumbnailRow
      .locator('div[role="button"]')
      .filter({ hasText: markdownName })
      .first();
    await expect(readmeTile).toBeVisible();
    await readmeTile.dblclick();

    const markdownSectionId = await waitForTextSection(
      page,
      projectConfigName,
      markdownName,
      {
        format: "Markdown",
        textDisplayMode: "Render",
      },
    );
    createdSectionIds.push(markdownSectionId);

    const textTile = thumbnailRow
      .locator('div[role="button"]')
      .filter({ hasText: textName })
      .first();
    await expect(textTile).toBeVisible();
    await textTile.dblclick();

    const textSectionId = await waitForTextSection(
      page,
      projectConfigName,
      textName,
      {
        format: "Plaintext",
        textDisplayMode: "Edit",
      },
    );
    createdSectionIds.push(textSectionId);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: createdSectionIds,
    });
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

    const pathInput = sectionNode.locator("search input");
    await expect(pathInput).toBeVisible();
    await pathInput.fill(workspaceRoot);
    await pathInput.press("Enter");

    const thumbnailRow = sectionNode
      .locator('[class*="overflow-x-scroll"]')
      .first();
    const backendTile = thumbnailRow
      .locator('div[role="button"]')
      .filter({ hasText: folderName })
      .first();
    await expect(backendTile).toBeVisible();
    await backendTile.dblclick();

    await expect(pathInput).toHaveValue(folderName);

    const backButton = sectionNode.getByRole("button", { name: "Go back" });
    const forwardButton = sectionNode.getByRole("button", {
      name: "Go forward",
    });

    await expect(backButton).toBeEnabled();
    await backButton.click();
    await expect(pathInput).toHaveValue(workspaceRoot);

    await expect(forwardButton).toBeEnabled();
    await forwardButton.click();
    await expect(pathInput).toHaveValue(folderName);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
    await fs.rm(folderPath, { recursive: true, force: true });
  }
});
