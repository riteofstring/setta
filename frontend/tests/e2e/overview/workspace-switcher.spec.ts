import { expect, test } from "@playwright/test";
import net from "node:net";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
} from "../helpers";

async function pickFreeLocalPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Failed to resolve a free local port.")),
        );
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

test("workspace switcher launches a session and persists history", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for workspace switcher test.",
    );
  }

  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  try {
    await page.evaluate(() =>
      localStorage.removeItem("setta.workspaceHistory"),
    );
    await page.getByRole("menuitem", { name: "Project" }).click();
    await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal.getByText("Switch Workspace")).toBeVisible();

    await modal
      .getByPlaceholder("/path/to/workspace")
      .fill("/path/does/not/exist");
    await modal.getByRole("button", { name: "Launch" }).click();
    await expect(
      modal.getByText("Workspace root does not exist"),
    ).toBeVisible();

    await modal.getByPlaceholder("/path/to/workspace").fill(workspaceRoot);
    await modal.getByRole("button", { name: "Launch" }).click();

    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".react-flow__pane");

    await page.waitForFunction(
      (root) =>
        (localStorage.getItem("setta.workspaceHistory") ?? "").includes(root),
      workspaceRoot,
    );
  } finally {
    await cleanupIsolatedProject(page, context);
  }
});

test("workspace switcher can connect via ssh and reload", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for workspace switcher test.",
    );
  }
  const localPort = await pickFreeLocalPort();

  await ensureAppReady(page);
  await page.evaluate(() => localStorage.removeItem("setta.workspaceHistory"));
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Switch Workspace")).toBeVisible();

  await modal.getByPlaceholder("/path/to/workspace").fill(workspaceRoot);
  await modal.getByPlaceholder("user@host").fill("user@host");
  await modal.getByRole("button", { name: "Show" }).click();
  await modal.getByPlaceholder("61000").fill(String(localPort));
  const bootstrapRequest = page.waitForRequest((req) =>
    req.url().startsWith(`http://127.0.0.1:${localPort}/__setta__/bootstrap`),
  );
  await modal.getByRole("button", { name: "Launch" }).click();

  await bootstrapRequest;
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(".react-flow__pane");

  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();
  const modalAfterReload = page.getByRole("dialog");
  await expect(modalAfterReload.getByText("Switch Workspace")).toBeVisible();
  await expect(modalAfterReload.getByText(workspaceRoot)).toBeVisible();
  await expect(modalAfterReload.getByText("SSH: user@host")).toBeVisible();
});
