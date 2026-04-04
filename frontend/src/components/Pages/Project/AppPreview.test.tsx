/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NULL_PROJECT_CONFIG_ID,
  useAllProjectMetadata,
  useAppConfigs,
  useAppDefinition,
  useAppPreview,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createAppDefinition,
  createProjectConfig,
  createProjectStateSingleConfig,
} from "utils/generatedTypes";

import { AppPreview } from "./AppPreview";

let latestProps: Record<string, unknown> | null = null;
const routeLoadProjectConfigMock = vi.fn();

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

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

vi.mock("utils/generatedEndpoints", () => ({
  route_load_project_config: (...args: unknown[]) =>
    routeLoadProjectConfigMock(...args),
}));

function renderPreview() {
  latestProps = null;
  syncStoreInitialState(useAppDefinition);
  syncStoreInitialState(useAppPreview);
  return renderToStaticMarkup(<AppPreview />);
}

type RenderedPreview = {
  host: HTMLDivElement;
  root: Root;
};

async function renderPreviewInDom(): Promise<RenderedPreview> {
  latestProps = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<AppPreview />);
  });

  return { host, root };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AppPreview", () => {
  beforeEach(() => {
    resetProjectStores();
    routeLoadProjectConfigMock.mockReset();
  });

  afterEach(() => {
    resetProjectStores();
    latestProps = null;
    document.body.innerHTML = "";
  });

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = originalReactActEnvironment;
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

  it("loads a preview config through the Go project-load route when previewing another project", async () => {
    routeLoadProjectConfigMock.mockResolvedValue({
      data: createProjectStateSingleConfig({
        projectConfig: createProjectConfig({
          id: "preview-config",
          name: "Preview Project",
        }),
      }),
      status: 200,
      hasResponse: true,
    });
    useProjectState.setState((state) => ({
      ...state,
      projectConfig: createProjectConfig({
        id: NULL_PROJECT_CONFIG_ID,
        name: "Current Project",
      }),
    }));
    useAllProjectMetadata.setState({
      defaultProjectConfigId: null,
      projectMetadata: [
        createProjectConfig({
          id: "preview-config",
          name: "Preview Project",
        }),
      ],
    });
    useAppPreview.setState({
      previewConfigId: "preview-config",
      previewSpecOverride: undefined,
      previewThemeOverride: undefined,
      previewAssetsOverride: undefined,
    });

    const { host, root } = await renderPreviewInDom();

    try {
      await flushEffects();

      // Previewing a different project should hydrate the preview cache from
      // the Go-owned load-project contract rather than assuming local state.
      expect(routeLoadProjectConfigMock).toHaveBeenCalledWith({
        projectConfigName: "Preview Project",
      });
      expect(useAppConfigs.getState().configs["preview-config"]).toMatchObject({
        projectConfig: {
          id: "preview-config",
          name: "Preview Project",
        },
      });
      expect(latestProps?.defaultConfigId).toBe("preview-config");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
