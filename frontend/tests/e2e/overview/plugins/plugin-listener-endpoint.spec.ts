import { expect, test } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

test("plugin pane calls backend listener endpoints over the Go listener websocket route", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/listener-endpoint",
  );
  const listenerWebsocketUrls: string[] = [];
  page.on("websocket", (websocket) => {
    const url = websocket.url();
    if (url.includes("/ws/listeners/")) {
      listenerWebsocketUrls.push(url);
    }
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
    await postBackend(page, "/plugins/restart", null);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const pluginCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-listener-endpoint@0.1.0",
          exact: true,
        }),
      })
      .first();
    await expect(pluginCard).toBeVisible();
    await pluginCard
      .getByRole("button", {
        name: "Open Listener Endpoint Pane",
        exact: true,
      })
      .click();

    await page.getByTestId("fixture-listener-endpoint-call").click();
    await expect
      .poll(() => listenerWebsocketUrls.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    await expect(
      page.getByTestId("fixture-listener-endpoint-status"),
    ).toHaveText("Listener endpoint succeeded.");
    await expect(
      page.getByTestId("fixture-listener-endpoint-result"),
    ).toContainText('"handledByPlugin": "setta-fixture-listener-endpoint"');
    await expect(
      page.getByTestId("fixture-listener-endpoint-result"),
    ).toContainText(`"projectConfigId": "${projectContext.projectConfigId}"`);

    const listenerUrl = listenerWebsocketUrls[0];
    if (!listenerUrl) {
      throw new Error("Expected listener websocket url to be captured.");
    }
    const parsedUrl = new URL(listenerUrl);
    expect(parsedUrl.pathname).toContain("/ws/listeners/");
    expect(parsedUrl.searchParams.get("projectId")).toBe(
      projectContext.projectConfigId,
    );
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-listener-endpoint",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
