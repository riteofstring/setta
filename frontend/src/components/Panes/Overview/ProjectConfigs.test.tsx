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
import { createProjectConfig, createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeProjectConfigOrder, ProjectConfigs } from "./ProjectConfigs";

let latestOnReorder: ((orderedIds: string[]) => void) | null = null;

vi.mock("components/Pages/Project/ViewModeDnd", () => ({
  SortableListProvider: ({
    children,
    onReorder,
  }: {
    children: unknown;
    onReorder: (orderedIds: string[]) => void;
  }) => {
    latestOnReorder = onReorder;
    return children;
  },
  useSortableListItem: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    style: {},
    isDragging: false,
  }),
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
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("merges persisted project-config order with incoming metadata ids", () => {
    expect(
      mergeProjectConfigOrder(
        ["config-a", "config-b", "config-c"],
        ["config-c", "config-a"],
      ),
    ).toEqual(["config-c", "config-a", "config-b"]);
  });

  it("dedupes duplicate ids from persisted project-config order", () => {
    expect(
      mergeProjectConfigOrder(
        ["config-a", "config-b"],
        ["config-a", "config-a"],
      ),
    ).toEqual(["config-a", "config-b"]);
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
});
