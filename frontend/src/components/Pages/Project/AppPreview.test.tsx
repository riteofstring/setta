import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetProjectStores } from "state/utils";
import { useAppDefinition, useAppPreview } from "state/stores/appStores";
import { createAppDefinition } from "utils/generatedTypes";

import { AppPreview } from "./AppPreview";

let latestProps: Record<string, unknown> | null = null;

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  // `renderToStaticMarkup` uses Zustand's getInitialState() snapshot rather than getState().
  // Keep the server snapshot aligned with our test's updated state.
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

vi.mock("components/App/AppRenderer", async () => {
  const React = await import("react");
  return {
    AppRenderer: (props: Record<string, unknown>) => {
      latestProps = props;
      return React.createElement("div", { "data-testid": "mock-app-renderer" });
    },
  };
});

function renderPreview() {
  latestProps = null;
  syncStoreInitialState(useAppDefinition);
  syncStoreInitialState(useAppPreview);
  return renderToStaticMarkup(<AppPreview />);
}

describe("AppPreview", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
    latestProps = null;
  });

  it("passes through the persisted app spec when no override exists", () => {
    const persistedSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    useAppDefinition.setState({
      appSpec: persistedSpec,
      appDefinition: createAppDefinition(),
    });
    useAppPreview.setState({
      previewSpecOverride: undefined,
      previewThemeOverride: undefined,
      previewAssetsOverride: undefined,
    });

    renderPreview();

    expect(latestProps?.appSpec).toEqual(persistedSpec);
  });

  it("uses the draft override app spec when set", () => {
    const persistedSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    const draftSpec = {
      root: { key: "draft", type: "Stack" },
      elements: {},
    };
    useAppDefinition.setState({
      appSpec: persistedSpec,
      appDefinition: createAppDefinition(),
    });
    useAppPreview.setState({
      previewSpecOverride: draftSpec,
      previewThemeOverride: undefined,
      previewAssetsOverride: undefined,
    });

    renderPreview();

    expect(latestProps?.appSpec).toEqual(draftSpec);
  });

  it("treats a null override as an explicit clear (does not fall back)", () => {
    const persistedSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    useAppDefinition.setState({
      appSpec: persistedSpec,
      appDefinition: createAppDefinition(),
    });
    useAppPreview.setState({
      previewSpecOverride: null,
      previewThemeOverride: undefined,
      previewAssetsOverride: undefined,
    });

    renderPreview();

    expect(latestProps?.appSpec).toBeNull();
  });

  it("overrides theme + assets on the app definition", () => {
    useAppDefinition.setState({
      appSpec: null,
      appDefinition: createAppDefinition({
        theme: { mode: "light" },
        assets: [{ rel: "stylesheet", href: "/static/a.css" }],
      }),
    });
    useAppPreview.setState({
      previewSpecOverride: undefined,
      previewThemeOverride: { mode: "dark" },
      previewAssetsOverride: [{ rel: "stylesheet", href: "/static/b.css" }],
    });

    renderPreview();

    const definition = latestProps?.appDefinition as
      | { theme?: unknown; assets?: unknown }
      | null
      | undefined;
    expect(definition?.theme).toEqual({ mode: "dark" });
    expect(definition?.assets).toEqual([
      { rel: "stylesheet", href: "/static/b.css" },
    ]);
  });

  it("creates a default app definition when overrides exist but no definition is stored", () => {
    useAppDefinition.setState({
      appSpec: null,
      appDefinition: null,
    });
    useAppPreview.setState({
      previewSpecOverride: undefined,
      previewThemeOverride: { mode: "dark" },
      previewAssetsOverride: [],
    });

    renderPreview();

    expect(latestProps?.appDefinition).not.toBeNull();
  });
});
