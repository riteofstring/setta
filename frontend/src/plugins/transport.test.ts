import { C_ADDRESSES } from "utils/c_addresses";
import { describe, expect, it } from "vitest";
import { buildPluginAssetUrl } from "./transport";

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
});
