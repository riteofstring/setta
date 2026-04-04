/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialState from "forks/xyflow/core/store/initialState";
import {
  debouncedDispatchViewportUpdate,
  processProjectStateUpdateFromBackend,
} from "state/actions/sectionInfos";
import {
  usePendingOperations,
  useProjectState,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createProjectStateSingleConfig,
  createSettingsState,
  createSingletonSections,
} from "utils/generatedTypes";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { subscribe } from "./subscriptions";

const routeSetViewportMock = vi.fn();

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_set_viewport: (...args: unknown[]) => routeSetViewportMock(...args),
  };
});

let subscriptionsInstalled = false;

function ensureSubscriptionsInstalled() {
  if (subscriptionsInstalled) {
    return;
  }
  subscribe();
  subscriptionsInstalled = true;
}

describe("subscriptions viewport persistence", () => {
  beforeAll(() => {
    ensureSubscriptionsInstalled();
  });

  beforeEach(() => {
    resetProjectStores();
    debouncedDispatchViewportUpdate.cancel();
    routeSetViewportMock.mockReset();
    routeSetViewportMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    useSettings.setState(createSettingsState());
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        viewport: null,
        viewportInitialized: false,
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useReactFlow.setState({
      ...initialState,
      transform: [0, 0, 1],
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });
  });

  afterEach(() => {
    debouncedDispatchViewportUpdate.cancel();
  });

  it("flushes the fitted viewport immediately when auto-fit completes", async () => {
    useReactFlow.setState({
      transform: [150, 125, 0.6],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    await vi.waitFor(() => {
      expect(routeSetViewportMock).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        viewport: { x: 150, y: 125, zoom: 0.6 },
        frontendOpId: expect.any(String),
      });
    });
  });

  it("keeps the local viewport when a backend update arrives before the debounced write flushes", () => {
    const localViewport = { x: 160, y: 120, zoom: 0.6 };
    const staleBackendViewport = { x: 0, y: 0, zoom: 1 };

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        viewport: staleBackendViewport,
        viewportInitialized: true,
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    useReactFlow.setState({
      ...initialState,
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
    debouncedDispatchViewportUpdate.cancel();
    routeSetViewportMock.mockClear();
    usePendingOperations.setState({ pending: [] });

    useReactFlow.setState({
      transform: [localViewport.x, localViewport.y, localViewport.zoom],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    expect(useProjectState.getState().projectConfig.viewport).toEqual(
      localViewport,
    );
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(routeSetViewportMock).not.toHaveBeenCalled();

    processProjectStateUpdateFromBackend({
      projectState: createProjectStateSingleConfig({
        projectConfig: createProjectConfig({
          id: "project-1",
          viewport: staleBackendViewport,
          viewportInitialized: true,
        }),
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      }),
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(useReactFlow.getState().transform).toEqual([
      localViewport.x,
      localViewport.y,
      localViewport.zoom,
    ]);
    expect(useProjectState.getState().projectConfig.viewport).toEqual(
      localViewport,
    );
  });
});
