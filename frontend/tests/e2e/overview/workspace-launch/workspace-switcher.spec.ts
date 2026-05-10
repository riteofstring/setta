import { expect, test, type Page } from "@playwright/test";
import net from "node:net";
import * as path from "node:path";
import { ensureAppReady } from "../../helpers";

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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createRouteGate(): { wait: Promise<void>; release: () => void } {
  let gateRelease: (() => void) | null = null;
  const wait = new Promise<void>((resolve) => {
    gateRelease = resolve;
  });
  return {
    wait,
    release: () => {
      if (gateRelease) {
        gateRelease();
      }
    },
  };
}

function buildWorkspaceLaunchIntentHash({
  launchIntentToken,
  requestedAt,
}: {
  launchIntentToken: string;
  requestedAt: number;
}): string {
  const params = new URLSearchParams();
  params.set("plt", launchIntentToken);
  params.set("pla", String(requestedAt));
  return params.toString();
}

async function createWorkspaceLaunchIntentToken({
  page,
  launchRequest,
}: {
  page: Page;
  launchRequest: Record<string, unknown>;
}): Promise<{ launchIntentToken: string; requestedAt: number }> {
  const createIntentResponse = await page.evaluate(
    async (payload: {
      launchRequest: Record<string, unknown>;
      returnUrl: string;
    }) => {
      const { createWorkspaceLaunchIntent } = await import("/src/openapi/http");
      const { callOpenAPI } = await import("/tests/e2e/browserAppSubsystemSdk.ts");
      return await callOpenAPI(
        createWorkspaceLaunchIntent({
          body: payload,
        }),
      );
    },
    {
      launchRequest,
      returnUrl: page.url(),
    },
  );
  expect(createIntentResponse.status).toBe(200);
  const payload = createIntentResponse.data as {
    ok?: boolean;
    launchIntentToken?: string | null;
    requestedAt?: number | null;
  };
  expect(payload.ok).toBe(true);
  expect(typeof payload.launchIntentToken).toBe("string");
  return {
    launchIntentToken: payload.launchIntentToken as string,
    requestedAt:
      typeof payload.requestedAt === "number"
        ? payload.requestedAt
        : Date.now(),
  };
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
  const expectedWorkspaceRoot = path.resolve(initialWorkspaceRoot);

  await ensureAppReady(page);
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.evaluate(() => localStorage.removeItem("setta.workspaceHistory"));
  await page.evaluate(() =>
    localStorage.removeItem("setta.workspaceHistoryHandoff"),
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

  const createLaunchIntentRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      req.method() === "POST" &&
      url.pathname === "/api/createWorkspaceLaunchIntent"
    );
  });
  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/launch";
  });
  await modalAfterError.getByRole("button", { name: "Launch" }).click();

  const capturedCreateLaunchIntentRequest = await createLaunchIntentRequest;
  const createLaunchIntentBody =
    capturedCreateLaunchIntentRequest.postDataJSON() as {
      launchRequest?: Record<string, unknown>;
    };
  expect(createLaunchIntentBody.launchRequest?.settaFilesLocation).toBe("auto");

  const capturedLaunchRequest = await launchRequest;
  const launchResponse = await capturedLaunchRequest.response();
  expect(launchResponse?.ok()).toBe(true);
  const requestBody = capturedLaunchRequest.postDataJSON() as Record<
    string,
    unknown
  >;
  expect(typeof requestBody.launchIntentToken).toBe("string");
  expect(requestBody.workspaceRoot).toBeUndefined();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForSelector(".react-flow__pane");
  await page.waitForFunction(
    (origin) =>
      sessionStorage.getItem("setta.backendOriginOverride") === origin,
    expectedBackendOrigin,
  );
  const backendOrigin = await page.evaluate(async () => {
    const { C_ADDRESSES } = await import("/tests/e2e/browserAppSubsystemSdk.ts");
    return C_ADDRESSES.BACKEND_ORIGIN;
  });
  expect(backendOrigin).toBe(expectedBackendOrigin);
  await page.waitForFunction(
    (root) =>
      (localStorage.getItem("setta.workspaceHistory") ?? "").includes(root),
    expectedWorkspaceRoot,
  );

  const storedHistory = await page.evaluate(() => {
    const raw = localStorage.getItem("setta.workspaceHistory");
    return raw ? (JSON.parse(raw) as unknown) : null;
  });
  expect(storedHistory).not.toBeNull();
  expect(Array.isArray(storedHistory)).toBe(true);
  const firstEntry = (storedHistory as Array<Record<string, unknown>>)[0];
  expect(firstEntry).toMatchObject({
    workspaceRoot: expectedWorkspaceRoot,
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

test("workspace switcher can update Setta from launcher controls", async ({
  page,
}) => {
  const expectedBackendOrigin = process.env.SETTA_BACKEND_ORIGIN;
  if (!expectedBackendOrigin) {
    throw new Error(
      "Missing SETTA_BACKEND_ORIGIN for workspace switcher update test.",
    );
  }
  const scopedSettaHome = "/tmp/workspace-switcher-scope";

  await ensureAppReady(page);

  await page.route("**/api/settaHomeInfo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        settaHome: scopedSettaHome,
        globalSettaFilesBase: `${scopedSettaHome}/setta_files`,
        activeSettaFilesLocation: "global",
        llmConfigPath: `${scopedSettaHome}/setta_files/llm_config.json`,
      }),
    });
  });
  await page.route("**/api/launcherStatus**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        installed: true,
        channel: "uv-tool",
        updateCapability: "in_app",
        updateGuidance: null,
        targetCommand: ["/tmp/venv/bin/python", "-m", "setta"],
        managedArtifacts: {},
        existingManagedArtifacts: [],
        missingManagedArtifacts: [],
      }),
    });
  });
  await page.route("**/api/updateLauncher", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        installed: true,
        channel: "uv-tool",
        updateCapability: "in_app",
        updateGuidance: null,
        targetCommand: ["/tmp/venv/bin/python", "-m", "setta"],
        managedArtifacts: {},
        existingManagedArtifacts: [],
        missingManagedArtifacts: [],
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
      }),
    });
  });

  await page.getByRole("menuitem", { name: "Project" }).click();
  const settaHomeInfoRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "GET" && url.pathname === "/api/settaHomeInfo";
  });
  const launcherStatusRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "GET" && url.pathname === "/api/launcherStatus";
  });
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

  const capturedSettaHomeInfoRequest = await settaHomeInfoRequest;
  expect(new URL(capturedSettaHomeInfoRequest.url()).origin).toBe(
    expectedBackendOrigin,
  );
  const capturedLauncherStatusRequest = await launcherStatusRequest;
  expect(
    new URL(capturedLauncherStatusRequest.url()).searchParams.get("setta_home"),
  ).toBe(scopedSettaHome);

  const modal = page.getByRole("dialog");
  await expect(
    modal.getByText("Desktop Launcher", { exact: true }),
  ).toBeVisible();
  const updateButton = modal.getByRole("button", { name: "Update Setta" });
  await expect(updateButton).toBeEnabled();

  const updateRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/updateLauncher";
  });
  await updateButton.click();

  const request = await updateRequest;
  expect(request.postDataJSON()).toEqual({ settaHome: scopedSettaHome });
  await expect(modal.getByText("Setta updated: 1.0.0 -> 1.1.0")).toBeVisible();
});

test("workspace switcher keeps settaHomeInfo on backend origin when launcher origin differs", async ({
  page,
}) => {
  const settaHome = process.env.SETTA_HOME;
  if (!settaHome) {
    throw new Error(
      "Missing SETTA_HOME for workspace switcher global path test.",
    );
  }
  const expectedBackendOrigin = process.env.SETTA_BACKEND_ORIGIN;
  if (!expectedBackendOrigin) {
    throw new Error(
      "Missing SETTA_BACKEND_ORIGIN for workspace switcher global path test.",
    );
  }
  const expectedGlobalBase = path.join(settaHome, "setta_files");

  await ensureAppReady(page);

  // Force launcher origin to a different runtime. settaHomeInfo must still
  // resolve from the active backend origin in IDE mode.
  await page.evaluate(() => {
    localStorage.setItem("setta.launcherOrigin", "http://127.0.0.1:65534");
    sessionStorage.setItem("setta.launcherOrigin", "http://127.0.0.1:65534");
  });

  await page.getByRole("menuitem", { name: "Project" }).click();
  const settaHomeInfoRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "GET" && url.pathname === "/api/settaHomeInfo";
  });
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();

  const capturedSettaHomeInfoRequest = await settaHomeInfoRequest;
  expect(new URL(capturedSettaHomeInfoRequest.url()).origin).toBe(
    expectedBackendOrigin,
  );

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Switch Workspace")).toBeVisible();

  const globalOption = modal.locator("option[value='global']");
  await expect(globalOption).toContainText(expectedGlobalBase);
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

  const createLaunchIntentRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      req.method() === "POST" &&
      url.pathname === "/api/createWorkspaceLaunchIntent"
    );
  });
  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/launch";
  });
  await modal.getByRole("button", { name: "Launch" }).click();

  await page.waitForURL("**/launching");
  const createIntentBody = (await createLaunchIntentRequest).postDataJSON() as {
    launchRequest?: Record<string, unknown>;
  };
  expect(createIntentBody.launchRequest?.settaFilesLocation).toBe("local");
  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(typeof requestBody.launchIntentToken).toBe("string");
  expect(requestBody.workspaceRoot).toBeUndefined();
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

  const hash = buildWorkspaceLaunchIntentHash({
    launchIntentToken: "fresh-intent-token",
    requestedAt: 222,
  });

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
  nextUrl.hash = hash;
  await page.goto(nextUrl.toString(), { waitUntil: "domcontentloaded" });

  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(requestBody.launchIntentToken).toBe("fresh-intent-token");
  expect(page.url()).not.toContain("plt=");
});

test("workspace launch ignores forged plr hash values on error back-navigation", async ({
  page,
}) => {
  await ensureAppReady(page);

  await page.route("**/api/launch", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Intentional failure for forged plr test." },
      }),
    });
  });

  const nextUrl = new URL(page.url());
  nextUrl.pathname = "/launching";
  nextUrl.hash =
    "plt=fresh-intent-token&plr=aHR0cHM6Ly9ldmlsLmV4YW1wbGUvcGhpc2g&pla=222";
  await page.goto(nextUrl.toString(), { waitUntil: "domcontentloaded" });

  await expect(
    page.getByText("Intentional failure for forged plr test."),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/evil\.example/);

  await page.getByRole("button", { name: "Back to Switcher" }).click();
  await expect(page).toHaveURL(/\/home(?:\?|#|$)/);
  await expect(page).not.toHaveURL(/evil\.example/);
});

test("workspace launch error view does not render retry action", async ({
  page,
}) => {
  await ensureAppReady(page);

  await page.route("**/api/launch", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Intentional failure for retry action test." },
      }),
    });
  });

  await page.evaluate(() => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request: { launchIntentToken: "fresh-intent-token" },
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  });
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByText("Intentional failure for retry action test."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to Switcher" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("workspace launch maps typed outdated-settings errors to migration guidance", async ({
  page,
}) => {
  await ensureAppReady(page);

  await page.route("**/api/launch", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "OutdatedProjectSettings",
          message:
            'File "/tmp/site-packages/setta/project_state/settings_project.py"',
        },
      }),
    });
  });

  await page.evaluate(() => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request: { launchIntentToken: "outdated-settings-intent-token" },
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  });
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByText(
      "This workspace uses an older Setta settings/project format",
    ),
  ).toBeVisible();
  await expect(page.getByText("settings_project.py")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Switcher" }).click();
  await expect(page.getByRole("dialog")).toContainText("Switch Workspace");
});

test("workspace launch back-navigation reopens switcher with successful settaHomeInfo hydration", async ({
  page,
}) => {
  await ensureAppReady(page);
  const returnUrl = page.url();
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Switch Workspace" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Switch Workspace")).toBeVisible();
  await modal
    .getByPlaceholder("/path/to/workspace")
    .fill("/path/does/not/exist");
  await modal.getByRole("button", { name: "Launch" }).click();
  await page.waitForURL("**/launching");
  await expect(page.getByText("Workspace root does not exist")).toBeVisible();

  const settaHomeInfoRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === "GET" && url.pathname === "/api/settaHomeInfo";
  });
  const settaHomeInfoResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/settaHomeInfo"
    );
  });

  await page.getByRole("button", { name: "Back to Switcher" }).click();
  await expect(page).toHaveURL(returnUrl);
  await expect(page.getByRole("dialog")).toContainText("Switch Workspace");

  const request = await settaHomeInfoRequest;
  expect(new URL(request.url()).pathname).toBe("/api/settaHomeInfo");
  const response = await settaHomeInfoResponse;
  expect(response.status()).toBe(200);
  await expect(
    page.getByText(
      "Failed to resolve launcher scope for desktop launcher actions.",
    ),
  ).toHaveCount(0);
});

test("workspace launch blocks legacy forged hash payloads", async ({
  page,
}) => {
  await ensureAppReady(page);

  let launchRequestCount = 0;
  await page.route("**/api/launch", async (route) => {
    launchRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Legacy forged payload should not execute." },
      }),
    });
  });

  const forgedPayload = await page.evaluate(() => {
    const pending = {
      request: { workspaceRoot: "/tmp/forged" },
      returnUrl: window.location.href,
      requestedAt: Date.now(),
    };
    const encoded = new TextEncoder().encode(JSON.stringify(pending));
    let binary = "";
    for (const byte of encoded) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  });
  if (!forgedPayload) {
    throw new Error("Failed to encode forged payload.");
  }

  const nextUrl = new URL(page.url());
  nextUrl.pathname = "/launching";
  nextUrl.hash = `pl=${forgedPayload}`;
  await page.goto(nextUrl.toString(), { waitUntil: "domcontentloaded" });

  await expect(
    page.getByText("Missing pending workspace launch request."),
  ).toBeVisible();
  expect(launchRequestCount).toBe(0);
});

test("workspace launch does not dedupe in-flight requests that only differ by profile and roots", async ({
  page,
}) => {
  await ensureAppReady(page);

  const responseGate = createRouteGate();
  const capturedLaunchBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/launch", async (route, request) => {
    const body = request.postDataJSON();
    if (isObjectRecord(body)) {
      capturedLaunchBodies.push(body);
    } else {
      capturedLaunchBodies.push({});
    }
    await responseGate.wait;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { message: "Intentional failure for dedupe regression test." },
        }),
      });
    } catch {
      // Ignore requests that were cancelled during navigation churn.
    }
  });

  const firstRequest = {
    workspaceRoot: "/tmp/workspace",
    settaFilesLocation: "auto",
    profile: "dev-a",
    settaHome: "/tmp/setta-home-a",
    settaFilesRoot: "/tmp/state-a",
    runtimeRoot: "/tmp/runtime-a",
  };
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, firstRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => capturedLaunchBodies.length).toBe(1);

  const secondRequest = {
    workspaceRoot: "/tmp/workspace",
    settaFilesLocation: "auto",
    profile: "dev-b",
    settaHome: "/tmp/setta-home-b",
    settaFilesRoot: "/tmp/state-b",
    runtimeRoot: "/tmp/runtime-b",
  };
  await page.goto(new URL("/", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, secondRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect.poll(() => capturedLaunchBodies.length).toBe(2);
  responseGate.release();
  expect(capturedLaunchBodies[0]).toMatchObject(firstRequest);
  expect(capturedLaunchBodies[1]).toMatchObject(secondRequest);
  await expect(
    page.getByText("Intentional failure for dedupe regression test."),
  ).toBeVisible();
});

test("workspace launch dedupes in-flight requests when optionals differ only by missing vs null", async ({
  page,
}) => {
  await ensureAppReady(page);

  const responseGate = createRouteGate();
  const capturedLaunchBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/launch", async (route, request) => {
    const body = request.postDataJSON();
    if (isObjectRecord(body)) {
      capturedLaunchBodies.push(body);
    } else {
      capturedLaunchBodies.push({});
    }
    await responseGate.wait;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            message: "Intentional failure for null-vs-missing dedupe test.",
          },
        }),
      });
    } catch {
      // Ignore requests that were cancelled during navigation churn.
    }
  });

  const firstRequest = {
    workspaceRoot: "/tmp/workspace",
  };
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, firstRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => capturedLaunchBodies.length).toBe(1);

  const secondRequest = {
    workspaceRoot: "/tmp/workspace",
    profile: null,
    settaHome: null,
    settaFilesRoot: null,
    settaFilesLocation: null,
    runtimeRoot: null,
    sshTarget: null,
    sshArgs: null,
    remoteCmd: null,
    localPort: null,
  };
  await page.goto(new URL("/", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, secondRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect.poll(() => capturedLaunchBodies.length).toBe(1);
  responseGate.release();
  await expect(
    page.getByText("Intentional failure for null-vs-missing dedupe test."),
  ).toBeVisible();
});

test("workspace launch does not dedupe when unknown future request fields differ", async ({
  page,
}) => {
  await ensureAppReady(page);

  const responseGate = createRouteGate();
  const capturedLaunchBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/launch", async (route, request) => {
    const body = request.postDataJSON();
    if (isObjectRecord(body)) {
      capturedLaunchBodies.push(body);
    } else {
      capturedLaunchBodies.push({});
    }
    await responseGate.wait;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            message: "Intentional failure for future-field dedupe test.",
          },
        }),
      });
    } catch {
      // Ignore requests that were cancelled during navigation churn.
    }
  });

  const firstRequest = {
    workspaceRoot: "/tmp/workspace",
    futureLaunchMode: "mode-a",
  };
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, firstRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => capturedLaunchBodies.length).toBe(1);

  const secondRequest = {
    workspaceRoot: "/tmp/workspace",
    futureLaunchMode: "mode-b",
  };
  await page.goto(new URL("/", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, secondRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect.poll(() => capturedLaunchBodies.length).toBe(2);
  responseGate.release();
  expect(capturedLaunchBodies[0]).toMatchObject(firstRequest);
  expect(capturedLaunchBodies[1]).toMatchObject(secondRequest);
  await expect(
    page.getByText("Intentional failure for future-field dedupe test."),
  ).toBeVisible();
});

test("workspace launch dedupes when nested future fields only differ by key order", async ({
  page,
}) => {
  await ensureAppReady(page);

  const responseGate = createRouteGate();
  const capturedLaunchBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/launch", async (route, request) => {
    const body = request.postDataJSON();
    if (isObjectRecord(body)) {
      capturedLaunchBodies.push(body);
    } else {
      capturedLaunchBodies.push({});
    }
    await responseGate.wait;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            message: "Intentional failure for nested future-field dedupe test.",
          },
        }),
      });
    } catch {
      // Ignore requests that were cancelled during navigation churn.
    }
  });

  const firstRequest = {
    workspaceRoot: "/tmp/workspace",
    futureLaunchConfig: {
      routing: {
        mode: "isolated",
        retries: 2,
      },
      labels: ["alpha", { left: "L", right: "R" }],
    },
  };
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, firstRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => capturedLaunchBodies.length).toBe(1);

  const secondRequest = {
    workspaceRoot: "/tmp/workspace",
    futureLaunchConfig: {
      labels: ["alpha", { right: "R", left: "L" }],
      routing: {
        retries: 2,
        mode: "isolated",
      },
    },
  };
  await page.goto(new URL("/", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, secondRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect.poll(() => capturedLaunchBodies.length).toBe(1);
  responseGate.release();
  await expect(
    page.getByText("Intentional failure for nested future-field dedupe test."),
  ).toBeVisible();
});

test("workspace launch surfaces runtime-root/workspace-root conflict", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for runtime root conflict launch test.",
    );
  }

  await ensureAppReady(page);
  await page.evaluate(() => {
    sessionStorage.removeItem("setta.pendingWorkspaceLaunch");
    sessionStorage.removeItem("setta.workspaceSwitcherDraft");
  });
  const launchIntent = await createWorkspaceLaunchIntentToken({
    page,
    launchRequest: {
      workspaceRoot,
      runtimeRoot: workspaceRoot,
      settaFilesLocation: "local",
    },
  });
  await page.evaluate((handoff) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request: {
          launchIntentToken: handoff.launchIntentToken,
        },
        returnUrl: window.location.href,
        requestedAt: handoff.requestedAt,
      }),
    );
  }, launchIntent);

  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/launch";
  });
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(typeof requestBody.launchIntentToken).toBe("string");
  expect(requestBody.runtimeRoot).toBeUndefined();
  await expect(
    page.getByText("Runtime root cannot be the workspace root"),
  ).toBeVisible();
});

test("workspace launch treats auto location as omitted when settaFilesRoot is provided", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for setta-files-root auto-location launch test.",
    );
  }
  const missingWorkspace = `${workspaceRoot}/does-not-exist-${Date.now()}`;
  const explicitSettaFilesRoot = path.join(
    path.dirname(workspaceRoot),
    "playwright-state",
    "setta_files_dev",
  );

  await ensureAppReady(page);
  await page.evaluate(() => {
    sessionStorage.removeItem("setta.pendingWorkspaceLaunch");
    sessionStorage.removeItem("setta.workspaceSwitcherDraft");
  });
  const launchIntent = await createWorkspaceLaunchIntentToken({
    page,
    launchRequest: {
      workspaceRoot: missingWorkspace,
      settaFilesRoot: explicitSettaFilesRoot,
      settaFilesLocation: "auto",
    },
  });
  await page.evaluate((handoff) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request: {
          launchIntentToken: handoff.launchIntentToken,
        },
        returnUrl: window.location.href,
        requestedAt: handoff.requestedAt,
      }),
    );
  }, launchIntent);

  const launchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return req.method() === "POST" && url.pathname === "/api/launch";
  });
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(typeof requestBody.launchIntentToken).toBe("string");
  expect(requestBody.settaFilesLocation).toBeUndefined();
  expect(requestBody.settaFilesRoot).toBeUndefined();
  await expect(page.getByText("Workspace root does not exist")).toBeVisible();
  await expect(
    page.getByText(
      "Cannot use --setta-files-root together with --setta-files-location.",
    ),
  ).toHaveCount(0);
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
  const expectedWorkspaceRoot = path.resolve(workspaceRoot);
  const requestedLocalPort = await pickFreeLocalPort();

  await ensureAppReady(page);
  await page.evaluate(() => localStorage.removeItem("setta.workspaceHistory"));
  await page.evaluate(() =>
    localStorage.removeItem("setta.workspaceHistoryHandoff"),
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
  const createLaunchIntentRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      req.method() === "POST" &&
      url.pathname === "/api/createWorkspaceLaunchIntent" &&
      url.origin === expectedLauncherOrigin
    );
  });
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

  const createIntentBody = (await createLaunchIntentRequest).postDataJSON() as {
    launchRequest?: Record<string, unknown>;
  };
  expect(createIntentBody.launchRequest?.localPort).toBe(requestedLocalPort);
  expect(createIntentBody.launchRequest?.settaFilesLocation).toBe("global");

  const requestBody = (await launchRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(typeof requestBody.launchIntentToken).toBe("string");
  expect(requestBody.localPort).toBeUndefined();
  expect(requestBody.settaFilesLocation).toBeUndefined();

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
    const { C_ADDRESSES } = await import("/tests/e2e/browserAppSubsystemSdk.ts");
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
    modalAfterReload.getByText(expectedWorkspaceRoot, { exact: true }),
  ).toBeVisible();
  await expect(modalAfterReload.getByText("SSH: user@host")).toBeVisible();
  await expect(modalAfterReload.getByText("Setta files: local")).toBeVisible();
  await expect(
    modalAfterReload.getByRole("combobox", { name: "Setta Files Location" }),
  ).toHaveValue("local");

  // Regression test: in IDE mode, follow-up launches stay bound to the active
  // backend origin for the current session.
  const followupLaunchRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      req.method() === "POST" &&
      url.pathname === "/api/launch" &&
      url.origin === tunnelOrigin
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
