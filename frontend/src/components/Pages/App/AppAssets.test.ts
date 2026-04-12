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

  it("applies type-based defaults for rel and as values", () => {
    const assets = [
      { href: "/favicon.ico", type: "icon", sizes: "32x32" },
      { path: "/font.woff2", type: "font", mimeType: "font/woff2" },
      { url: "/module.js", type: "preload", as: "script" },
    ];

    expect(resolveAppAssets(assets, { allowExternalLinks: true })).toEqual([
      {
        key: "asset:icon:/favicon.ico:0",
        rel: "icon",
        href: "/favicon.ico",
        sizes: "32x32",
        type: undefined,
        as: undefined,
        crossOrigin: undefined,
      },
      {
        key: "asset:stylesheet:/font.woff2:1",
        rel: "stylesheet",
        href: "/font.woff2",
        sizes: undefined,
        type: "font/woff2",
        as: "font",
        crossOrigin: undefined,
      },
      {
        key: "asset:preload:/module.js:2",
        rel: "preload",
        href: "/module.js",
        sizes: undefined,
        type: undefined,
        as: "script",
        crossOrigin: undefined,
      },
    ]);
  });

  it("drops non-record assets and records without a path-like field", () => {
    const assets = [null, "bad", { rel: "stylesheet" }, { href: "/valid.css" }];

    expect(resolveAppAssets(assets, { allowExternalLinks: true })).toEqual([
      {
        key: "asset:stylesheet:/valid.css:3",
        rel: "stylesheet",
        href: "/valid.css",
        sizes: undefined,
        type: undefined,
        as: undefined,
        crossOrigin: undefined,
      },
    ]);
  });
});
