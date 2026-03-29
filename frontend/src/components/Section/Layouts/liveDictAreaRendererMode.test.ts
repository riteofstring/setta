import { describe, expect, it } from "vitest";
import {
  getLiveDictAreaRendererViewportSyncPlan,
  LIVE_DICT_AREA_RENDERER_QUERY_PARAM,
  readRequestedLiveDictAreaRendererMode,
  resolveLiveDictAreaRendererMode,
} from "./liveDictAreaRendererMode";

describe("readRequestedLiveDictAreaRendererMode", () => {
  it("returns only explicit valid renderer query-param requests", () => {
    expect(readRequestedLiveDictAreaRendererMode("")).toBeNull();
    expect(
      readRequestedLiveDictAreaRendererMode(
        `?${LIVE_DICT_AREA_RENDERER_QUERY_PARAM}=pixi-node-body`,
      ),
    ).toBe("pixi-node-body");
    expect(
      readRequestedLiveDictAreaRendererMode(
        `?${LIVE_DICT_AREA_RENDERER_QUERY_PARAM}=unknown-mode`,
      ),
    ).toBeNull();
  });
});

describe("resolveLiveDictAreaRendererMode", () => {
  it("defaults to the live DOM renderer when the query param is absent", () => {
    expect(
      resolveLiveDictAreaRendererMode({
        persistedMode: null,
        search: "",
      }),
    ).toBe("dom");
    expect(
      resolveLiveDictAreaRendererMode({
        persistedMode: null,
        search: null,
      }),
    ).toBe("dom");
  });

  it("enables the live Pixi canary only for the explicit query-param opt-in", () => {
    expect(
      resolveLiveDictAreaRendererMode({
        persistedMode: null,
        search: `?${LIVE_DICT_AREA_RENDERER_QUERY_PARAM}=pixi-node-body`,
      }),
    ).toBe("pixi-node-body");
    expect(
      resolveLiveDictAreaRendererMode({
        persistedMode: null,
        search: `?${LIVE_DICT_AREA_RENDERER_QUERY_PARAM}=unknown-mode`,
      }),
    ).toBe("dom");
  });

  it("falls back to the persisted per-tab mode when the query param is later removed", () => {
    expect(
      resolveLiveDictAreaRendererMode({
        persistedMode: "pixi-node-body",
        search: "",
      }),
    ).toBe("pixi-node-body");
    expect(
      resolveLiveDictAreaRendererMode({
        persistedMode: "unknown-mode",
        search: "",
      }),
    ).toBe("dom");
  });
});

describe("getLiveDictAreaRendererViewportSyncPlan", () => {
  it("requests a viewport refit on the first Pixi load when the canary only comes from persisted session state", () => {
    expect(
      getLiveDictAreaRendererViewportSyncPlan({
        persistedMode: "pixi-node-body",
        previousViewportMode: null,
        search: "",
      }),
    ).toEqual({
      resolvedMode: "pixi-node-body",
      shouldRequestViewportRefit: true,
    });
  });

  it("does not request another viewport refit when the current viewport already matches the resolved Pixi mode", () => {
    expect(
      getLiveDictAreaRendererViewportSyncPlan({
        persistedMode: "pixi-node-body",
        previousViewportMode: "pixi-node-body",
        search: "",
      }),
    ).toEqual({
      resolvedMode: "pixi-node-body",
      shouldRequestViewportRefit: false,
    });
  });

  it("requests a viewport refit when the explicit query switches back to the DOM renderer", () => {
    expect(
      getLiveDictAreaRendererViewportSyncPlan({
        persistedMode: "pixi-node-body",
        previousViewportMode: "pixi-node-body",
        search: `?${LIVE_DICT_AREA_RENDERER_QUERY_PARAM}=dom`,
      }),
    ).toEqual({
      resolvedMode: "dom",
      shouldRequestViewportRefit: true,
    });
  });
});
