import { type Locator, type Page, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  getViewportBoundsForPlacement,
  postBackend,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pR5cAAAAASUVORK5CYII=";

async function setBrowserPath({
  page,
  sectionNode,
  sectionId,
  targetPath,
}: {
  page: Page;
  sectionNode: Locator;
  sectionId: string;
  targetPath: string;
}) {
  const pathInputId = `CodeMirror-${sectionId}-browser-path`;
  const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
  await expect(pathInput).toBeVisible();
  const cmContent = pathInput.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  await cmContent.click();
  await cmContent.fill(targetPath);
  await page.keyboard.press("Enter");
}

async function setBrowserFilter({
  page,
  sectionNode,
  value,
}: {
  page: Page;
  sectionNode: Locator;
  value: string;
}) {
  const filterRoot = sectionNode
    .locator('[id^="CodeMirror-FileBrowserFilter-"]')
    .first();
  await expect(filterRoot).toBeVisible();
  const cmContent = filterRoot.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  await cmContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type(value);
}

async function setSearchScope({
  page,
  sectionNode,
  scope,
}: {
  page: Page;
  sectionNode: Locator;
  scope: "recursive" | "local";
}) {
  const trigger = sectionNode.locator(
    'button[aria-label="Search scope options"]',
  );
  await expect(trigger).toBeVisible();
  await trigger.click();

  const label = scope === "recursive" ? /Recursive search/i : /Local search/i;
  await page.getByRole("button", { name: label }).click();
}

test("browser filter dropdown toggles recursive vs local search (and shows subfolder path)", async ({
  page,
}) => {
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
      position: {
        x: viewportBounds.x + viewportBounds.w * 0.25,
        y: viewportBounds.y + viewportBounds.h * 0.2,
      },
      viewportBounds,
    },
  );
  const sectionId = browserSection?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating browser section.");
  }

  const parentDir = await fs.mkdtemp(
    path.join(workspaceRoot, "setta-browser-scope-"),
  );
  const nestedDir = path.join(parentDir, "alpha", "child");
  await fs.mkdir(nestedDir, { recursive: true });
  const deepPng = path.join(nestedDir, "cat.png");
  await fs.writeFile(
    deepPng,
    Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"),
  );

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    await sectionNode.locator('button[aria-label="Carousel view"]').click();

    await setBrowserPath({
      page,
      sectionNode,
      sectionId,
      targetPath: parentDir,
    });

    // Default is recursive.
    await setBrowserFilter({ page, sectionNode, value: "*.png" });

    const deepTile = sectionNode
      .locator("button")
      .filter({ hasText: "cat.png" })
      .first();

    await expect(deepTile).toHaveCount(1, { timeout: 15000 });
    await deepTile.scrollIntoViewIfNeeded();
    await expect(deepTile).toBeVisible();
    await expect(deepTile).toContainText("alpha/child");

    await setSearchScope({ page, sectionNode, scope: "local" });

    await expect(deepTile).toHaveCount(0, { timeout: 15000 });
  } finally {
    await fs.rm(parentDir, { recursive: true, force: true });
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});

test("browser type filters hide files by category", async ({ page }) => {
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
      position: {
        x: viewportBounds.x + viewportBounds.w * 0.25,
        y: viewportBounds.y + viewportBounds.h * 0.5,
      },
      viewportBounds,
    },
  );
  const sectionId = browserSection?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating browser section.");
  }

  const parentDir = await fs.mkdtemp(
    path.join(workspaceRoot, "setta-browser-types-"),
  );
  const imageName = "cat.png";
  const textName = "notes.txt";
  await fs.writeFile(
    path.join(parentDir, imageName),
    Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"),
  );
  await fs.writeFile(path.join(parentDir, textName), "hello");

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    await sectionNode.locator('button[aria-label="Carousel view"]').click();

    await setBrowserPath({
      page,
      sectionNode,
      sectionId,
      targetPath: parentDir,
    });

    const imageTile = sectionNode
      .locator("button")
      .filter({ hasText: imageName })
      .first();
    const textTile = sectionNode
      .locator("button")
      .filter({ hasText: textName })
      .first();

    await expect(imageTile).toBeVisible();
    await expect(textTile).toBeVisible();

    const typesColumn = sectionNode.locator("article").filter({ hasText: "Types" }).first();
    await expect(typesColumn).toBeVisible();
    await typesColumn
      .getByRole("checkbox", { name: "Text" })
      .click({ timeout: 15000 });

    await expect(textTile).toHaveCount(0, { timeout: 15000 });
    await expect(imageTile).toHaveCount(1);

    await typesColumn.getByRole("button", { name: "Select All" }).click();
    await expect(textTile).toHaveCount(1, { timeout: 15000 });
  } finally {
    await fs.rm(parentDir, { recursive: true, force: true });
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});

type ProjectStateResponse = {
  projectConfig: {
    sectionVariantMap: Record<string, string>;
  };
  sectionVariants: Record<string, { impl: string }>;
  sectionImpls: Record<string, { type: string; imagePath?: string }>;
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

function findImageSectionIdByPath(
  state: ProjectStateResponse,
  expectedImagePath: string,
): string | null {
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const implId = state.sectionVariants[variantId]?.impl;
    const impl = implId ? state.sectionImpls[implId] : null;
    if (impl && impl.type === "Image" && impl.imagePath === expectedImagePath) {
      return sectionId;
    }
  }
  return null;
}

async function waitForImageSection(
  page: Page,
  projectConfigName: string,
  expectedImagePath: string,
): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await loadProjectState(page, projectConfigName);
    const sectionId = findImageSectionIdByPath(state, expectedImagePath);
    if (sectionId) {
      return sectionId;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for Image section (${expectedImagePath}).`);
}

test("browser opens image files in image sections on double click", async ({
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
      position: {
        x: viewportBounds.x + viewportBounds.w * 0.25,
        y: viewportBounds.y + viewportBounds.h * 0.35,
      },
      viewportBounds,
    },
  );
  const sectionId = browserSection?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating browser section.");
  }

  const imageName = "browser_image_open.png";
  const imagePath = path.join(workspaceRoot, imageName);
  await fs.writeFile(imagePath, Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"));
  let imageSectionId: string | null = null;

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    await sectionNode.locator('button[aria-label="Carousel view"]').click();
    await setBrowserPath({
      page,
      sectionNode,
      sectionId,
      targetPath: workspaceRoot,
    });

    const imageTile = sectionNode
      .locator("button")
      .filter({ hasText: imageName })
      .first();
    await expect(imageTile).toBeVisible();
    await imageTile.dblclick();

    imageSectionId = await waitForImageSection(page, projectConfigName, imageName);
  } finally {
    await fs.rm(imagePath, { force: true });
    const sectionIds = [sectionId];
    if (imageSectionId) {
      sectionIds.push(imageSectionId);
    }
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds,
    });
  }
});
