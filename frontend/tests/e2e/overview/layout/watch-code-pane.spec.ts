import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../../helpers";

type RootResponse = {
  rootPath?: string;
};

type WatchCodePluginProjectData = {
  files?: string[];
};

const WATCH_CODE_PLUGIN_ROOT = path.resolve(
  process.cwd(),
  "../plugins/setta-watch-code",
);

function getWatchCodePluginData(
  projectState: unknown,
): WatchCodePluginProjectData {
  if (!projectState || typeof projectState !== "object") {
    return {};
  }
  const pluginData = (projectState as { pluginData?: Record<string, unknown> })
    .pluginData;
  const watchCodeData = pluginData?.["setta-watch-code"];
  if (!watchCodeData || typeof watchCodeData !== "object") {
    return {};
  }
  return watchCodeData as WatchCodePluginProjectData;
}

async function linkWatchCodePlugin(page: Page): Promise<void> {
  await postBackend(page, "/plugins/link", {
    localPluginRoot: WATCH_CODE_PLUGIN_ROOT,
    scope: "workspace",
    enable: true,
    force: true,
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".react-flow__pane")).toBeVisible();
}

test("watch code settings open from controls portal with all options", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);
  await linkWatchCodePlugin(page);

  await expect(page.getByTestId("overview-tab-watch-code")).toHaveCount(0);

  const watchCodeSettingsButton = page.getByTestId("rf__watch-code-settings");
  await expect(watchCodeSettingsButton).toBeVisible();
  await watchCodeSettingsButton.click();

  const portal = page.getByTestId("rf__watch-code-settings-portal");
  await expect(portal).toBeVisible();
  await expect(
    portal.getByRole("heading", { name: "Watch Code" }),
  ).toBeVisible();

  const [buttonRect, portalRect] = await Promise.all([
    watchCodeSettingsButton.boundingBox(),
    portal.boundingBox(),
  ]);
  expect(buttonRect).not.toBeNull();
  expect(portalRect).not.toBeNull();
  if (buttonRect && portalRect) {
    // The portal should open close to the watch-code trigger button.
    expect(portalRect.y).toBeLessThan(buttonRect.y + 400);
  }

  await expect(
    portal.locator('[data-setting-anchor="plugin::setta-watch-code::folders"]'),
  ).toBeVisible();
  await expect(
    portal.locator('[data-setting-anchor="plugin::setta-watch-code::files"]'),
  ).toBeVisible();
});

test("watch code portal stays clamped after content grows post-open", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await page.route("**/plugins/*/watch-code/inputs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await ensureAppReady(page);
  await linkWatchCodePlugin(page);

  const watchCodeSettingsButton = page.getByTestId("rf__watch-code-settings");
  await watchCodeSettingsButton.click();

  const portal = page.getByTestId("rf__watch-code-settings-portal");
  await expect(portal).toBeVisible();

  const addFolderButton = portal.getByRole("button", { name: "Add Folder" });
  for (let index = 0; index < 8; index += 1) {
    await addFolderButton.click();
  }

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const portalRect = await portal.boundingBox();
  expect(portalRect).not.toBeNull();
  if (!viewport || !portalRect) {
    throw new Error("Expected watch code portal geometry after growth.");
  }

  expect(portalRect.y).toBeGreaterThanOrEqual(0);
  expect(portalRect.y + portalRect.height).toBeLessThanOrEqual(viewport.height);
});

test("watch code input controls disable while an input save is pending", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);
  await linkWatchCodePlugin(page);

  let releaseInputsRoute!: () => void;
  let resolveInputsRouteStarted!: () => void;
  const inputsRouteStarted = new Promise<void>((resolve) => {
    resolveInputsRouteStarted = resolve;
  });
  await page.route("**/plugins/*/watch-code/inputs", async (route) => {
    resolveInputsRouteStarted();
    await new Promise<void>((release) => {
      releaseInputsRoute = release;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.getByTestId("rf__watch-code-settings").click();
  const portal = page.getByTestId("rf__watch-code-settings-portal");
  await expect(portal).toBeVisible();
  await portal.getByRole("button", { name: "Add File" }).click();
  const fileInput = portal.getByPlaceholder("relative/path/to/file.py");
  await fileInput.fill("pending-save.py");
  await fileInput.press("Enter");
  await inputsRouteStarted;

  await expect(portal.getByPlaceholder("relative/path/to/file.py")).toBeDisabled();
  await expect(portal.getByRole("button", { name: "Add File" })).toBeDisabled();
  releaseInputsRoute();
  await expect(portal.getByPlaceholder("relative/path/to/file.py")).toBeEnabled();
});

test("watch code controls stay hidden in deployment mode", async ({ page }) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);
  await linkWatchCodePlugin(page);

  await page.evaluate(async () => {
    const { useShareSession } = await import("/src/state/definitions.ts");
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: null,
    });
  });

  await expect(page.getByTestId("rf__watch-code-settings")).toHaveCount(0);
  await expect(page.getByTestId("rf__watch-code-settings-portal")).toHaveCount(
    0,
  );
});

test("watch code file updates appear live and reload without crashing", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);
  await linkWatchCodePlugin(page);

  let projectContext: Awaited<ReturnType<typeof openIsolatedProject>> | null =
    null;
  let absoluteFilePath = "";

  try {
    projectContext = await openIsolatedProject(page);

    const root = await postBackend<RootResponse>(
      page,
      "/getFileBrowserRoot",
      null,
    );
    const rootPath = root?.rootPath;
    if (!rootPath) {
      throw new Error("Missing file browser root path.");
    }

    const relativeFilePath = "pw_watch_code_live.py";
    const moduleName = "pw_watch_code_live";
    const callableName = "pw_watch_code_live_sync";
    absoluteFilePath = path.join(rootPath, relativeFilePath);
    await fs.writeFile(absoluteFilePath, "", "utf-8");

    const watchCodeSettingsButton = page.getByTestId("rf__watch-code-settings");
    await watchCodeSettingsButton.click();

    const portal = page.getByTestId("rf__watch-code-settings-portal");
    await expect(portal).toBeVisible();

    await portal.getByRole("button", { name: "Add File" }).click();
    const fileInput = portal.getByPlaceholder("relative/path/to/file.py");
    await fileInput.fill(relativeFilePath);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response
            .url()
            .includes("/plugins/setta-watch-code/watch-code/inputs") &&
          response.request().method() === "POST" &&
          response.ok(),
      ),
      fileInput.press("Enter"),
    ]);
    await expect
      .poll(async () => {
        const projectState = await loadProjectConfig(page);
        return getWatchCodePluginData(projectState).files ?? [];
      })
      .toContain(relativeFilePath);

    await fs.writeFile(
      absoluteFilePath,
      `def ${callableName}(value: int):\n    return value\n`,
      "utf-8",
    );

    await expect
      .poll(
        async () => {
          const projectState = await loadProjectConfig(page);
          return Object.values(projectState.sections).filter(
            (section) => section.name === "Callable",
          ).length;
        },
        {
          timeout: 15000,
          message:
            "Expected Watch Code to create exactly one callable section.",
        },
      )
      .toBe(1);

    const projectState = await loadProjectConfig(page);
    const callableSectionEntry = Object.entries(projectState.sections).find(
      ([, section]) => section.name === "Callable",
    );
    if (!callableSectionEntry) {
      throw new Error("Missing Watch Code callable section in project state.");
    }
    const [callableSectionId] = callableSectionEntry;
    const callableNode = page.locator(
      `.react-flow__node[data-id="${callableSectionId}"]`,
    );

    await expect(callableNode).toBeVisible();
    await expect(callableNode).toContainText(callableName);
    await expect(
      page.getByText(`from ${moduleName} import ${callableName}`),
    ).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".react-flow__pane")).toBeVisible();
    await expect(page.getByText("Unhandled Thrown Error!")).toHaveCount(0);
    await expect(callableNode).toBeVisible();
    await expect(callableNode).toContainText(callableName);
  } finally {
    if (absoluteFilePath) {
      await fs.rm(absoluteFilePath, { force: true });
    }
    await cleanupIsolatedProject(page, projectContext);
  }
});
