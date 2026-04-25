import { expect, test } from "@playwright/test";
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
  enabled?: boolean;
  files?: string[];
};

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

test("watch code settings open from controls portal with all options", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByTestId("overview-tab-watch-code")).toHaveCount(0);

  const watchCodeSettingsButton = page.getByTestId("rf__watch-code-settings");
  await expect(watchCodeSettingsButton).toBeVisible();
  await watchCodeSettingsButton.click();

  const portal = page.getByTestId("rf__watch-code-settings-portal");
  await expect(portal).toBeVisible();
  await expect(
    portal.getByRole("heading", { name: "Watch Code" }),
  ).toBeVisible();
  const caret = page.getByTestId("rf__watch-code-settings-caret");
  await expect(caret).toBeVisible();

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

  const toggleButton = portal.getByRole("button", {
    name: /Enable Watch Code|Disable Watch Code/,
  });
  await expect(toggleButton).toBeVisible();
  const initialPressed = await toggleButton.getAttribute("aria-pressed");
  expect(initialPressed === "true" || initialPressed === "false").toBeTruthy();
  await toggleButton.click();
  if (initialPressed) {
    await expect(toggleButton).toHaveAttribute(
      "aria-pressed",
      initialPressed === "true" ? "false" : "true",
    );
  }
  await expect(
    portal.locator('[data-setting-anchor="plugin::setta-watch-code::enabled"]'),
  ).toBeVisible();
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
  await page.route("**/api/setWatchCodeInputs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await ensureAppReady(page);

  const watchCodeSettingsButton = page.getByTestId("rf__watch-code-settings");
  await watchCodeSettingsButton.click();

  const portal = page.getByTestId("rf__watch-code-settings-portal");
  const caret = page.getByTestId("rf__watch-code-settings-caret");
  await expect(portal).toBeVisible();
  await expect(caret).toBeVisible();

  const addFolderButton = portal.getByRole("button", { name: "Add Folder" });
  for (let index = 0; index < 8; index += 1) {
    await addFolderButton.click();
  }

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const [portalRect, caretRect] = await Promise.all([
    portal.boundingBox(),
    caret.boundingBox(),
  ]);
  expect(portalRect).not.toBeNull();
  expect(caretRect).not.toBeNull();
  if (!viewport || !portalRect || !caretRect) {
    throw new Error("Expected watch code portal geometry after growth.");
  }

  expect(portalRect.y).toBeGreaterThanOrEqual(0);
  expect(portalRect.y + portalRect.height).toBeLessThanOrEqual(viewport.height);
  expect(caretRect.y).toBeGreaterThanOrEqual(portalRect.y);
  expect(caretRect.y + caretRect.height).toBeLessThanOrEqual(
    portalRect.y + portalRect.height,
  );
});

test("watch code controls stay hidden in deployment mode", async ({ page }) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);

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
          response.url().includes("/api/setWatchCodeInputs") &&
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

    const toggleButton = portal.getByRole("button", {
      name: /Enable Watch Code|Disable Watch Code/,
    });
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/setWatchCodeEnabled") &&
          response.request().method() === "POST" &&
          response.ok(),
      ),
      toggleButton.click(),
    ]);
    await expect(toggleButton).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => {
        const projectState = await loadProjectConfig(page);
        return getWatchCodePluginData(projectState).enabled ?? false;
      })
      .toBe(true);

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
