import { C_ADDRESSES } from "utils/c_addresses";
import {
  GoHTTPRouteHelpers,
  GoWebsocketRouteHelpers,
} from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import {
  buildPluginAssetUrl,
  buildPluginBackendFetchUrl,
  buildPluginListenerWebsocketUrl,
} from "./transport";

describe("plugin transport helpers", () => {
  it("keeps absolute asset URLs and resolves backend-rooted asset URLs", () => {
    expect(buildPluginAssetUrl(null)).toBeNull();
    expect(buildPluginAssetUrl("https://cdn.example/plugin.js")).toBe(
      "https://cdn.example/plugin.js",
    );
    expect(buildPluginAssetUrl("plugin-local.js")).toBe("plugin-local.js");
    expect(buildPluginAssetUrl("/plugins/acme.plugin/frontend.js")).toBe(
      `${C_ADDRESSES.BACKEND_ORIGIN}/plugins/acme.plugin/frontend.js`,
    );
  });

  it("builds plugin backend fetch URLs from the canonical Go route helper", () => {
    const expectedPath =
      new URL(C_ADDRESSES.BACKEND).pathname +
      GoHTTPRouteHelpers.pluginsBackendRoute("acme.plugin", "/health");
    const url = new URL(buildPluginBackendFetchUrl("acme.plugin", "/health"));

    expect(url.pathname).toBe(expectedPath);
  });

  it("builds plugin listener websocket URLs from the canonical Go route helper", () => {
    const expectedPath = GoWebsocketRouteHelpers.listenerById("listener-a");
    const url = new URL(
      buildPluginListenerWebsocketUrl({
        listenerId: "listener-a",
        projectConfigId: "project-a",
        shareSessionId: "share-a",
      }),
    );

    expect(url.pathname).toBe(expectedPath);
    expect(url.searchParams.get("projectId")).toBe("project-a");
    expect(url.searchParams.get("shareSessionId")).toBe("share-a");
  });
});
