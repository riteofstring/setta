import { expect, test } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

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
    await postBackend(page, "/plugins/unlink", {
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

    await page.evaluate(async () => {
      const { useShareSession } = await import("/src/state/definitions.ts");
      const runtime = await import("/src/plugins/runtime.ts");
      useShareSession.setState({
        isDeploymentMode: true,
        shareSessionId: "share-session-e2e",
      });
      await runtime.refreshPluginRuntime();
    });

    await expect
      .poll(() => capturedRequests.length, { timeout: 15000 })
      .toBeGreaterThanOrEqual(4);

    const requestsWithShareHeader = capturedRequests.filter(
      (request) => request.headers["x-share-session-id"] === "share-session-e2e",
    );
    expect(requestsWithShareHeader.length).toBeGreaterThan(0);
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend-api-fetch",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
