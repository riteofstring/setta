/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  useAllProjectMetadata,
  useHomeFileBrowserState,
  useHomePageSearch,
  useLocalStorage,
  useProjectLoading,
  useShareSession,
} from "state/definitions";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAndGoToProjectConfigMock,
  loadAllProjectMetadataMock,
  navigateMock,
} = vi.hoisted(() => ({
  createAndGoToProjectConfigMock: vi.fn(),
  loadAllProjectMetadataMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("components/Panes/Overview/FileBrowser/FileBrowserPane", () => ({
  FileBrowserPane: () => <div data-testid="mock-home-file-browser-pane" />,
}));

vi.mock("components/Utils/CodeMirror/InlineCodeMirrorInput", () => ({
  InlineCodeMirrorInput: ({
    id,
    value,
    onBlur,
    onChange,
  }: {
    id: string;
    value: string;
    onBlur?: (value: string) => void;
    onChange: (value: string) => void;
  }) => (
    <input
      data-testid={id}
      value={value}
      onBlur={() => onBlur?.(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("components/Utils/GridWrapper", () => ({
  GridWrapper: ({
    children,
  }: {
    children: React.ReactNode;
    gridStyles?: string;
  }) => <div data-testid="mock-grid-wrapper">{children}</div>,
}));

vi.mock("components/Utils/PaneContainer", () => ({
  PaneContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-pane-container">{children}</div>
  ),
}));

vi.mock("state/actions/project/loadProject", () => ({
  loadAllProjectMetadata: loadAllProjectMetadataMock,
  useCreateAndGoToProjectConfig: () => createAndGoToProjectConfigMock,
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { HomePage } from "./HomePage";

type StoreWithState<TState> = {
  getInitialState?: () => TState;
  getState: () => TState;
};

type RenderedPage = {
  host: HTMLDivElement;
  root: Root;
};

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

let renderedPage: RenderedPage | null = null;

function syncStoreInitialState<TState extends object>(
  store: StoreWithState<TState>,
) {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

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

async function flushHomePage(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderHomePage(): Promise<RenderedPage> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
  });
  await flushHomePage();

  const rendered = { host, root };
  renderedPage = rendered;
  return rendered;
}

async function unmountHomePage(rendered: RenderedPage | null): Promise<void> {
  if (!rendered) {
    return;
  }
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

function getElementByTestId<T extends HTMLElement>(
  host: HTMLElement,
  testId: string,
): T {
  const element = host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`Missing element with data-testid=${testId}`);
  }
  return element as T;
}

function queryElementByTestId<T extends HTMLElement>(
  host: HTMLElement,
  testId: string,
): T | null {
  return host.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  ) as T | null;
}

function getProjectListRow(
  host: HTMLElement,
  projectName: string,
): HTMLElement {
  const rows = Array.from(
    host.querySelectorAll<HTMLElement>('[data-testid="home-project-list-row"]'),
  );
  const row = rows.find((candidate) =>
    candidate.textContent?.includes(projectName),
  );
  if (!row) {
    throw new Error(`Missing project list row for ${projectName}`);
  }
  return row;
}

async function clickElement(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
  await flushHomePage();
}

async function dispatchKeyboardEvent(
  element: HTMLElement,
  init: KeyboardEventInit,
): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ...init }),
    );
  });
  await flushHomePage();
}

async function updateInputValue(
  element: HTMLInputElement,
  value: string,
): Promise<void> {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flushHomePage();
}

async function setWindowWidth(width: number): Promise<void> {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
}

function resetStoreWithSnapshot<TState extends { reset?: () => void }>(
  store: StoreWithState<TState>,
) {
  store.getState().reset?.();
  syncStoreInitialState(store);
}

function seedHomePageStores({
  isDeploymentMode = false,
  favoriteProjectConfigIds = [],
  homeProjectGalleryViewMode = "list" as "thumbnails" | "list",
  homeWorkspacePaneVis = false,
  homeSelectedProjectPaneVis = true,
  projects = [
    createProjectConfig({
      id: "project-a",
      name: "Alpha Project",
      topLevelSections: {
        sectionA: { x: 0, y: 0, w: null, h: null },
        sectionB: { x: 1, y: 1, w: 120, h: 80 },
      },
    }),
    createProjectConfig({
      id: "project-b",
      name: "Beta Project",
    }),
    createProjectConfig({
      id: "project-c",
      name: "Gamma Project",
    }),
  ],
}: {
  isDeploymentMode?: boolean;
  favoriteProjectConfigIds?: Array<string>;
  homeProjectGalleryViewMode?: "thumbnails" | "list";
  homeWorkspacePaneVis?: boolean;
  homeSelectedProjectPaneVis?: boolean;
  projects?: ReturnType<typeof createProjectConfig>[];
} = {}) {
  useShareSession.setState({
    isDeploymentMode,
    shareSessionId: null,
    sessionRunCount: 0,
    sharePolicy: null,
    shareDeploymentName: null,
    shareDeploymentVersion: null,
    deploymentMode: isDeploymentMode ? "share" : null,
  });
  syncStoreInitialState(useShareSession);

  useAllProjectMetadata.setState({
    defaultProjectConfigId: "project-b",
    projectMetadata: projects,
  });
  syncStoreInitialState(useAllProjectMetadata);

  useHomePageSearch.setState({ value: "" });
  syncStoreInitialState(useHomePageSearch);

  useHomeFileBrowserState.setState({
    rootPath: "/workspace",
    selectedPath: "/workspace",
    expandedPaths: { "/workspace": true },
    filterText: "",
    pathSeparator: "/",
    ignorePatterns: [],
    typeFilters: { ...useHomeFileBrowserState.getState().typeFilters },
    searchScope: "recursive",
  });
  syncStoreInitialState(useHomeFileBrowserState);

  useLocalStorage.setState({
    ...useLocalStorage.getState(),
    favoriteProjectConfigIds,
    homeProjectGalleryViewMode,
    homeWorkspacePaneVis,
    homeWorkspacePaneWidth: 320,
    homeWorkspacePaneTrueWidth: 320,
    homeSelectedProjectPaneVis,
    homeSelectedProjectPaneWidth: 280,
    homeSelectedProjectPaneTrueWidth: 280,
  });
  syncStoreInitialState(useLocalStorage);
}

describe("HomePage component behavior", () => {
  beforeEach(async () => {
    setReactActEnvironment(true);
    if (typeof window.localStorage?.removeItem === "function") {
      window.localStorage.removeItem("setta_data");
    }
    navigateMock.mockReset();
    createAndGoToProjectConfigMock.mockReset();
    loadAllProjectMetadataMock.mockReset();
    loadAllProjectMetadataMock.mockResolvedValue(true);

    resetStoreWithSnapshot(useAllProjectMetadata);
    resetStoreWithSnapshot(useHomeFileBrowserState);
    resetStoreWithSnapshot(useHomePageSearch);
    resetStoreWithSnapshot(useLocalStorage);
    resetStoreWithSnapshot(useProjectLoading);
    resetStoreWithSnapshot(useShareSession);

    await setWindowWidth(1400);
  });

  afterEach(async () => {
    await unmountHomePage(renderedPage);
    renderedPage = null;
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("renders favourite and non-favourite sections and selected project details through the live page", async () => {
    seedHomePageStores({
      favoriteProjectConfigIds: ["project-a"],
    });

    const { host } = await renderHomePage();

    expect(host.textContent).toContain("Favourites");
    expect(host.textContent).toContain("Other Projects");

    const details = getElementByTestId(host, "home-selected-project-details");
    expect(details.textContent).toContain("Alpha Project");
    expect(details.textContent).toContain("Default: No");
    expect(details.textContent).toContain("Sections: 2");
  });

  it("keeps selected project details on a filtered-out selection and falls back to the next active project after clearing selection", async () => {
    seedHomePageStores({
      favoriteProjectConfigIds: ["project-a"],
    });

    const { host } = await renderHomePage();
    const betaRow = getProjectListRow(host, "Beta Project");
    await clickElement(betaRow);

    const searchInput = host.querySelector<HTMLInputElement>(
      'input[placeholder="Filter Workspace Projects"]',
    );
    if (!searchInput) {
      throw new Error("Missing home page search input");
    }
    await updateInputValue(searchInput, "Alpha");

    const details = getElementByTestId(host, "home-selected-project-details");
    expect(details.textContent).toContain("Beta Project");

    const layout = getElementByTestId(host, "home-file-manager-layout");
    await dispatchKeyboardEvent(layout, { code: "Escape" });

    expect(details.textContent).toContain("Alpha Project");
  });

  it("shows the compact settings link only on compact non-deployment layout", async () => {
    await setWindowWidth(1000);
    seedHomePageStores({
      homeWorkspacePaneVis: true,
      homeSelectedProjectPaneVis: true,
    });

    const { host } = await renderHomePage();

    expect(
      queryElementByTestId(host, "home-compact-settings-link"),
    ).not.toBeNull();
    expect(queryElementByTestId(host, "home-left-icon-rail")).toBeNull();
    expect(queryElementByTestId(host, "home-right-icon-rail")).toBeNull();
  });

  it("opens project rows on Space only when selection is disabled", async () => {
    seedHomePageStores();

    const rendered = await renderHomePage();
    const nonDeploymentRow = getProjectListRow(rendered.host, "Alpha Project");

    await dispatchKeyboardEvent(nonDeploymentRow, { key: " " });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(nonDeploymentRow.getAttribute("aria-pressed")).toBe("true");

    await unmountHomePage(rendered);
    renderedPage = null;
    navigateMock.mockReset();

    seedHomePageStores({
      isDeploymentMode: true,
      favoriteProjectConfigIds: [],
      homeSelectedProjectPaneVis: false,
    });

    const deploymentRendered = await renderHomePage();
    const deploymentRow = getProjectListRow(
      deploymentRendered.host,
      "Alpha Project",
    );

    await dispatchKeyboardEvent(deploymentRow, { key: " " });

    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it("applies home file browser path changes only for real updates through the rendered controls", async () => {
    seedHomePageStores({
      homeWorkspacePaneVis: true,
      homeSelectedProjectPaneVis: false,
    });

    const { host } = await renderHomePage();
    const pathInput = getElementByTestId<HTMLInputElement>(
      host,
      "CodeMirror-home-browser-path",
    );
    const goButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Go",
    );
    if (!goButton) {
      throw new Error("Missing home file browser Go button");
    }

    await updateInputValue(pathInput, "");
    await clickElement(goButton);

    expect(useHomeFileBrowserState.getState().rootPath).toBe("/workspace");

    await updateInputValue(pathInput, "/workspace/new");
    await clickElement(goButton);

    expect(useHomeFileBrowserState.getState().rootPath).toBe("/workspace/new");
    expect(useHomeFileBrowserState.getState().selectedPath).toBe(
      "/workspace/new",
    );
    expect(useHomeFileBrowserState.getState().expandedPaths).toEqual({
      "/workspace/new": true,
    });
  });
});
