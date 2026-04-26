import { type Page, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getCurrentProjectConfigId,
  getViewportBoundsForPlacement,
  openIsolatedProject,
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

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

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
    // Prefer reading from the CodeMirror EditorView state because the DOM can be
    // visually truncated (e.g. `truncate`) and doesn't always expose the full value.
    const candidates = [
      root,
      root.matches(".cm-editor") ? root : root.querySelector(".cm-editor"),
      root.querySelector(".cm-content"),
      root.querySelector("[contenteditable='true']"),
    ].filter(Boolean) as HTMLElement[];

    for (const candidate of candidates) {
      const view = (
        candidate as HTMLElement & {
          cmView?: { state?: { doc?: { toString: () => string } } };
        }
      ).cmView;
      const doc = view?.state?.doc;
      if (doc && typeof doc.toString === "function") {
        return doc.toString();
      }
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
  const commitPath = async (nextPath: string): Promise<void> => {
    const cmContent = pathInput.locator(".cm-content");
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(nextPath);
    await page.keyboard.press("Enter");

    await expect
      .poll(async () =>
        normalizePathForComparison(
          await readCodeMirrorValue(page, pathInputId),
        ),
      )
      .toContain(normalizePathForComparison(nextPath));
  };

  const currentValue = await readCodeMirrorValue(page, pathInputId);
  const normalizedCurrent = normalizePathForComparison(currentValue);
  const normalizedTarget = normalizePathForComparison(targetPath);
  if (normalizedCurrent === normalizedTarget) {
    const parentPath = path.dirname(targetPath);
    if (normalizePathForComparison(parentPath) !== normalizedTarget) {
      await commitPath(parentPath);
    }
  }
  await commitPath(targetPath);

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
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
    const projectConfigName = await resolveProjectConfigName(
      page,
      projectConfigId,
    );
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

      await sectionNode.locator('button[aria-label="Carousel view"]').click();

      await setBrowserPath(page, sectionNode, sectionId, workspaceRoot);

      const readmeTile = sectionNode
        .locator(`button[aria-label="${markdownName}"]`)
        .first();
      await expect(readmeTile).toBeVisible({ timeout: 15000 });
      await readmeTile.dblclick();

      await waitForTextSection(page, projectConfigName, markdownName, {
        format: "Markdown",
        textDisplayMode: "Render",
        textIncludes: "Browser Test",
      });

      const textTile = sectionNode
        .locator(`button[aria-label="${textName}"]`)
        .first();
      await expect(textTile).toBeVisible({ timeout: 15000 });
      await textTile.dblclick();

      await waitForTextSection(page, projectConfigName, textName, {
        format: "Plaintext",
        textDisplayMode: "Edit",
        textIncludes: "Plaintext browser test.",
      });
    } finally {
      await fs.rm(markdownPath, { force: true });
      await fs.rm(textPath, { force: true });
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("browser history buttons navigate folders", async ({ page }) => {
  await ensureAppReady(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const workspaceParent = path.dirname(workspaceRoot);
  const normalizedWorkspaceRoot = normalizePathForComparison(workspaceRoot);
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

    const folderName = "browser_history_folder";
    const folderPath = path.join(workspaceRoot, folderName);
    await fs.mkdir(folderPath, { recursive: true });

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      await sectionNode.locator('button[aria-label="Carousel view"]').click();

      const pathInputId = await setBrowserPath(
        page,
        sectionNode,
        sectionId,
        workspaceRoot,
      );

      const resizeHandle = sectionNode.locator(
        '[aria-label="Resize thumbnail strip"]',
      );
      await expect(resizeHandle).toBeVisible();
      const thumbnailRow = resizeHandle
        .locator("xpath=following-sibling::article")
        .first();

      const backendTile = thumbnailRow
        .locator(`button[aria-label="${folderName}"]`)
        .first();
      await expect(backendTile).toBeVisible({ timeout: 15000 });
      await backendTile.scrollIntoViewIfNeeded();
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
          normalizePathForComparison(
            await readCodeMirrorValue(page, pathInputId),
          ),
        )
        .toContain(normalizedWorkspaceRoot);

      await expect(forwardButton).toBeEnabled();
      await forwardButton.click();
      await expect
        .poll(() => readCodeMirrorValue(page, pathInputId))
        .toContain(folderName);
    } finally {
      await fs.rm(folderPath, { recursive: true, force: true });
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("browser list view opens folders on double click", async ({ page }) => {
  await ensureAppReady(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const workspaceParent = path.dirname(workspaceRoot);
  const normalizedWorkspaceRoot = normalizePathForComparison(workspaceRoot);
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
    const folderName = "browser_list_folder";
    const folderPath = path.join(workspaceRoot, folderName);
    await fs.mkdir(folderPath, { recursive: true });

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

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      await sectionNode.locator('button[aria-label="List view"]').click();

      const pathInputId = await setBrowserPath(
        page,
        sectionNode,
        sectionId,
        workspaceParent,
      );
      await setBrowserPath(page, sectionNode, sectionId, workspaceRoot);

      const explorer = sectionNode.locator(
        '[role="region"][aria-label="File explorer"]',
      );
      await expect(explorer).toBeVisible();

      const backButton = sectionNode.locator('button[aria-label="Go back"]');
      const forwardButton = sectionNode.locator(
        'button[aria-label="Go forward"]',
      );

      const folderRow = explorer
        .locator('[data-testid="file-browser-row"]', { hasText: folderName })
        .first();
      if (!(await folderRow.isVisible().catch(() => false))) {
        const tree = explorer.locator('div[tabindex="0"]').first();
        await expect(tree).toBeVisible();
        await tree.evaluate((element: HTMLElement) => element.focus());
        await page.keyboard.press("ArrowRight");
        if (!(await folderRow.isVisible().catch(() => false))) {
          await page.keyboard.press("ArrowRight");
        }
      }
      await expect(folderRow).toBeVisible();
      await folderRow.scrollIntoViewIfNeeded();
      await folderRow.dblclick();

      await expect
        .poll(async () =>
          normalizePathForComparison(
            await readCodeMirrorValue(page, pathInputId),
          ),
        )
        .toContain(folderName);
      await expect(backButton).toBeEnabled();

      await backButton.click();
      await expect
        .poll(async () =>
          normalizePathForComparison(
            await readCodeMirrorValue(page, pathInputId),
          ),
        )
        .toContain(normalizedWorkspaceRoot);

      await expect(forwardButton).toBeEnabled();
      await forwardButton.click();
      await expect
        .poll(async () =>
          normalizePathForComparison(
            await readCodeMirrorValue(page, pathInputId),
          ),
        )
        .toContain(folderName);
    } finally {
      await fs.rm(folderPath, { recursive: true, force: true });
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("browser path commits latest value on blur after fast typing", async ({
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

  const browserSection = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Browser",
    viewportBounds,
  });
  const sectionId = browserSection?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating browser section.");
  }

  const folderName = `browser_blur_commit_${Date.now()}`;
  const folderPath = path.join(workspaceRoot, folderName);
  const normalizedFolderPath = normalizePathForComparison(folderPath);
  await fs.mkdir(folderPath, { recursive: true });

  try {
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    await sectionNode.locator('button[aria-label="Carousel view"]').click();

    const pathInputId = `CodeMirror-${sectionId}-browser-path`;
    const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
    await expect(pathInput).toBeVisible();

    // Establish a known starting value.
    await pathInput.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.insertText(workspaceRoot);
    await page.click(".canvas-flow__canvas", {
      position: { x: 8, y: 8 },
      force: true,
    });
    await expect
      .poll(async () =>
        normalizePathForComparison(
          await readCodeMirrorValue(page, pathInputId),
        ),
      )
      .toContain(normalizePathForComparison(workspaceRoot));

    // Repro: type fast, blur immediately. We should commit the latest value,
    // not a stale pre-change inputValue.
    await pathInput.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.insertText(folderPath);
    await page.click(".canvas-flow__canvas", {
      position: { x: 8, y: 8 },
      force: true,
    });

    await expect
      .poll(async () =>
        normalizePathForComparison(
          await readCodeMirrorValue(page, pathInputId),
        ),
      )
      .toContain(normalizedFolderPath);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
    await fs.rm(folderPath, { force: true, recursive: true });
  }
});
