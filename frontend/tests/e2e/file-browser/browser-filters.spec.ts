import { type Locator, type Page, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pR5cAAAAASUVORK5CYII=";

function normalizePathForComparison(value: string): string {
  const withoutPrivate = value.startsWith("/private")
    ? value.slice("/private".length)
    : value;
  return withoutPrivate.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
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
  const normalizedTarget = normalizePathForComparison(targetPath);
  await expect
    .poll(async () =>
      normalizePathForComparison(await readCodeMirrorValue(page, pathInputId)),
    )
    .toContain(normalizedTarget);
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
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
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
    await fs.writeFile(deepPng, Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"));

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      await sectionNode.locator('button[aria-label="Carousel view"]').click();

      // Layout regression checks:
      // 1. The popover should be centered on the trigger button (previously it shifted right).
      // 2. Option buttons should not overflow the popover container (box-sizing regression caused +24px overflow).
      {
        const trigger = sectionNode.locator(
          'button[aria-label="Search scope options"]',
        );
        await expect(trigger).toBeVisible();
        await trigger.click();

        const menu = page.getByRole("dialog").filter({
          hasText: /Recursive search/i,
        });
        await expect(menu).toBeVisible();

        const triggerBox = await trigger.boundingBox();
        const menuBox = await menu.boundingBox();
        if (!triggerBox || !menuBox) {
          throw new Error("Missing bounding box for search scope popover.");
        }

        const triggerCenterX = triggerBox.x + triggerBox.width / 2;
        const menuCenterX = menuBox.x + menuBox.width / 2;
        expect(Math.abs(menuCenterX - triggerCenterX)).toBeLessThan(8);

        const arrow = menu.locator("svg.h-2.w-4");
        await expect(arrow).toHaveCount(1);
        const arrowStroke = await arrow.evaluate((el) => {
          return getComputedStyle(el).stroke;
        });
        expect(arrowStroke).not.toBe("none");

        const recursive = menu.getByRole("button", { name: /Recursive search/i });
        const local = menu.getByRole("button", { name: /Local search/i });
        const recursiveBox = await recursive.boundingBox();
        const localBox = await local.boundingBox();
        if (!recursiveBox || !localBox) {
          throw new Error("Missing bounding box for popover option buttons.");
        }
        const menuRight = menuBox.x + menuBox.width;
        const menuLeft = menuBox.x;
        expect(recursiveBox.x).toBeGreaterThanOrEqual(menuLeft - 0.5);
        expect(recursiveBox.x + recursiveBox.width).toBeLessThanOrEqual(
          menuRight + 0.5,
        );
        expect(localBox.x).toBeGreaterThanOrEqual(menuLeft - 0.5);
        expect(localBox.x + localBox.width).toBeLessThanOrEqual(menuRight + 0.5);

        // Close the menu without altering the default scope.
        await recursive.click();
      }

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
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("browser type filters hide files by category", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
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
    const imageName = "types-filter-cat.png";
    const textName = "types-filter-cat.txt";
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

      await sectionNode.locator('button[aria-label="Icon view"]').click();
      // Use recursive search so we don't rely on folder navigation timing.
      await setBrowserFilter({ page, sectionNode, value: "types-filter-cat" });

      const imageTile = sectionNode.getByText(imageName, { exact: true });
      const textTile = sectionNode.getByText(textName, { exact: true });

      await expect(imageTile).toBeVisible({ timeout: 15000 });
      await expect(textTile).toBeVisible({ timeout: 15000 });

      const typesColumn = sectionNode
        .locator("article")
        .filter({ hasText: "Filters" })
        .first();
      await expect(typesColumn).toBeVisible();
      await typesColumn
        .getByRole("button", { name: "Text" })
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
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("browser search scope menu stays anchored while panning the canvas", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
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
          y: viewportBounds.y + viewportBounds.h * 0.25,
        },
        viewportBounds,
      },
    );
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      const trigger = sectionNode.locator(
        'button[aria-label="Search scope options"]',
      );
      await expect(trigger).toBeVisible();
      await trigger.click();

      const dialog = page
        .getByRole("dialog")
        .filter({ hasText: /Recursive search/i })
        .first();
      await expect(dialog).toBeVisible();

      const beforeTriggerBox = await trigger.boundingBox();
      const beforeDialogBox = await dialog.boundingBox();
      if (!beforeTriggerBox || !beforeDialogBox) {
        throw new Error("Missing anchor bounds for search scope popover.");
      }
      const beforeDx = beforeDialogBox.x - beforeTriggerBox.x;
      const beforeDy = beforeDialogBox.y - beforeTriggerBox.y;

      const reactFlow = page.locator(".react-flow");
      await expect(reactFlow).toBeVisible();
      await reactFlow.evaluate((el) => {
        el.scrollLeft = el.scrollLeft + 240;
        el.scrollTop = el.scrollTop + 160;
      });

      await page.waitForTimeout(250);

      const afterTriggerBox = await trigger.boundingBox();
      const afterDialogBox = await dialog.boundingBox();
      if (!afterTriggerBox || !afterDialogBox) {
        throw new Error("Missing anchor bounds after pan for search scope popover.");
      }

      const triggerMoved =
        Math.abs(afterTriggerBox.x - beforeTriggerBox.x) +
        Math.abs(afterTriggerBox.y - beforeTriggerBox.y);
      expect(triggerMoved).toBeGreaterThan(2);

      const afterDx = afterDialogBox.x - afterTriggerBox.x;
      const afterDy = afterDialogBox.y - afterTriggerBox.y;

      expect(Math.abs(afterDx - beforeDx)).toBeLessThan(6);
      expect(Math.abs(afterDy - beforeDy)).toBeLessThan(6);
    } finally {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
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
  const expectedNormalized = normalizePathForComparison(expectedImagePath);
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const implId = state.sectionVariants[variantId]?.impl;
    const impl = implId ? state.sectionImpls[implId] : null;
    if (
      impl &&
      impl.type === "Image" &&
      typeof impl.imagePath === "string" &&
      normalizePathForComparison(impl.imagePath) === expectedNormalized
    ) {
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
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
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

    const parentDir = await fs.mkdtemp(
      path.join(workspaceRoot, "setta-browser-image-open-"),
    );
    const imageName = "browser_image_open.png";
    const imagePath = path.join(parentDir, imageName);
    const expectedImageBrowserPath = imagePath;
    await fs.writeFile(imagePath, Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"));
    let imageSectionId: string | null = null;

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      await sectionNode.locator('button[aria-label="Icon view"]').click();
      // Use filter search so we exercise the recursive search path (and avoid relying
      // on folder navigation timing for the image open behavior).
      await setBrowserFilter({ page, sectionNode, value: imageName });

      const imageThumbnail = sectionNode.locator(`img[alt="${imageName}"]`).first();
      await expect(imageThumbnail).toBeVisible({ timeout: 15000 });
      await imageThumbnail.dblclick();

      imageSectionId = await waitForImageSection(
        page,
        projectConfigName,
        expectedImageBrowserPath,
      );
    } finally {
      await fs.rm(parentDir, { recursive: true, force: true });
      const sectionIds = [sectionId];
      if (imageSectionId) {
        sectionIds.push(imageSectionId);
      }
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds,
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
