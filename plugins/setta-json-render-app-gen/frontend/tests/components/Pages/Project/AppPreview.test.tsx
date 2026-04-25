/* @vitest-environment jsdom */

import {
  createAppSubsystemFrontendHost,
  type AppSubsystemProjectStateSnapshot,
} from "@setta/app-subsystem-frontend-sdk";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig, createSingleConfig } from "utils/generatedTypes";
import { createAppDefinition } from "../../../../src/appSubsystemContracts";
import { useAppDefinition } from "../../../../src/appSubsystemDefinitionState";
import { AppSubsystemFrontendHostProvider } from "../../../../src/appSubsystemFrontendHostContext";
import {
  useAppConfigs,
  useAppPreview,
} from "../../../../src/appSubsystemProjectState";

import { AppPreview } from "../../../../src/components/Pages/Project/AppPreview";

let latestProps: Record<string, unknown> | null = null;
const routeLoadProjectConfigMock = vi.hoisted(() => vi.fn());
const callOpenAPIMock = vi.hoisted(() =>
  vi.fn((promise: Promise<unknown>) => promise),
);

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

vi.mock("../../../../src/components/App/AppRenderer", mockAppRendererModule);

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: callOpenAPIMock,
    loadProjectConfig: (options?: unknown) =>
      routeLoadProjectConfigMock(options),
  };
});

function createPreviewHost(
  args: {
    projectContext?: {
      defaultProjectConfigId: string | null;
      projectMetadata: Array<{ id: string; name: string }>;
      projectConfig: {
        id: string | null;
        name: string;
        entryCodeBlockId: string | null;
      };
    };
    projectStateSnapshot?: AppSubsystemProjectStateSnapshot;
  } = {},
) {
  const projectContext = args.projectContext ?? {
    defaultProjectConfigId: null,
    projectMetadata: [],
    projectConfig: {
      id: null,
      name: "",
      entryCodeBlockId: null,
    },
  };
  const projectStateSnapshot =
    args.projectStateSnapshot ??
    ({
      ...createSingleConfig(),
      previewSectionVariantMap: {},
    } as AppSubsystemProjectStateSnapshot);

  return createAppSubsystemFrontendHost({
    getProjectContext: () => projectContext,
    subscribeProjectContext: () => () => undefined,
    getProjectStateSnapshot: () => projectStateSnapshot,
    subscribeProjectStateSnapshot: () => () => undefined,
  });
}

function renderPreview(frontendHost = createPreviewHost()) {
  latestProps = null;
  syncStoreInitialState(useAppDefinition);
  syncStoreInitialState(useAppPreview);
  return renderToStaticMarkup(
    <AppSubsystemFrontendHostProvider host={frontendHost}>
      <AppPreview />
    </AppSubsystemFrontendHostProvider>,
  );
}

type RenderedPreview = {
  host: HTMLDivElement;
  root: Root;
};

async function renderPreviewInDom(
  frontendHost = createPreviewHost(),
): Promise<RenderedPreview> {
  latestProps = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <AppSubsystemFrontendHostProvider host={frontendHost}>
        <AppPreview />
      </AppSubsystemFrontendHostProvider>,
    );
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

  it("hydrates the active app config cache from the frontend host project snapshot", async () => {
    const frontendHost = createPreviewHost({
      projectContext: {
        defaultProjectConfigId: "active-config",
        projectMetadata: [{ id: "active-config", name: "Active Project" }],
        projectConfig: {
          id: "active-config",
          name: "Active Project",
          entryCodeBlockId: "entry-code-block",
        },
      },
      projectStateSnapshot: {
        ...createSingleConfig({
          projectConfig: createProjectConfig({
            id: "active-config",
            name: "Active Project",
            entryCodeBlockId: "entry-code-block",
          }),
        }),
        previewSectionVariantMap: {
          sectionA: "variant-a",
        },
      },
    });

    const { host, root } = await renderPreviewInDom(frontendHost);

    try {
      await flushEffects();

      expect(useAppConfigs.getState().configs["active-config"]).toMatchObject({
        projectConfig: {
          id: "active-config",
          name: "Active Project",
          entryCodeBlockId: "entry-code-block",
        },
        previewSectionVariantMap: {
          sectionA: "variant-a",
        },
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
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
    useAppPreview.setState({ previewConfigId: "preview-config" });
    const frontendHost = createPreviewHost({
      projectContext: {
        defaultProjectConfigId: null,
        projectMetadata: [
          {
            id: "preview-config",
            name: "Preview Project",
          },
        ],
        projectConfig: {
          id: null,
          name: "Current Project",
          entryCodeBlockId: null,
        },
      },
    });

    const { host, root } = await renderPreviewInDom(frontendHost);

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
