import { expect, test } from "@playwright/test";
import * as fs from "node:fs";
import net from "node:net";
import { ensureAppReady } from "../helpers";

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
  const initialWorkspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!initialWorkspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for workspace switcher test.",
    );
  }
  const expectedBackendOrigin = process.env.SETTA_BACKEND_ORIGIN;
  if (!expectedBackendOrigin) {
    throw new Error(
      "Missing SETTA_BACKEND_ORIGIN for workspace switcher test.",
    );
  }
  const canonicalWorkspaceRoot = fs.realpathSync(initialWorkspaceRoot);
  const filesRoot = `${initialWorkspaceRoot.replace(/\/+$/, "")}/setta_files`;
  const canonicalFilesRoot = fs.realpathSync(filesRoot);

  await ensureAppReady(page);
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.evaluate(() => localStorage.removeItem("setta.workspaceHistory"));
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.backendOriginOverride"),
  );
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.pendingWorkspaceLaunch"),
  );
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.workspaceSwitcherDraft"),
  );
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.openWorkspaceSwitcherOnLoad"),
  );
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Switch Workspace")).toBeVisible();

  await modal.getByRole("button", { name: "Show" }).click();
  await modal.getByPlaceholder("user@host").fill("user@host");
  const scrollInfo = await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    const scroll = dialog?.querySelector(".overflow-y-auto");
    if (!scroll) {
      return null;
    }
    const styles = getComputedStyle(scroll);
    return {
      overflowY: styles.overflowY,
      clientHeight: scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
    };
  });
  expect(scrollInfo).not.toBeNull();
  expect(scrollInfo?.overflowY).toBe("auto");
  expect(scrollInfo?.scrollHeight ?? 0).toBeGreaterThan(
    scrollInfo?.clientHeight ?? 0,
  );
  await modal.getByPlaceholder("user@host").fill("");

  await modal.getByPlaceholder("/path/to/setta_files").fill(filesRoot);
  await modal
    .getByPlaceholder("/path/to/workspace")
    .fill("/path/does/not/exist");
  await modal.getByRole("button", { name: "Launch" }).click();
  await page.waitForURL("**/launching");
  await expect(page.getByText("Workspace root does not exist")).toBeVisible();
  await page.getByRole("button", { name: "Back to Switcher" }).click();

  const modalAfterError = page.getByRole("dialog");
  await expect(modalAfterError.getByText("Switch Workspace")).toBeVisible();

  await expect(
    modalAfterError.getByPlaceholder("/path/to/setta_files"),
  ).toHaveValue(filesRoot);
  await modalAfterError
    .getByPlaceholder("/path/to/workspace")
    .fill(initialWorkspaceRoot);

  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/launch";
  });
  await modalAfterError.getByRole("button", { name: "Launch" }).click();

  await page.waitForURL("**/launching");
  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(requestBody.filesRoot).toBe(filesRoot);
  expect(requestBody.filesRootBase).toBeNull();
  await page.waitForSelector(".react-flow__pane");
  await page.waitForFunction(
    (origin) => sessionStorage.getItem("setta.backendOriginOverride") === origin,
    expectedBackendOrigin,
  );
  const backendOrigin = await page.evaluate(async () => {
    const { C_ADDRESSES } = await import("/src/utils/c_addresses");
    return C_ADDRESSES.BACKEND_ORIGIN;
  });
  expect(backendOrigin).toBe(expectedBackendOrigin);

  await page.waitForFunction(
    (root) => (localStorage.getItem("setta.workspaceHistory") ?? "").includes(root),
    canonicalWorkspaceRoot,
  );

  const storedHistory = await page.evaluate(() => {
    const raw = localStorage.getItem("setta.workspaceHistory");
    return raw ? (JSON.parse(raw) as unknown) : null;
  });
  expect(storedHistory).not.toBeNull();
  expect(Array.isArray(storedHistory)).toBe(true);
  const firstEntry = (storedHistory as Array<Record<string, unknown>>)[0];
  expect(firstEntry).toMatchObject({
    workspaceRoot: canonicalWorkspaceRoot,
    filesRoot: canonicalFilesRoot,
    filesRootBase: null,
  });

  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();
  const modalAfterSuccess = page.getByRole("dialog");
  await expect(modalAfterSuccess.getByText("Switch Workspace")).toBeVisible();
  await expect(
    modalAfterSuccess.getByText(`Files root: ${canonicalFilesRoot}`),
  ).toBeVisible();
});

test("workspace switcher can connect via ssh and reload", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for workspace switcher test.",
    );
  }
  const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);
  const requestedLocalPort = await pickFreeLocalPort();
  const filesRootBase = `${workspaceRoot.replace(/\/+$/, "")}/setta_state_base`;

  await ensureAppReady(page);
  await page.evaluate(() => localStorage.removeItem("setta.workspaceHistory"));
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.pendingWorkspaceLaunch"),
  );
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.workspaceSwitcherDraft"),
  );
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.openWorkspaceSwitcherOnLoad"),
  );
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Switch Workspace")).toBeVisible();

  await modal.getByPlaceholder("/path/to/workspace").fill(workspaceRoot);
  await modal.getByPlaceholder("user@host").fill("user@host");
  await modal.getByRole("button", { name: "Show" }).click();
  await modal.getByPlaceholder("61000").fill(String(requestedLocalPort));
  await modal.getByPlaceholder("/path/to/setta_state").fill(filesRootBase);
  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/launch";
  });
  const bootstrapRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      url.hostname === "127.0.0.1" &&
      url.pathname === "/__setta__/bootstrap"
    );
  });
  await modal.getByRole("button", { name: "Launch" }).click();
  await page.waitForURL("**/launching");

  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(requestBody.localPort).toBe(requestedLocalPort);
  expect(requestBody.filesRoot).toBeNull();
  expect(requestBody.filesRootBase).toBe(filesRootBase);

  const bootstrapUrl = new URL((await bootstrapRequest).url());
  const connectedPort = Number(bootstrapUrl.port);
  expect(Number.isFinite(connectedPort)).toBe(true);
  expect(connectedPort).toBeGreaterThan(0);

  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(".react-flow__pane");
  await page.waitForFunction(
    (origin) => sessionStorage.getItem("setta.backendOriginOverride") === origin,
    `http://127.0.0.1:${connectedPort}`,
  );
  const backendOrigin = await page.evaluate(async () => {
    const { C_ADDRESSES } = await import("/src/utils/c_addresses");
    return C_ADDRESSES.BACKEND_ORIGIN;
  });
  expect(backendOrigin).toBe(`http://127.0.0.1:${connectedPort}`);

  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();
  const modalAfterReload = page.getByRole("dialog");
  await expect(modalAfterReload.getByText("Switch Workspace")).toBeVisible();
  await expect(
    modalAfterReload.getByText(canonicalWorkspaceRoot, { exact: true }),
  ).toBeVisible();
  await expect(modalAfterReload.getByText("SSH: user@host")).toBeVisible();
  await expect(
    modalAfterReload.getByText(`Files base: ${filesRootBase}`),
  ).toBeVisible();
  await expect(
    modalAfterReload.getByPlaceholder("/path/to/setta_state"),
  ).toHaveValue(filesRootBase);
});
