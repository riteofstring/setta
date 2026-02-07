import { expect, test } from "@playwright/test";
import { cleanupIsolatedProject, ensureAppReady, openIsolatedProject } from "../helpers";

test("workspace switcher launches a session and persists history", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for workspace switcher test.");
  }

  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  try {
    await page.getByRole("menuitem", { name: "Project" }).click();
    await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal.getByText("Switch Workspace")).toBeVisible();

    await modal.getByPlaceholder("/path/to/workspace").fill(
      "/path/does/not/exist",
    );
    await modal.getByRole("button", { name: "Launch" }).click();
    await expect(modal.getByText("Workspace root does not exist")).toBeVisible();

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
