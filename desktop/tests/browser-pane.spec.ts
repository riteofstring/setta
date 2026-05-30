import { test, expect, _electron as electron } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { BrowserPaneSnapshot } from "../src/shared/types";

const desktopRoot = resolve(__dirname, "..");

interface TestWorkspace {
  displayName: string;
  id: string;
  lastOpenedAt: string;
  rootPath: string;
}

test("WebContentsView browser pane supports phase 1 automation", async () => {
  const userDataDir = realpathSync(mkdtempSync(join(tmpdir(), "setta-electron-user-data-")));
  const apiRoot = realpathSync(mkdtempSync(join(tmpdir(), "setta-workspace-api-")));
  const webRoot = realpathSync(mkdtempSync(join(tmpdir(), "setta-workspace-web-")));
  const electronApp = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(desktopRoot, "out/main/index.js")],
    cwd: desktopRoot,
    env: {
      ...process.env,
      SETTA_BACKEND_READY_TIMEOUT_MS: "20000",
    },
  });

  try {
    await expect(electronApp.evaluate(({ app }) => app.getPath("userData"))).resolves.toBe(
      userDataDir,
    );
    await electronApp.evaluate(
      ({ dialog }, workspacePaths) => {
        let index = 0;
        const openDialog = async () => {
          const selectedPath = workspacePaths[index];
          if (selectedPath === undefined) {
            throw new Error("no stubbed workspace path remains");
          }
          index += 1;
          return { canceled: false, filePaths: [selectedPath] };
        };
        dialog.showOpenDialog = openDialog as typeof dialog.showOpenDialog;
      },
      [apiRoot, webRoot],
    );

    const page = await electronApp.firstWindow();
    await page.waitForSelector('[data-testid="browser-pane-host"]');
    await page.waitForFunction(() => window.setta !== undefined);
    await expect(page.getByTestId("backend-status")).toContainText("Online", { timeout: 20000 });
    await expect(page.getByText("No workspace open")).toBeVisible();

    await page.getByRole("button", { name: "Open workspace folder" }).click();
    await expect(page.getByTestId("selected-workspace-path")).toContainText(apiRoot);
    await expect(page.getByTestId("active-workspace-list")).toContainText(apiRoot);

    await page.getByRole("button", { name: "Open workspace folder" }).click();
    await expect(page.getByTestId("selected-workspace-path")).toContainText(webRoot);
    await expect(page.getByTestId("active-workspace-list")).toContainText(apiRoot);
    await expect(page.getByTestId("active-workspace-list")).toContainText(webRoot);

    const apiWorkspace = page.getByTestId("active-workspace-item").filter({ hasText: apiRoot });
    await apiWorkspace.getByTestId("active-workspace-select").click();
    await expect(page.getByTestId("selected-workspace-path")).toContainText(apiRoot);
    await apiWorkspace.getByRole("button", { name: "Close workspace" }).click();
    await expect(page.getByTestId("selected-workspace-path")).toContainText(webRoot);
    await expect(page.getByTestId("active-workspace-list")).not.toContainText(apiRoot);
    await expect(page.getByTestId("recent-workspace-list")).toContainText(apiRoot);

    await page.evaluate(() => window.setta.browserPane.loadPreview());
    await page.evaluate(() => window.setta.browserPane.focus());

    const title = await page.evaluate(() => window.setta.browserPane.inspect("#preview-title"));
    expect(title).toMatchObject({
      documentHasFocus: true,
      tagName: "h1",
      text: "Setta Preview",
      title: "Setta Browser Preview",
    });

    const button = await page.evaluate(() => window.setta.browserPane.inspect("#preview-action"));
    const point = centerPoint(requireSnapshot(button).rect);
    await page.evaluate((clickPoint) => window.setta.browserPane.click(clickPoint), point);
    const clicked = await page.evaluate(() => window.setta.browserPane.inspect("#preview-action"));
    expect(clicked?.text).toBe("Click 1");

    const input = await page.evaluate(() => window.setta.browserPane.inspect("#preview-input"));
    await page.evaluate(
      (inputPoint) => window.setta.browserPane.click(inputPoint),
      centerPoint(requireSnapshot(input).rect),
    );
    await page.evaluate(() => window.setta.browserPane.typeText("smoke"));
    const typed = await page.evaluate(() => window.setta.browserPane.inspect("#preview-input"));
    expect(typed?.value).toBe("smoke");

    const screenshot = await page.evaluate(() => window.setta.browserPane.captureScreenshot());
    expect(screenshot.pngBytes).toBeGreaterThan(1000);
    expect(screenshot.width).toBeGreaterThan(100);
    expect(screenshot.height).toBeGreaterThan(100);

    const events = await page.evaluate(() => window.setta.browserPane.events());
    expect(events.console).toContain("preview-ready");
    expect(events.console).toContain("preview-clicked:1");
    expect(events.network.some((entry) => entry.includes("browser-preview.html 200"))).toBe(true);

    const beforeResize = await page.evaluate(() => window.setta.browserPane.status());
    await page.setViewportSize({ height: 700, width: 1000 });
    await page.waitForTimeout(100);
    const afterResize = await page.evaluate(() => window.setta.browserPane.status());
    expect(afterResize.bounds.width).not.toBe(beforeResize.bounds.width);
  } finally {
    await electronApp.close();
    rmSync(userDataDir, { force: true, recursive: true });
    rmSync(apiRoot, { force: true, recursive: true });
    rmSync(webRoot, { force: true, recursive: true });
  }
});

test("workspace lists virtualize large app state", async () => {
  const userDataDir = realpathSync(mkdtempSync(join(tmpdir(), "setta-electron-user-data-")));
  const workspaces = seedLargeAppState(userDataDir, 3000);
  const targetWorkspace = requireWorkspace(workspaces, workspaces.length - 1);
  const electronApp = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(desktopRoot, "out/main/index.js")],
    cwd: desktopRoot,
    env: {
      ...process.env,
      SETTA_BACKEND_READY_TIMEOUT_MS: "20000",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForSelector('[data-testid="active-workspace-item"]', { timeout: 20000 });
    await expect(page.getByTestId("backend-status")).toContainText("Online", { timeout: 20000 });
    await expect.poll(() => page.getByTestId("active-workspace-item").count()).toBeLessThan(80);
    await expect.poll(() => page.getByTestId("recent-workspace-item").count()).toBeLessThan(80);

    await scrollToEnd(page.getByTestId("recent-workspace-list"));
    await expect(page.getByTestId("recent-workspace-list")).toContainText(targetWorkspace.rootPath);

    await scrollToEnd(page.getByTestId("active-workspace-list"));
    const targetRow = page
      .getByTestId("active-workspace-item")
      .filter({ hasText: targetWorkspace.rootPath });
    await expect(targetRow).toBeVisible();
    await targetRow.getByTestId("active-workspace-select").click();
    await expect(page.getByTestId("selected-workspace-path")).toContainText(
      targetWorkspace.rootPath,
    );
    await expect.poll(() => page.getByTestId("active-workspace-item").count()).toBeLessThan(80);
  } finally {
    await electronApp.close();
    rmSync(userDataDir, { force: true, recursive: true });
  }
});

function centerPoint(rect: BrowserPaneSnapshot["rect"]) {
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}

function requireSnapshot(snapshot: BrowserPaneSnapshot | null) {
  if (!snapshot) {
    throw new Error("expected browser pane snapshot");
  }
  return snapshot;
}

function seedLargeAppState(userDataDir: string, count: number): TestWorkspace[] {
  mkdirSync(userDataDir, { recursive: true });
  const workspaces = Array.from({ length: count }, (_, index) => {
    const padded = String(index).padStart(5, "0");
    return {
      displayName: `Workspace ${padded}`,
      id: `workspace_${padded}`,
      lastOpenedAt: new Date(Date.UTC(2026, 4, 29, 20, 0, count - index)).toISOString(),
      rootPath: `/tmp/setta-large-workspace-${padded}`,
    };
  });
  const selectedWorkspace = requireWorkspace(workspaces, 0);
  writeFileSync(
    join(userDataDir, "app-state.json"),
    JSON.stringify(
      {
        activeWorkspaceIds: workspaces.map((workspace) => workspace.id),
        recentWorkspaces: workspaces,
        schemaVersion: 1,
        selectedWorkspaceId: selectedWorkspace.id,
      },
      null,
      2,
    ),
  );
  return workspaces;
}

function requireWorkspace(workspaces: TestWorkspace[], index: number): TestWorkspace {
  const workspace = workspaces[index];
  if (!workspace) {
    throw new Error(`expected workspace at index ${index}`);
  }
  return workspace;
}

async function scrollToEnd(locator: Locator) {
  await locator.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}
