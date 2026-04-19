/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NULL_PROJECT_CONFIG_ID,
  useAllProjectMetadata,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig, createSingleConfig } from "utils/generatedTypes";
import { createAppDefinition } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemContracts";
import { useAppDefinition } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemDefinitionState";
import {
  useAppConfigs,
  useAppPreview,
} from "../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemProjectState";

import { AppPreview } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/components/Pages/Project/AppPreview";

let latestProps: Record<string, unknown> | null = null;
const routeLoadProjectConfigMock = vi.fn();

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

function resetAppPreviewState() {
  useAppPreview.getState().reset?.();
}

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

async function mockAppRendererModule() {
  const React = await import("react");
  return {
    AppRenderer: (props: Record<string, unknown>) => {
      latestProps = props;
      return React.createElement("div", { "data-testid": "mock-app-renderer" });
    },
  };
}

vi.mock(
  "../../../../../plugins/setta-json-render-app-gen/frontend/src/components/App/AppRenderer",
  mockAppRendererModule,
);

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    loadProjectConfig: (options?: unknown) =>
      routeLoadProjectConfigMock(options),
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
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
    resetAppPreviewState();
    routeLoadProjectConfigMock.mockReset();
  });

  afterEach(() => {
    resetProjectStores();
    resetAppPreviewState();
    latestProps = null;
    document.body.innerHTML = "";
  });

  beforeEach(() => {
    setReactActEnvironment(true);
  });

  afterEach(() => {
    setReactActEnvironment(originalReactActEnvironment);
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
    useAppPreview.setState({});

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
    useAppPreview.setState({ previewSpecOverride: draftSpec });

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
    useAppPreview.setState({ previewSpecOverride: null });

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
      previewThemeOverride: { mode: "dark" },
      previewAssetsOverride: [],
    });

    renderPreview();

    expect(latestProps?.appDefinition).not.toBeNull();
  });

  it("loads a preview config through the Go project-load route when previewing another project", async () => {
    routeLoadProjectConfigMock.mockResolvedValue({
      data: createSingleConfig({
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
    useAppPreview.setState({ previewConfigId: "preview-config" });

    const { host, root } = await renderPreviewInDom();

    try {
      await flushEffects();

      // Previewing a different project should hydrate the preview cache from
      // the Go-owned load-project contract rather than assuming local state.
      expect(routeLoadProjectConfigMock).toHaveBeenCalledWith({
        body: {
          projectConfigName: "Preview Project",
        },
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
