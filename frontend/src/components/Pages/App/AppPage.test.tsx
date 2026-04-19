import {
  createAppSubsystemFrontendHost,
  type Policy,
} from "@setta/app-subsystem-frontend-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetProjectStores } from "state/utils";
import { useAppDefinition } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemDefinitionState";
import { AppSubsystemFrontendHostProvider } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemFrontendHostContext";

import { AppPage } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/components/Pages/App/AppPage";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function renderPage(
  pathname: string,
  args: {
    defaultProjectConfigId?: string | null;
    projectMetadata?: Array<{ id: string; name: string }>;
    sharePolicy?: Policy | null;
  } = {},
) {
  const frontendHost = createAppSubsystemFrontendHost({
    getProjectContext: () => ({
      defaultProjectConfigId: args.defaultProjectConfigId ?? null,
      projectMetadata: args.projectMetadata ?? [],
      projectConfig: {
        id: args.defaultProjectConfigId ?? null,
        name:
          args.projectMetadata?.find(
            (entry) => entry.id === (args.defaultProjectConfigId ?? null),
          )?.name ?? "",
        entryCodeBlockId: null,
      },
    }),
    subscribeProjectContext: () => () => undefined,
    getRuntimeContext: () => ({
      isAppDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: args.sharePolicy ?? null,
      defaultRunSnapshotMode: "ephemeral",
      runSnapshotModeByProjectConfigId: {},
    }),
    subscribeRuntimeContext: () => () => undefined,
  });

  return renderToStaticMarkup(
    <AppSubsystemFrontendHostProvider host={frontendHost}>
      <MemoryRouter initialEntries={[pathname]}>
        <AppPage />
      </MemoryRouter>
    </AppSubsystemFrontendHostProvider>,
  );
}

describe("AppPage", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("shows route not found when path is missing", () => {
    useAppDefinition.setState({
      appDefinition: {
        appSpecVersion: "v1",
        catalogId: "setta.app.default",
        appSpecPath: null,
        routes: [{ path: "/alpha", name: "Alpha", rootKey: "root" }],
        dataBindings: {},
        actions: {},
        theme: null,
        assets: [],
      },
      appSpec: {
        root: { key: "root", type: "Stack" },
        elements: {},
      },
    });
    syncStoreInitialState(useAppDefinition);

    const markup = renderPage("/beta");

    expect(markup).toContain("App page not found.");
    expect(markup).toContain("Alpha");
  });

  it("shows root missing when route root key is absent", () => {
    useAppDefinition.setState({
      appDefinition: {
        appSpecVersion: "v1",
        catalogId: "setta.app.default",
        appSpecPath: null,
        routes: [{ path: "/app", name: "Dashboard", rootKey: "main" }],
        dataBindings: {},
        actions: {},
        theme: null,
        assets: [],
      },
      appSpec: {
        root: { key: "root", type: "Stack" },
        elements: {},
      },
    });
    syncStoreInitialState(useAppDefinition);

    const markup = renderPage("/app");

    expect(markup).toContain("App route root not found in spec.");
    expect(markup).toContain("Dashboard");
  });

  it("falls back to the default config name when no routes exist", () => {
    useAppDefinition.setState({
      appDefinition: null,
      appSpec: null,
    });
    syncStoreInitialState(useAppDefinition);

    const markup = renderPage("/", {
      defaultProjectConfigId: "config-1",
      projectMetadata: [{ id: "config-1", name: "Example Project" }],
    });

    expect(markup).toContain("Example Project");
    expect(markup).toContain("No app spec found");
  });

  it("adds a dark-mode class when the app theme mode is forced to dark", () => {
    useAppDefinition.setState({
      appDefinition: {
        appSpecVersion: "v1",
        catalogId: "setta.app.default",
        appSpecPath: null,
        routes: [],
        dataBindings: {},
        actions: {},
        theme: { mode: "dark" },
        assets: [],
      },
      appSpec: null,
    });
    syncStoreInitialState(useAppDefinition);

    const markup = renderPage("/", {
      defaultProjectConfigId: "config-1",
      projectMetadata: [{ id: "config-1", name: "Example Project" }],
    });

    // Match the `dark` class token, not Tailwind `dark:*` class names.
    expect(markup).toMatch(/\sdark(?:\s|")/);
  });
});
