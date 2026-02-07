import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  useAllProjectMetadata,
  useAppDefinition,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";

import { AppPage } from "./AppPage";

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

function renderPage(pathname: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <AppPage />
    </MemoryRouter>,
  );
}

describe("AppPage", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({
      isShareMode: false,
      shareSessionId: null,
      sharePolicy: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
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
    useAllProjectMetadata.setState({
      defaultProjectConfigId: "config-1",
      projectMetadata: [{ id: "config-1", name: "Example Project" }],
    });
    syncStoreInitialState(useAllProjectMetadata);
    useAppDefinition.setState({
      appDefinition: null,
      appSpec: null,
    });
    syncStoreInitialState(useAppDefinition);

    const markup = renderPage("/");

    expect(markup).toContain("Example Project");
    expect(markup).toContain("No app spec found");
  });

  it("adds a dark-mode class when the app theme mode is forced to dark", () => {
    useAllProjectMetadata.setState({
      defaultProjectConfigId: "config-1",
      projectMetadata: [{ id: "config-1", name: "Example Project" }],
    });
    syncStoreInitialState(useAllProjectMetadata);
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

    const markup = renderPage("/");

    // Match the `dark` class token, not Tailwind `dark:*` class names.
    expect(markup).toMatch(/\sdark(?:\s|")/);
  });
});
