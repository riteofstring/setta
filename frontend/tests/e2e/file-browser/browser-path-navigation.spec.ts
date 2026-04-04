import { expect, test, type Locator, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type FileBrowserRootResponse = {
  rootPath: string;
};

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

function normalizePathForComparison(value: string): string {
  const withoutPrivate = value.startsWith("/private")
    ? value.slice("/private".length)
    : value;
  return withoutPrivate.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

async function readCodeMirrorValue(locator: Locator): Promise<string> {
  const value = await locator.evaluate((root) => {
    const content =
      root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
    return content?.textContent ?? root.textContent ?? "";
  });
  return value ?? "";
}

async function commitPathInput(args: {
  page: Page;
  pathInput: Locator;
  targetPath: string;
}): Promise<void> {
  const { page, pathInput, targetPath } = args;
  const cmContent = pathInput.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  await cmContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(targetPath);
  await page.keyboard.press("Enter");
}

test("overview file browser shows dotfiles and supports breadcrumb up-navigation", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "FileBrowser",
    overviewVis: true,
    uiEditorVis: false,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const root = await postBackend<FileBrowserRootResponse>(
      page,
      "/getFileBrowserRoot",
      null,
    );
    const rootPath = root?.rootPath;
    if (!rootPath) {
      throw new Error("Missing file browser root path.");
    }

    const folderName = `pw-path-nav-${Date.now()}`;
    const parentFolder = path.join(rootPath, folderName);
    const nestedFolder = path.join(parentFolder, "nested");
    await fs.mkdir(nestedFolder, { recursive: true });
    await fs.writeFile(path.join(rootPath, ".env"), "API_KEY=test\n", "utf-8");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const pathInput = overviewPane
      .getByTestId("file-browser-path-input")
      .first();
    await expect(pathInput).toBeVisible();

    // The overview file browser should show project dotfiles without toggling a hidden-files mode.
    await expect(
      overviewPane
        .getByTestId("file-browser-row")
        .filter({ hasText: ".env" })
        .first(),
    ).toBeVisible();

    await commitPathInput({
      page,
      pathInput,
      targetPath: nestedFolder,
    });
    await expect
      .poll(async () =>
        normalizePathForComparison(await readCodeMirrorValue(pathInput)),
      )
      .toBe(normalizePathForComparison(nestedFolder));

    const breadcrumbs = overviewPane
      .getByTestId("file-browser-breadcrumbs")
      .first();
    await expect(
      breadcrumbs.getByRole("button", { name: folderName }),
    ).toBeVisible();

    // Clicking an ancestor breadcrumb should jump directly to that folder.
    await breadcrumbs.getByRole("button", { name: folderName }).click();
    await expect
      .poll(async () =>
        normalizePathForComparison(await readCodeMirrorValue(pathInput)),
      )
      .toBe(normalizePathForComparison(parentFolder));

    // The dedicated up button should then move back to the workspace root.
    const goUpButton = overviewPane
      .getByTestId("file-browser-go-up-button")
      .first();
    await expect(goUpButton).toBeEnabled();
    await goUpButton.click();
    await expect
      .poll(async () =>
        normalizePathForComparison(await readCodeMirrorValue(pathInput)),
      )
      .toBe(normalizePathForComparison(rootPath));
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("browser sections support breadcrumb and go-up navigation", async ({
  page,
}) => {
  await ensureAppReady(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const projectContext = await openIsolatedProject(page);

  try {
    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error(
        "Unable to resolve viewport bounds for section placement.",
      );
    }

    const browserSection = await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "Browser",
      viewportBounds,
    });
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    const folderName = `pw-browser-section-nav-${Date.now()}`;
    const parentFolder = path.join(workspaceRoot, folderName);
    const nestedFolder = path.join(parentFolder, "deep-child");
    await fs.mkdir(nestedFolder, { recursive: true });

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      const pathInput = sectionNode.locator(
        `[id="CodeMirror-${sectionId}-browser-path"]`,
      );
      await expect(pathInput).toBeVisible();

      await commitPathInput({
        page,
        pathInput,
        targetPath: nestedFolder,
      });
      await expect
        .poll(async () =>
          normalizePathForComparison(await readCodeMirrorValue(pathInput)),
        )
        .toBe(normalizePathForComparison(nestedFolder));

      const breadcrumbs = sectionNode.getByTestId("file-browser-breadcrumbs");
      await expect(
        breadcrumbs.getByRole("button", { name: folderName }),
      ).toBeVisible();

      // Browser sections and the overview pane should follow the same ancestor model.
      await breadcrumbs.getByRole("button", { name: folderName }).click();
      await expect
        .poll(async () =>
          normalizePathForComparison(await readCodeMirrorValue(pathInput)),
        )
        .toBe(normalizePathForComparison(parentFolder));

      const goUpButton = sectionNode.getByTestId("file-browser-go-up-button");
      await expect(goUpButton).toBeEnabled();
      await goUpButton.click();
      await expect
        .poll(async () =>
          normalizePathForComparison(await readCodeMirrorValue(pathInput)),
        )
        .toBe(normalizePathForComparison(workspaceRoot));
    } finally {
      await postBackend(page, "/deleteSections", {
        projectConfigId: projectContext.projectConfigId,
        sectionIds: [sectionId],
      });
      await fs.rm(parentFolder, { recursive: true, force: true });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
