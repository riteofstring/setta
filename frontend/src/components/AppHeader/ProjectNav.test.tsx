import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useLocalStorage, useSettings } from "state/definitions";
import { useShareSession } from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import { createSettingsState, type SharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useLocalStorage.setState({ darkMode: true, colorMode: "dark" });
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useLocalStorage);
  });

  afterEach(() => {
    resetProjectStores();
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
});
