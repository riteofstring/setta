/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  useLocalStorage,
  useSettings,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createSettingsState, type SharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectNav } from "./ProjectNav";

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

function buildSharePolicy(overrides: Partial<SharePolicy> = {}): SharePolicy {
  return {
    allowParamChanges: true,
    allowVariantChanges: true,
    allowLayoutChanges: true,
    allowRun: false,
    allowLLM: false,
    runSnapshotMode: "ephemeral",
    ...overrides,
  };
}

function renderWithProject(projectName = "demo-project") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/${projectName}`]}>
      <Routes>
        <Route path="/:projectConfigName" element={<ProjectNav />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderWithoutProject() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ProjectNav />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProjectNav", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useLocalStorage.setState({ darkMode: true, colorMode: "dark" });
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useLocalStorage);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("shows project menus when not in share mode", () => {
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: null,
      shareSessionId: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
    });
    syncStoreInitialState(useShareSession);

    const markup = renderWithProject();

    expect(markup).toContain("Project");
    expect(markup).toContain("Edit");
    expect(markup).toContain("Run");
  });

  it("shows run controls only when share mode allows running", () => {
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: buildSharePolicy({ allowRun: true }),
      shareSessionId: "share-1",
      shareDeploymentName: null,
      shareDeploymentVersion: null,
    });
    syncStoreInitialState(useShareSession);

    const markup = renderWithoutProject();

    expect(markup).toContain("Run");
    expect(markup).not.toContain("Project");
    expect(markup).not.toContain("Edit");
  });

  it("does not emit the React 19 element.ref warning on the home nav path", async () => {
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: null,
      shareSessionId: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
    });
    syncStoreInitialState(useShareSession);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<ProjectNav />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      consoleErrorSpy.mock.calls.some(([message]) =>
        String(message).includes(
          "Accessing element.ref was removed in React 19",
        ),
      ),
    ).toBe(false);
  });
});
