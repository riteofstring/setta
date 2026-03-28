import { expect, test } from "@playwright/test";
import path from "path";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

test("plugin host apiFetch normalizes paths and forwards custom headers", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-api-fetch",
  );
  const capturedRequests: Array<{
    url: string;
    headers: Record<string, string>;
  }> = [];

  await page.route("**/plugins/setta-fixture-frontend-api-fetch/health", async (route) => {
    capturedRequests.push({
      url: route.request().url(),
      headers: route.request().headers(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path: "health" }),
    });
  });
  await page.route("**/plugins/setta-fixture-frontend-api-fetch/status", async (route) => {
    capturedRequests.push({
      url: route.request().url(),
      headers: route.request().headers(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path: "status" }),
    });
  });

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect
      .poll(() => capturedRequests.length, { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);

    const healthRequest = capturedRequests.find((request) =>
      request.url.endsWith("/plugins/setta-fixture-frontend-api-fetch/health"),
    );
    const statusRequest = capturedRequests.find((request) =>
      request.url.endsWith("/plugins/setta-fixture-frontend-api-fetch/status"),
    );

    expect(healthRequest).toBeTruthy();
    expect(statusRequest).toBeTruthy();
    expect(healthRequest?.url.startsWith(BACKEND_ORIGIN)).toBeTruthy();
    expect(statusRequest?.url.startsWith(BACKEND_ORIGIN)).toBeTruthy();
    expect(statusRequest?.headers["x-custom"]).toBe("yes");
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-api-fetch",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin host apiFetch hits real backend routes without interception", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-api-fetch",
  );
  const capturedUrls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/plugins/setta-fixture-frontend-api-fetch/")) {
      capturedUrls.push(url);
    }
  });

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    allowExpectedApiError(page, {
      path: "/api/plugins/setta-fixture-frontend-api-fetch/health",
      statuses: [404],
      method: "GET",
      count: 10,
      ttlMs: 60000,
    });
    allowExpectedApiError(page, {
      path: "/api/plugins/setta-fixture-frontend-api-fetch/status",
      statuses: [404],
      method: "GET",
      count: 10,
      ttlMs: 60000,
    });

    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect
      .poll(() => capturedUrls.length, { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);

    expect(
      capturedUrls.some((url) =>
        url.endsWith("/plugins/setta-fixture-frontend-api-fetch/health"),
      ),
    ).toBeTruthy();
    expect(
      capturedUrls.some((url) =>
        url.endsWith("/plugins/setta-fixture-frontend-api-fetch/status"),
      ),
    ).toBeTruthy();
    expect(capturedUrls.every((url) => url.startsWith(BACKEND_ORIGIN))).toBeTruthy();
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-api-fetch",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin host apiFetch rejects traversal paths and avoids escaped requests", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-api-fetch",
  );

  await page.route("**/plugins/setta-fixture-frontend-api-fetch/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path: "health" }),
    });
  });
  await page.route("**/plugins/setta-fixture-frontend-api-fetch/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path: "status" }),
    });
  });
  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect
      .poll(
        () =>
          page.evaluate(
            () => ({
              failed: Number(
                (window as unknown as Record<string, unknown>)
                  .__settaFixtureApiFetchTraversalFailures ?? 0,
              ),
              succeeded: Number(
                (window as unknown as Record<string, unknown>)
                  .__settaFixtureApiFetchTraversalCalls ?? 0,
              ),
            }),
          ),
        { timeout: 15000 },
      )
      .toEqual({ failed: 2, succeeded: 0 });
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-api-fetch",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin host apiFetch forwards deployment share-session headers", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-api-fetch",
  );
  const capturedRequests: Array<{
    url: string;
    headers: Record<string, string>;
  }> = [];

  await page.route("**/plugins/setta-fixture-frontend-api-fetch/health", async (route) => {
    capturedRequests.push({
      url: route.request().url(),
      headers: route.request().headers(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path: "health" }),
    });
  });
  await page.route("**/plugins/setta-fixture-frontend-api-fetch/status", async (route) => {
    capturedRequests.push({
      url: route.request().url(),
      headers: route.request().headers(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path: "status" }),
    });
  });

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const initialRequestCount = capturedRequests.length;

    await page.evaluate(async () => {
      const { useShareSession } = await import("/src/state/definitions.ts");
      useShareSession.setState({
        isDeploymentMode: true,
        shareSessionId: "share-session-e2e",
      });

      const globalScope = window as unknown as {
        __settaFixtureApiFetchRunStandardFetches?: unknown;
      };
      if (typeof globalScope.__settaFixtureApiFetchRunStandardFetches !== "function") {
        throw new Error("Expected fixture fetch trigger to be registered.");
      }
      globalScope.__settaFixtureApiFetchRunStandardFetches();
    });

    await expect
      .poll(() => capturedRequests.length, { timeout: 15000 })
      .toBeGreaterThanOrEqual(initialRequestCount + 2);

    const requestsWithShareHeader = capturedRequests
      .slice(initialRequestCount)
      .filter(
        (request) => request.headers["x-share-session-id"] === "share-session-e2e",
      );
    expect(requestsWithShareHeader.length).toBeGreaterThan(0);
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-api-fetch",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
