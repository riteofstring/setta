/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  useAllProjectMetadata,
  useLocalStorage,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createProjectConfig,
  createSettingsState,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectConfigs } from "./ProjectConfigs";

let latestOnReorder: ((orderedIds: string[]) => void) | null = null;
let latestSortableEnabled: boolean | undefined;
let sortableHookCallCount = 0;

vi.mock("components/Pages/Project/ViewModeDnd", () => ({
  SortableListProvider: ({
    children,
    onReorder,
    enabled,
  }: {
    children: unknown;
    onReorder: (orderedIds: string[]) => void;
    enabled?: boolean;
  }) => {
    latestOnReorder = onReorder;
    latestSortableEnabled = enabled;
    return children;
  },
  useSortableListItem: () => {
    sortableHookCallCount += 1;
    return {
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      setActivatorNodeRef: () => {},
      style: {},
      isDragging: false,
    };
  },
}));

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

describe("ProjectConfigs", () => {
  let host: HTMLDivElement;
  let root: Root;
  const memoryStorage = (() => {
    let store = new Map<string, string>();
    return {
      getItem: (name: string) => store.get(name) ?? null,
      setItem: (name: string, value: string) => {
        store.set(name, value);
      },
      removeItem: (name: string) => {
        store.delete(name);
      },
      reset: () => {
        store = new Map<string, string>();
      },
    };
  })();

  beforeEach(() => {
    resetProjectStores();
    latestOnReorder = null;
    latestSortableEnabled = undefined;
    sortableHookCallCount = 0;
    memoryStorage.reset();
    useSettings.setState(createSettingsState());
    useLocalStorage.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem,
        setItem: memoryStorage.setItem,
        removeItem: memoryStorage.removeItem,
      },
    });
    useShareSession.setState({ isDeploymentMode: false, sharePolicy: null });
    useLocalStorage.setState({
      projectConfigPreviewEnabled: true,
      overviewProjectConfigOrder: [],
    });
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useLocalStorage);
    syncStoreInitialState(useShareSession);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });

  async function renderProjectConfigs() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProjectConfigs />
        </MemoryRouter>,
      );
    });
  }

  function getProjectConfigRow(projectConfigId: string): HTMLElement | null {
    return host.querySelector(`[data-project-config-id="${projectConfigId}"]`);
  }

  it("builds hover previews through the live project-config row hover path", async () => {
    const sectionId = "section-a";
    const currentVariantId = "variant-current";
    const previewVariantId = "variant-preview";
    const previewConfig = createProjectConfig({
      id: "config-preview",
      name: "Preview Config",
      sectionVariantMap: {
        [sectionId]: previewVariantId,
      },
    });
    const currentConfig = createProjectConfig({
      id: "config-current",
      name: "Current Config",
      sectionVariantMap: {
        [sectionId]: currentVariantId,
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = currentConfig;
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          variants: [currentVariantId, previewVariantId],
          defaultVariant: currentVariantId,
        }),
      };
      state.sectionVariants = {
        [currentVariantId]: createVariant({
          id: currentVariantId,
          impl: "impl-current",
        }),
        [previewVariantId]: createVariant({
          id: previewVariantId,
          impl: "impl-preview",
        }),
      };
      state.previewSectionVariantMap = {};
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: currentConfig.id,
      projectMetadata: [currentConfig, previewConfig],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAllProjectMetadata);

    await renderProjectConfigs();

    const previewRow = getProjectConfigRow(previewConfig.id);
    expect(previewRow).not.toBeNull();

    await act(async () => {
      previewRow?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(useProjectState.getState().previewSectionVariantMap).toEqual({
      [sectionId]: previewVariantId,
    });
  });

  it("suppresses hover previews while editing", async () => {
    const sectionId = "section-a";
    const currentVariantId = "variant-current";
    const previewVariantId = "variant-preview";
    const currentConfig = createProjectConfig({
      id: "config-current",
      name: "Current Config",
      sectionVariantMap: {
        [sectionId]: currentVariantId,
      },
    });
    const previewConfig = createProjectConfig({
      id: "config-preview",
      name: "Preview Config",
      sectionVariantMap: {
        [sectionId]: previewVariantId,
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = currentConfig;
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          variants: [currentVariantId, previewVariantId],
          defaultVariant: currentVariantId,
        }),
      };
      state.sectionVariants = {
        [currentVariantId]: createVariant({
          id: currentVariantId,
          impl: "impl-current",
        }),
        [previewVariantId]: createVariant({
          id: previewVariantId,
          impl: "impl-preview",
        }),
      };
      state.previewSectionVariantMap = {};
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: currentConfig.id,
      projectMetadata: [currentConfig, previewConfig],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAllProjectMetadata);

    await renderProjectConfigs();

    const editButton = host.querySelector(
      'button[title="Edit project configs"]',
    );
    expect(editButton).not.toBeNull();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const previewRow = getProjectConfigRow(previewConfig.id);
    expect(previewRow).not.toBeNull();

    await act(async () => {
      previewRow?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(useProjectState.getState().previewSectionVariantMap).toEqual({});
  });

  it("rejects hover previews for configs from a different section graph", async () => {
    const sectionId = "section-a";
    const currentVariantId = "variant-current";
    const currentConfig = createProjectConfig({
      id: "config-current",
      name: "Current Config",
      sectionVariantMap: {
        [sectionId]: currentVariantId,
      },
    });
    const incompatibleConfig = createProjectConfig({
      id: "config-foreign",
      name: "Foreign Config",
      sectionVariantMap: {
        "settings-section__backend": "settings-variant__backend",
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = currentConfig;
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          variants: [currentVariantId],
          defaultVariant: currentVariantId,
        }),
      };
      state.sectionVariants = {
        [currentVariantId]: createVariant({
          id: currentVariantId,
          impl: "impl-current",
        }),
      };
      state.previewSectionVariantMap = {};
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: currentConfig.id,
      projectMetadata: [currentConfig, incompatibleConfig],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAllProjectMetadata);

    await renderProjectConfigs();

    const incompatibleRow = getProjectConfigRow(incompatibleConfig.id);
    expect(incompatibleRow).not.toBeNull();

    await act(async () => {
      incompatibleRow?.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });

    expect(useProjectState.getState().previewSectionVariantMap).toEqual({});
  });

  it("renders project config rows using persisted order", () => {
    const configA = createProjectConfig({
      id: "config-a",
      name: "Config Alpha",
    });
    const configB = createProjectConfig({
      id: "config-b",
      name: "Config Beta",
    });

    useProjectState.setState((state) => {
      state.projectConfig = configA;
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: configA.id,
      projectMetadata: [configA, configB],
    });
    useLocalStorage.setState({
      overviewProjectConfigOrder: [configB.id, configA.id],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAllProjectMetadata);
    syncStoreInitialState(useLocalStorage);

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ProjectConfigs />
      </MemoryRouter>,
    );
    const betaIndex = markup.indexOf("Config Beta");
    const alphaIndex = markup.indexOf("Config Alpha");

    expect(betaIndex).toBeGreaterThanOrEqual(0);
    expect(alphaIndex).toBeGreaterThanOrEqual(0);
    expect(betaIndex).toBeLessThan(alphaIndex);
    expect(latestSortableEnabled).toBe(true);
    expect(sortableHookCallCount).toBeGreaterThan(0);
  });

  it("dedupes duplicate ids from persisted order through the live component state", async () => {
    const configA = createProjectConfig({
      id: "config-a",
      name: "Config Alpha",
    });
    const configB = createProjectConfig({
      id: "config-b",
      name: "Config Beta",
    });

    useProjectState.setState((state) => {
      state.projectConfig = configA;
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: configA.id,
      projectMetadata: [configA, configB],
    });
    useLocalStorage.setState({
      overviewProjectConfigOrder: [configA.id, configA.id],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAllProjectMetadata);
    syncStoreInitialState(useLocalStorage);

    await renderProjectConfigs();

    expect(useLocalStorage.getState().overviewProjectConfigOrder).toEqual([
      configA.id,
      configB.id,
    ]);
  });

  it("ignores reorder callbacks in read-only mode", () => {
    const configA = createProjectConfig({
      id: "config-a",
      name: "Config Alpha",
    });
    const configB = createProjectConfig({
      id: "config-b",
      name: "Config Beta",
    });

    useShareSession.setState({ isDeploymentMode: true });
    useProjectState.setState((state) => {
      state.projectConfig = configA;
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: configA.id,
      projectMetadata: [configA, configB],
    });
    useLocalStorage.setState({
      overviewProjectConfigOrder: [configA.id, configB.id],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAllProjectMetadata);
    syncStoreInitialState(useLocalStorage);
    syncStoreInitialState(useShareSession);

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ProjectConfigs />
      </MemoryRouter>,
    );
    expect(markup).toContain(
      'data-testid="overview-project-config-drag-handle"',
    );
    expect(markup).toContain('class="text-transparent"');
    expect(latestSortableEnabled).toBe(false);
    expect(sortableHookCallCount).toBe(0);

    if (!latestOnReorder) {
      throw new Error(
        "Sortable provider did not receive an onReorder handler.",
      );
    }
    latestOnReorder([configB.id, configA.id]);

    expect(useLocalStorage.getState().overviewProjectConfigOrder).toEqual([
      configA.id,
      configB.id,
    ]);
  });

  it("does not rewrite persisted order in deployment mode", () => {
    const configA = createProjectConfig({
      id: "config-a",
      name: "Config Alpha",
    });
    const configB = createProjectConfig({
      id: "config-b",
      name: "Config Beta",
    });

    useShareSession.setState({ isDeploymentMode: true });
    useProjectState.setState((state) => {
      state.projectConfig = configA;
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: configA.id,
      projectMetadata: [configA, configB],
    });
    useLocalStorage.setState({
      overviewProjectConfigOrder: [],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAllProjectMetadata);
    syncStoreInitialState(useLocalStorage);
    syncStoreInitialState(useShareSession);

    renderToStaticMarkup(
      <MemoryRouter>
        <ProjectConfigs />
      </MemoryRouter>,
    );

    expect(useLocalStorage.getState().overviewProjectConfigOrder).toEqual([]);
  });

  it("does not clear persisted order while project metadata is still loading", () => {
    const configA = createProjectConfig({
      id: "config-a",
      name: "Config Alpha",
    });
    const configB = createProjectConfig({
      id: "config-b",
      name: "Config Beta",
    });

    useProjectState.setState((state) => {
      state.projectConfig = configA;
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: configA.id,
      projectMetadata: [],
    });
    useLocalStorage.setState({
      overviewProjectConfigOrder: [configB.id, configA.id],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAllProjectMetadata);
    syncStoreInitialState(useLocalStorage);

    renderToStaticMarkup(
      <MemoryRouter>
        <ProjectConfigs />
      </MemoryRouter>,
    );

    expect(useLocalStorage.getState().overviewProjectConfigOrder).toEqual([
      configB.id,
      configA.id,
    ]);
  });
});
