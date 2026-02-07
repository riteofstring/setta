import { describe, expect, it } from "vitest";

import { resolveAppAssets } from "./AppAssets";

describe("resolveAppAssets", () => {
  it("filters external assets when allowExternalLinks is false", () => {
    const assets = [
      { href: "/static/app.css" },
      { url: "https://example.com/external.css" },
      { path: "http://example.com/font.css" },
      { href: "//cdn.example.com/theme.css" },
      { href: "data:text/css;base64,Zm9v" },
    ];

    const resolved = resolveAppAssets(assets, { allowExternalLinks: false });

    expect(resolved.map((asset) => asset.href)).toEqual(["/static/app.css"]);
  });

  it("keeps external assets when allowExternalLinks is true", () => {
    const assets = [
      { href: "/static/app.css" },
      { href: "https://example.com/external.css" },
    ];

    const resolved = resolveAppAssets(assets, { allowExternalLinks: true });

    expect(resolved.map((asset) => asset.href)).toEqual([
      "/static/app.css",
      "https://example.com/external.css",
    ]);
  });
});

