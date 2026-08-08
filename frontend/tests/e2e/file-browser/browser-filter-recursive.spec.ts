import { type Locator, type Page, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

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
  const normalizedTarget = normalizePathForComparison(targetPath);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await cmContent.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.type(targetPath);
    await page.keyboard.press("Enter");

    const startedAt = Date.now();
    const timeoutMs = 2500;
    while (Date.now() - startedAt < timeoutMs) {
      const committedPath = normalizePathForComparison(
        await readCodeMirrorValue(page, pathInputId),
      );
      if (committedPath === normalizedTarget) {
        return;
      }
      await page.waitForTimeout(50);
    }
  }

  const finalPath = normalizePathForComparison(
    await readCodeMirrorValue(page, pathInputId),
  );
  throw new Error(
    `Browser path did not commit cleanly. Expected "${normalizedTarget}", received "${finalPath}".`,
  );
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
  const filterInputId = await filterRoot.getAttribute("id");
  if (!filterInputId) {
    throw new Error("Missing browser filter CodeMirror id.");
  }
  const cmContent = filterRoot.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await cmContent.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.type(value);

    const startedAt = Date.now();
    const timeoutMs = 2500;
    while (Date.now() - startedAt < timeoutMs) {
      const committedValue = await readCodeMirrorValue(page, filterInputId);
      if (committedValue === value) {
        return;
      }
      await page.waitForTimeout(50);
    }
  }

  const finalValue = await readCodeMirrorValue(page, filterInputId);
  throw new Error(
    `Browser filter did not commit cleanly. Expected "${value}", received "${finalValue}".`,
  );
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
  const menu = page
    .getByRole("dialog")
    .filter({ hasText: /Recursive search/i })
    .first();
  await trigger.click();
  await expect(menu).toBeVisible();

  const label = scope === "recursive" ? /Recursive search/i : /Local search/i;
  const scopeButton = menu.getByRole("button", { name: label });
  await expect(scopeButton).toBeVisible();
  await scopeButton.click();

  if (!(await menu.isVisible())) {
    await trigger.click();
    await expect(menu).toBeVisible();
  }
  await expect(menu.getByRole("button", { name: label })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
}

test("browser filter shows matches in subfolders (glob + fuzzy)", async ({
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
      throw new Error(
        "Unable to resolve viewport bounds for section placement.",
      );
    }

    const browserSection = await createTopLevelSectionFromFrontend(page, {
      projectConfigId,
      implType: "Browser",
      position: {
        x: viewportBounds.x + viewportBounds.w * 0.55,
        y: viewportBounds.y + viewportBounds.h * 0.25,
      },
      viewportBounds,
    });
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    const parentDir = await fs.mkdtemp(
      path.join(workspaceRoot, "setta-filter-recursive-"),
    );
    const nestedDir = path.join(parentDir, "alpha", "child");
    await fs.mkdir(nestedDir, { recursive: true });
    const deepJpg = path.join(nestedDir, "cat.jpg");
    const deepReadme = path.join(nestedDir, "README.md");
    await fs.writeFile(deepJpg, "jpg");
    await fs.writeFile(deepReadme, "# Deep README\n");

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

      await setSearchScope({ page, sectionNode, scope: "recursive" });
      await expect(
        sectionNode.locator('button[aria-label="alpha"]').first(),
      ).toHaveCount(1, { timeout: 15000 });

      const deepJpgTile = sectionNode
        .locator('button[aria-label="cat.jpg"]')
        .first();
      await expect(deepJpgTile).toHaveCount(0);

      await setBrowserFilter({ page, sectionNode, value: "*.jpg" });

      await expect(deepJpgTile).toHaveCount(1, { timeout: 15000 });
      await deepJpgTile.scrollIntoViewIfNeeded();
      await expect(deepJpgTile).toBeVisible();

      const deepReadmeTile = sectionNode
        .locator('button[aria-label="README.md"]')
        .first();

      await setBrowserFilter({ page, sectionNode, value: "rdme" });
      await expect(deepReadmeTile).toHaveCount(1, { timeout: 15000 });
      await deepReadmeTile.scrollIntoViewIfNeeded();
      await expect(deepReadmeTile).toBeVisible();
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
