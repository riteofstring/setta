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

  await ensureAppReady(page);
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.evaluate(() =>
    localStorage.removeItem("setta.workspaceHistory.v2"),
  );
  await page.evaluate(() =>
    localStorage.removeItem("setta.workspaceHistoryHandoff.v2"),
  );
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.backendOriginOverride"),
  );
  await page.evaluate(() => sessionStorage.removeItem("setta.launcherOrigin"));
  await page.evaluate(() => localStorage.removeItem("setta.launcherOrigin"));
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
  await expect(modal.getByText(/Files Root Base/i)).toHaveCount(0);
  await expect(modal.getByText(/Files Root/i)).toHaveCount(0);
  await expect(
    modal.getByRole("combobox", { name: "Setta Files Location" }),
  ).toHaveValue("auto");
  await modal
    .getByRole("combobox", { name: "Setta Files Location" })
    .selectOption("auto");
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

  await modal
    .getByPlaceholder("/path/to/workspace")
    .fill("/path/does/not/exist");
  await modal.getByRole("button", { name: "Launch" }).click();
  await page.waitForURL("**/launching");
  await expect(page.getByText("Workspace root does not exist")).toBeVisible();
  await expect(page.getByTestId("workspace-launch-spinner")).toHaveText("!");
  await page.getByRole("button", { name: "Back to Switcher" }).click();

  const modalAfterError = page.getByRole("dialog");
  await expect(modalAfterError.getByText("Switch Workspace")).toBeVisible();

  await expect(
    modalAfterError.getByRole("combobox", { name: "Setta Files Location" }),
  ).toHaveValue("auto");
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
  expect(requestBody.settaFilesLocation).toBe("auto");
  await page.waitForSelector(".react-flow__pane");
  await page.waitForFunction(
    (origin) =>
      sessionStorage.getItem("setta.backendOriginOverride") === origin,
    expectedBackendOrigin,
  );
  const backendOrigin = await page.evaluate(async () => {
    const { C_ADDRESSES } = await import("/src/utils/c_addresses");
    return C_ADDRESSES.BACKEND_ORIGIN;
  });
  expect(backendOrigin).toBe(expectedBackendOrigin);

  await page.waitForFunction(
    (root) =>
      (localStorage.getItem("setta.workspaceHistory.v2") ?? "").includes(root),
    canonicalWorkspaceRoot,
  );

  const storedHistory = await page.evaluate(() => {
    const raw = localStorage.getItem("setta.workspaceHistory.v2");
    return raw ? (JSON.parse(raw) as unknown) : null;
  });
  expect(storedHistory).not.toBeNull();
  expect(Array.isArray(storedHistory)).toBe(true);
  const firstEntry = (storedHistory as Array<Record<string, unknown>>)[0];
  expect(firstEntry).toMatchObject({
    workspaceRoot: canonicalWorkspaceRoot,
    settaFilesLocation: "auto",
  });

  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();
  const modalAfterSuccess = page.getByRole("dialog");
  await expect(modalAfterSuccess.getByText("Switch Workspace")).toBeVisible();
  await expect(modalAfterSuccess.getByText("Setta files: auto")).toBeVisible();
});

test("workspace switcher allows selecting setta files location", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Switch Workspace")).toBeVisible();

  const location = modal.getByRole("combobox", {
    name: "Setta Files Location",
  });
  await expect(location).toHaveValue("auto");
  await location.selectOption("local");
  await expect(location).toHaveValue("local");
  await location.selectOption("global");
  await expect(location).toHaveValue("global");
  await location.selectOption("auto");
  await expect(location).toHaveValue("auto");

  await modal.getByRole("button", { name: "Cancel" }).click();
});

test("workspace switcher sends local setta files location", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for workspace switcher test.",
    );
  }
  const missingWorkspace = `${workspaceRoot}/does-not-exist-${Date.now()}`;

  await ensureAppReady(page);
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Switch Workspace")).toBeVisible();

  await modal
    .getByRole("combobox", { name: "Setta Files Location" })
    .selectOption("local");
  await modal.getByPlaceholder("/path/to/workspace").fill(missingWorkspace);

  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/launch";
  });
  await modal.getByRole("button", { name: "Launch" }).click();

  await page.waitForURL("**/launching");
  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(requestBody.settaFilesLocation).toBe("local");
  await expect(page.getByText("Workspace root does not exist")).toBeVisible();
});

test("workspace launch URL handoff overrides stale sessionStorage", async ({
  page,
}) => {
  await ensureAppReady(page);

  await page.evaluate(() => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request: { workspaceRoot: "/tmp/stale" },
        returnUrl: window.location.href,
        requestedAt: 111,
      }),
    );
  });

  const encoded = await page.evaluate(async () => {
    const { encodePendingWorkspaceLaunchForUrlHash } = await import(
      "/src/utils/workspaceSwitcherLaunch"
    );
    return encodePendingWorkspaceLaunchForUrlHash({
      request: { workspaceRoot: "/tmp/fresh" },
      returnUrl: window.location.href,
      requestedAt: 222,
    });
  });
  if (!encoded) {
    throw new Error("Failed to encode pending workspace launch payload.");
  }

  await page.route("**/api/launch", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Intentional failure for handoff test." },
      }),
    });
  });

  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/launch";
  });

  const nextUrl = new URL(page.url());
  nextUrl.pathname = "/launching";
  nextUrl.hash = `#pl=${encoded}`;
  await page.goto(nextUrl.toString(), { waitUntil: "domcontentloaded" });

  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(requestBody.workspaceRoot).toBe("/tmp/fresh");
  expect(page.url()).not.toContain("pl=");
});

test("workspace switcher can connect via ssh and reload", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for workspace switcher test.",
    );
  }
  const expectedLauncherOrigin = process.env.SETTA_BACKEND_ORIGIN;
  if (!expectedLauncherOrigin) {
    throw new Error(
      "Missing SETTA_BACKEND_ORIGIN for workspace switcher test.",
    );
  }
  const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);
  const requestedLocalPort = await pickFreeLocalPort();

  await ensureAppReady(page);
  await page.evaluate(() =>
    localStorage.removeItem("setta.workspaceHistory.v2"),
  );
  await page.evaluate(() =>
    localStorage.removeItem("setta.workspaceHistoryHandoff.v2"),
  );
  await page.evaluate(() =>
    sessionStorage.removeItem("setta.backendOriginOverride"),
  );
  await page.evaluate(() => sessionStorage.removeItem("setta.launcherOrigin"));
  await page.evaluate(() => localStorage.removeItem("setta.launcherOrigin"));
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
  await modal
    .getByRole("combobox", { name: "Setta Files Location" })
    .selectOption("global");
  await modal.getByPlaceholder("61000").fill(String(requestedLocalPort));
  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      req.method() === "POST" &&
      url.pathname === "/api/launch" &&
      url.origin === expectedLauncherOrigin
    );
  });
  const bootstrapRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      url.hostname === "127.0.0.1" && url.pathname === "/__setta__/bootstrap"
    );
  });
  await modal.getByRole("button", { name: "Launch" }).click();
  await page.waitForURL("**/launching");

  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(requestBody.localPort).toBe(requestedLocalPort);
  expect(requestBody.settaFilesLocation).toBe("global");

  const bootstrapUrl = new URL((await bootstrapRequest).url());
  const connectedPort = Number(bootstrapUrl.port);
  expect(Number.isFinite(connectedPort)).toBe(true);
  expect(connectedPort).toBeGreaterThan(0);

  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(".react-flow__pane");
  const tunnelOrigin = `http://127.0.0.1:${connectedPort}`;
  await page.waitForFunction(
    (origin) =>
      sessionStorage.getItem("setta.backendOriginOverride") === origin,
    tunnelOrigin,
  );
  const { backendOrigin, launcherOrigin } = await page.evaluate(async () => {
    const { C_ADDRESSES } = await import("/src/utils/c_addresses");
    return {
      backendOrigin: C_ADDRESSES.BACKEND_ORIGIN,
      launcherOrigin: C_ADDRESSES.LAUNCHER_ORIGIN,
    };
  });
  expect(backendOrigin).toBe(tunnelOrigin);
  expect(launcherOrigin).toBe(expectedLauncherOrigin);

  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();
  const modalAfterReload = page.getByRole("dialog");
  await expect(modalAfterReload.getByText("Switch Workspace")).toBeVisible();
  await expect(
    modalAfterReload.getByText(canonicalWorkspaceRoot, { exact: true }),
  ).toBeVisible();
  await expect(modalAfterReload.getByText("SSH: user@host")).toBeVisible();
  await expect(modalAfterReload.getByText("Setta files: local")).toBeVisible();
  await expect(
    modalAfterReload.getByRole("combobox", { name: "Setta Files Location" }),
  ).toHaveValue("local");

  // Regression test: once we are "inside" an SSH session, launching again must
  // still send /api/launch to the original launcher backend (not the tunneled backend).
  const followupLaunchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      req.method() === "POST" &&
      url.pathname === "/api/launch" &&
      url.origin === expectedLauncherOrigin
    );
  });
  await modalAfterReload.getByPlaceholder("61000").fill("");
  await modalAfterReload
    .getByRole("combobox", { name: "Setta Files Location" })
    .selectOption("auto");
  await modalAfterReload.getByPlaceholder("user@host").fill("");
  await modalAfterReload
    .getByPlaceholder("/path/to/workspace")
    .fill("/path/does/not/exist");
  await modalAfterReload.getByRole("button", { name: "Launch" }).click();

  await page.waitForURL("**/launching");
  await followupLaunchRequest;
  await expect(page.getByText("Workspace root does not exist")).toBeVisible();
});
