import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureAppReady, postBackend, seedLocalStorage } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const HOME_URL = new URL("/home", BASE_URL).toString();

type ProjectMetadataResponse = {
  projectMetadata: Array<{ id: string; name: string }>;
};

async function createProjectConfigAndResolveId(page: Page) {
  const createdName = await postBackend<string>(page, "/createProjectConfig", {
    previewImgColor: "bg-indigo-500/60",
  });
  if (!createdName) {
    throw new Error("Missing project config name from /createProjectConfig.");
  }
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  const match = metadata?.projectMetadata.find(
    (entry) => entry.name === createdName,
  );
  if (!match) {
    throw new Error(`Unable to resolve project config id for ${createdName}.`);
  }
  return match.id;
}

async function readFavoriteProjectConfigIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("setta_data");
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as {
      state?: { favoriteProjectConfigIds?: string[] };
    };
    return parsed.state?.favoriteProjectConfigIds ?? [];
  });
}

test("home page renders pane rails and toggles side panes", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("home-file-manager-layout")).toBeVisible();
  await expect(page.getByTestId("home-left-icon-rail")).toBeVisible();
  await expect(page.getByTestId("home-right-icon-rail")).toBeVisible();
  await expect(page.getByTestId("home-left-rail-settings-link")).toBeVisible();
  await expect(page.getByTestId("home-compact-settings-link")).toHaveCount(0);
  await expect(
    page.getByTestId("home-left-rail-workspace-toggle"),
  ).toBeVisible();
  await expect(
    page.getByTestId("home-right-rail-selected-project-toggle"),
  ).toBeVisible();
  await expect(
    page.getByTestId("home-file-browser-column").first(),
  ).toBeVisible();
  await expect(page.getByTestId("home-project-gallery").first()).toBeVisible();
  await expect(
    page.getByTestId("home-selected-project-details").first(),
  ).toBeVisible();

  const galleryPane = page.getByTestId("home-project-gallery").first();
  const detailsPane = page.getByTestId("home-selected-project-details").first();
  const galleryBeforeResize = await galleryPane.boundingBox();
  const detailsBeforeResize = await detailsPane.boundingBox();
  if (!galleryBeforeResize || !detailsBeforeResize) {
    throw new Error(
      "Expected desktop home layout panes to have bounding boxes.",
    );
  }
  expect(galleryBeforeResize.width).toBeGreaterThan(420);

  const rightPaneToggle = page.getByTestId(
    "home-right-rail-selected-project-toggle",
  );
  await rightPaneToggle.click();
  await expect(page.getByTestId("home-selected-project-details")).toHaveCount(
    0,
  );
  await rightPaneToggle.click();
  await expect(
    page.getByTestId("home-selected-project-details").first(),
  ).toBeVisible();

  const leftPaneToggle = page.getByTestId("home-left-rail-workspace-toggle");
  await leftPaneToggle.click();
  await expect(page.getByTestId("home-file-browser-column")).toHaveCount(0);
  await leftPaneToggle.click();
  await expect(
    page.getByTestId("home-file-browser-column").first(),
  ).toBeVisible();

  const firstCard = page.getByTestId("home-project-card").first();
  await expect(firstCard).toBeVisible();
  const firstCardBox = await firstCard.boundingBox();
  if (!firstCardBox) {
    throw new Error("Expected the first home project card bounding box.");
  }
  expect(firstCardBox.width).toBeLessThan(240);
  const firstCardName = (
    await firstCard.locator("p").first().textContent()
  )?.trim();
  if (firstCardName) {
    await expect(
      page.getByTestId("home-selected-project-details").first(),
    ).toContainText(firstCardName);
  }

  await page.getByTestId("home-project-view-list").first().click();
  await expect(page.getByTestId("home-project-list").first()).toBeVisible();
  await expect(page.getByTestId("home-project-list-row").first()).toBeVisible();
  await page.getByTestId("home-project-view-thumbnails").first().click();
  await expect(page.getByTestId("home-project-card").first()).toBeVisible();

  const favoriteToggle = page
    .getByTestId("home-project-favorite-toggle")
    .first();
  const defaultToggle = page.getByTestId("home-project-default-toggle").first();
  await firstCard.hover();
  await expect(favoriteToggle).toBeVisible();
  await expect(defaultToggle).toBeVisible();
  await favoriteToggle.click();
  await expect(
    page.getByTestId("home-project-favourites-section").first(),
  ).toBeVisible();
  await expect(page.getByText("Other Projects")).toBeVisible();
});

test("home uses compact layout on narrow viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  const layout = page.getByTestId("home-file-manager-layout").first();
  const gallery = page.getByTestId("home-project-gallery").first();
  await expect(layout).toBeVisible();
  await expect(gallery).toBeVisible();
  await expect(page.getByTestId("home-left-icon-rail")).toHaveCount(0);
  await expect(page.getByTestId("home-right-icon-rail")).toHaveCount(0);
  await expect(page.getByTestId("home-file-browser-column")).toHaveCount(0);
  await expect(page.getByTestId("home-selected-project-details")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("home-compact-settings-link")).toBeVisible();

  const layoutBox = await layout.boundingBox();
  const galleryBox = await gallery.boundingBox();
  if (!layoutBox || !galleryBox) {
    throw new Error(
      "Expected compact home layout geometry on mobile viewport.",
    );
  }
  expect(galleryBox.width).toBeGreaterThan(layoutBox.width * 0.8);
});

test("home browser marks Setta-initialized folders", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for home browser test.");
  }

  const tempRoot = await fs.mkdtemp(
    path.join(workspaceRoot, "setta-home-browser-"),
  );
  const initializedFolder = path.join(tempRoot, "initialized-folder");
  const nestedFolder = path.join(initializedFolder, "nested-folder");
  const plainFolder = path.join(tempRoot, "plain-folder");
  await fs.mkdir(path.join(initializedFolder, "setta_files"), {
    recursive: true,
  });
  await fs.mkdir(nestedFolder, { recursive: true });
  await fs.writeFile(path.join(nestedFolder, "readme.txt"), "hello");
  await fs.mkdir(plainFolder, { recursive: true });

  try {
    await ensureAppReady(page);
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

    const pathInput = page.getByTestId("home-file-browser-path-input").first();
    await expect(pathInput).toBeVisible();
    await pathInput.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(tempRoot);
    await page.getByRole("button", { name: "Go" }).first().click();

    const initializedRow = page
      .getByTestId("file-browser-row")
      .filter({ hasText: "initialized-folder" })
      .first();
    const nestedRow = page
      .getByTestId("file-browser-row")
      .filter({ hasText: "nested-folder" })
      .first();
    const plainRow = page
      .getByTestId("file-browser-row")
      .filter({ hasText: "plain-folder" })
      .first();

    await expect(initializedRow).toBeVisible();
    await expect(plainRow).toBeVisible();
    await expect(
      initializedRow.getByTestId("setta-initialized-folder-icon"),
    ).toBeVisible();
    await expect(
      plainRow.getByTestId("setta-initialized-folder-icon"),
    ).toHaveCount(0);
    await expect(plainRow.getByTestId("setta-initialized-badge")).toHaveCount(
      0,
    );
    await expect(
      initializedRow.getByTestId("setta-initialized-badge"),
    ).toHaveCount(0);
    await initializedRow.getByLabel("Expand folder").click();
    await expect(nestedRow).toBeVisible();
    await nestedRow.click();
    await expect(nestedRow).toHaveClass(/bg-blue-50/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("home project items select on single click and open on double click", async ({
  page,
}) => {
  const createdProjectIds: string[] = [];
  try {
    await ensureAppReady(page);
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

    const firstCard = page.getByTestId("home-project-card").first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page).toHaveURL(HOME_URL);

    const cardCursor = await firstCard.evaluate(
      (el) => window.getComputedStyle(el).cursor,
    );
    expect(cardCursor).not.toBe("pointer");

    const firstCardSurface = firstCard.locator('[tabindex="0"]').first();
    await expect(firstCardSurface).toBeVisible();
    await firstCardSurface.focus();
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(HOME_URL);

    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
    await expect(firstCard).toBeVisible();
    await firstCard.dblclick();
    await expect(page).not.toHaveURL(HOME_URL);

    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
    await page.getByTestId("home-project-view-list").first().click();
    if ((await page.getByTestId("home-project-list-row").count()) < 2) {
      createdProjectIds.push(await createProjectConfigAndResolveId(page));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByTestId("home-project-view-list").first().click();
    }
    const firstRow = page.getByTestId("home-project-list-row").first();
    const secondRow = page.getByTestId("home-project-list-row").nth(1);
    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();
    await firstRow.click();
    const detailsPanel = page
      .getByTestId("home-selected-project-details")
      .first();
    const firstRowName = (await firstRow.locator("span").first().textContent())
      ?.trim()
      .replace(/\s+/g, " ");
    const primaryRow = firstRowName
      ? page
          .getByTestId("home-project-list-row")
          .filter({ hasText: firstRowName })
          .first()
      : firstRow;
    if (firstRowName) {
      await expect(detailsPanel).toContainText(firstRowName);
    }
    await expect(page).toHaveURL(HOME_URL);

    const listRowCursor = await firstRow.evaluate(
      (el) => window.getComputedStyle(el).cursor,
    );
    expect(listRowCursor).not.toBe("pointer");

    const secondRowFavoriteToggle = secondRow
      .getByTestId("home-project-favorite-toggle")
      .first();
    const secondRowDefaultToggle = secondRow
      .getByTestId("home-project-default-toggle")
      .first();
    await expect(secondRowFavoriteToggle).toBeVisible();
    await expect(secondRowDefaultToggle).toBeVisible();
    await secondRowFavoriteToggle.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(HOME_URL);
    if (firstRowName) {
      await expect(detailsPanel).toContainText(firstRowName);
    }

    await secondRowDefaultToggle.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(HOME_URL);
    if (firstRowName) {
      await expect(detailsPanel).toContainText(firstRowName);
    }

    await primaryRow.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(HOME_URL);
    if (firstRowName) {
      await expect(detailsPanel).toContainText(firstRowName);
    }

    await secondRow.focus();
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(HOME_URL);
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
    await page.getByTestId("home-project-view-list").first().click();
    await expect(primaryRow).toBeVisible();

    await primaryRow.dblclick();
    await expect(page).not.toHaveURL(HOME_URL);
  } finally {
    if (createdProjectIds.length > 0) {
      await postBackend(page, "/deleteProjectConfigs", {
        ids: createdProjectIds,
      });
    }
  }
});

test("home keeps valid favorites after initial metadata load and prunes stale ids", async ({
  page,
}) => {
  await ensureAppReady(page);
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  const validFavoriteId = metadata.projectMetadata[0]?.id;
  if (!validFavoriteId) {
    throw new Error("Expected at least one project config for favorites test.");
  }

  await seedLocalStorage(page, {
    favoriteProjectConfigIds: [validFavoriteId, "stale-favorite-id"],
  });
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("home-project-card").first()).toBeVisible();

  await expect
    .poll(() => readFavoriteProjectConfigIds(page))
    .toEqual([validFavoriteId]);
});

test("home keeps favorites unchanged when initial metadata load fails", async ({
  page,
}) => {
  await ensureAppReady(page);
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  const validFavoriteId = metadata.projectMetadata[0]?.id;
  if (!validFavoriteId) {
    throw new Error("Expected at least one project config for favorites test.");
  }

  await seedLocalStorage(page, {
    favoriteProjectConfigIds: [validFavoriteId, "stale-favorite-id"],
  });
  await page.route("**/loadAllProjectMetadata", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "temporary failure" }),
    });
  });
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect
    .poll(() => readFavoriteProjectConfigIds(page))
    .toEqual([validFavoriteId, "stale-favorite-id"]);
  await page.unroute("**/loadAllProjectMetadata");
});

test("home opens projects on single click in deployment mode", async ({
  page,
}) => {
  const homePathname = new URL(HOME_URL).pathname;
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await page.evaluate(async () => {
    const { useShareSession } = await import("/src/state/definitions.ts");
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: null,
    });
  });
  await expect(page.getByText("Sharing mode is read-only")).toBeVisible();
  await expect(page.getByTestId("home-left-rail-settings-link")).toHaveCount(0);

  await page.getByTestId("home-project-card").first().click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(homePathname);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { useShareSession } = await import("/src/state/definitions.ts");
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: null,
    });
  });
  await expect(page.getByText("Sharing mode is read-only")).toBeVisible();

  await page.getByTestId("home-project-view-list").first().click();
  const firstRow = page.getByTestId("home-project-list-row").first();
  await expect(firstRow).toBeVisible();
  await firstRow.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(homePathname);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { useShareSession } = await import("/src/state/definitions.ts");
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: null,
    });
  });
  await expect(page.getByText("Sharing mode is read-only")).toBeVisible();
  await page.getByTestId("home-project-view-list").first().click();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(homePathname);
});

test("home path blur is a no-op when the path value is unchanged", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const { useHomeFileBrowserState } = await import(
          "/src/state/definitions.ts"
        );
        return useHomeFileBrowserState.getState().rootPath;
      });
    })
    .not.toBeNull();

  const stateBeforeBlur = await page.evaluate(async () => {
    const { useHomeFileBrowserState } = await import(
      "/src/state/definitions.ts"
    );
    const current = useHomeFileBrowserState.getState();
    const rootPath = current.rootPath;
    if (!rootPath) {
      throw new Error("Missing home root path before blur no-op test.");
    }
    const separator = current.pathSeparator || "/";
    const selectedPath = `${rootPath}${separator}synthetic-selected-folder`;
    useHomeFileBrowserState.setState({
      selectedPath,
      expandedPaths: {
        [rootPath]: true,
        [selectedPath]: true,
      },
    });
    return {
      rootPath,
      selectedPath,
      expandedPaths: [rootPath, selectedPath],
    };
  });

  const pathInput = page.getByTestId("home-file-browser-path-input").first();
  await expect(pathInput).toBeVisible();
  await pathInput.click();
  await page.getByTestId("home-project-gallery").first().click();

  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const { useHomeFileBrowserState } = await import(
          "/src/state/definitions.ts"
        );
        const current = useHomeFileBrowserState.getState();
        return {
          rootPath: current.rootPath,
          selectedPath: current.selectedPath,
          expandedPaths: Object.keys(current.expandedPaths).sort(),
        };
      });
    })
    .toEqual({
      rootPath: stateBeforeBlur.rootPath,
      selectedPath: stateBeforeBlur.selectedPath,
      expandedPaths: [...stateBeforeBlur.expandedPaths].sort(),
    });
});

test("home path Escape cancels pending edits", async ({ page }) => {
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const { useHomeFileBrowserState } = await import(
          "/src/state/definitions.ts"
        );
        return useHomeFileBrowserState.getState().rootPath;
      });
    })
    .not.toBeNull();
  const rootPath = await page.evaluate(async () => {
    const { useHomeFileBrowserState } = await import(
      "/src/state/definitions.ts"
    );
    return useHomeFileBrowserState.getState().rootPath;
  });
  if (!rootPath) {
    throw new Error("Missing initial home root path before Escape test.");
  }

  const pathInput = page.getByTestId("home-file-browser-path-input").first();
  await expect(pathInput).toBeVisible();
  await pathInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("/tmp");
  await page.keyboard.press("Escape");

  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const { useHomeFileBrowserState } = await import(
          "/src/state/definitions.ts"
        );
        return useHomeFileBrowserState.getState().rootPath;
      });
    })
    .toBe(rootPath);
  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const { useHomeFileBrowserState } = await import(
          "/src/state/definitions.ts"
        );
        return useHomeFileBrowserState.getState().selectedPath;
      });
    })
    .not.toBe("/tmp");
});

test("home column widths persist across reload when viewport can fit stored widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2200, height: 1200 });
  await seedLocalStorage(page, {
    homeWorkspacePaneVis: true,
    homeWorkspacePaneWidth: 520,
    homeSelectedProjectPaneVis: true,
    homeSelectedProjectPaneWidth: 540,
  });

  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  const leftPane = page.getByTestId("home-file-browser-column").first();
  const rightPane = page.getByTestId("home-selected-project-details").first();
  await expect(leftPane).toBeVisible();
  await expect(rightPane).toBeVisible();

  const leftBefore = await leftPane.boundingBox();
  const rightBefore = await rightPane.boundingBox();
  if (!leftBefore || !rightBefore) {
    throw new Error("Missing initial pane geometry on Home page.");
  }
  expect(leftBefore.width).toBeGreaterThan(430);
  expect(rightBefore.width).toBeGreaterThan(450);

  await page.reload({ waitUntil: "domcontentloaded" });

  const leftAfter = await leftPane.boundingBox();
  const rightAfter = await rightPane.boundingBox();
  if (!leftAfter || !rightAfter) {
    throw new Error("Missing post-reload pane geometry on Home page.");
  }
  expect(leftAfter.width).toBeGreaterThan(430);
  expect(rightAfter.width).toBeGreaterThan(450);
  expect(Math.abs(leftAfter.width - leftBefore.width)).toBeLessThan(10);
  expect(Math.abs(rightAfter.width - rightBefore.width)).toBeLessThan(10);
});
