/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppAssets } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/components/Pages/App/AppAssets";

type RenderedAssets = {
  host: HTMLDivElement;
  root: Root;
};

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

function setReactActEnvironment(value: boolean | undefined) {
  const target = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  if (value === undefined) {
    delete target.IS_REACT_ACT_ENVIRONMENT;
    return;
  }
  target.IS_REACT_ACT_ENVIRONMENT = value;
}

function getInjectedAssetLinks(): HTMLLinkElement[] {
  return Array.from(
    document.head.querySelectorAll("link[data-setta-app-asset]"),
  );
}

async function renderAssets(props: {
  assets: unknown[] | null | undefined;
  allowExternalLinks?: boolean;
}): Promise<RenderedAssets> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(createElement(AppAssets, props));
  });

  return { host, root };
}

async function unmountRenderedAssets(rendered: RenderedAssets): Promise<void> {
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

afterEach(() => {
  getInjectedAssetLinks().forEach((link) => link.remove());
  document.body.innerHTML = "";
});

describe("AppAssets", () => {
  beforeEach(() => {
    setReactActEnvironment(true);
  });

  afterEach(() => {
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("filters external assets unless external links are explicitly allowed", async () => {
    const rendered = await renderAssets({
      assets: [
        { href: "/static/app.css" },
        { url: "https://example.com/external.css" },
        { path: "http://example.com/font.css" },
        { href: "//cdn.example.com/theme.css" },
        { href: "data:text/css;base64,Zm9v" },
        null,
        "bad",
      ],
    });

    expect(
      getInjectedAssetLinks().map((link) => link.getAttribute("href")),
    ).toEqual(["/static/app.css"]);

    await unmountRenderedAssets(rendered);
    expect(getInjectedAssetLinks()).toHaveLength(0);
  });

  it("normalizes supported asset metadata when mounting links", async () => {
    const rendered = await renderAssets({
      allowExternalLinks: true,
      assets: [
        { href: "/favicon.ico", type: "icon", sizes: "32x32" },
        {
          path: "/font.woff2",
          type: "font",
          mimeType: "font/woff2",
          crossOrigin: "anonymous",
        },
        { url: "/module.js", type: "preload", as: "script" },
        { rel: "stylesheet" },
        { href: "https://example.com/external.css" },
      ],
    });

    const links = getInjectedAssetLinks();
    expect(links).toHaveLength(4);

    expect(
      links.map((link) => ({
        rel: link.getAttribute("rel"),
        href: link.getAttribute("href"),
        type: link.getAttribute("type"),
        as:
          ("as" in link
            ? (link as HTMLLinkElement & { as?: string }).as
            : "") || null,
        crossOrigin: link.getAttribute("crossorigin"),
      })),
    ).toEqual([
      {
        rel: "icon",
        href: "/favicon.ico",
        type: null,
        as: null,
        crossOrigin: null,
      },
      {
        rel: "stylesheet",
        href: "/font.woff2",
        type: "font/woff2",
        as: "font",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/module.js",
        type: null,
        as: "script",
        crossOrigin: null,
      },
      {
        rel: "stylesheet",
        href: "https://example.com/external.css",
        type: null,
        as: null,
        crossOrigin: null,
      },
    ]);

    await unmountRenderedAssets(rendered);
  });
});
