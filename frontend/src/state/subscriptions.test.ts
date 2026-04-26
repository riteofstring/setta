/* @vitest-environment jsdom */
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
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
  createSettingsState,
  createSingleConfig,
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
vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    setViewport: (...args: unknown[]) => routeSetViewportMock(...args),
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
      data: null,
      response: { status: 200 },
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
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: undefined,
    });
  });
  afterEach(() => {
    debouncedDispatchViewportUpdate.cancel();
  });
  it("flushes the fitted viewport immediately when auto-fit completes", async () => {
    gpuFlowViewportStore.getState().setTransform([150, 125, 0.6]);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInitDone: true,
    });
    await vi.waitFor(() => {
      expect(routeSetViewportMock).toHaveBeenCalledWith({
        body: {
          projectConfigId: "project-1",
          viewport: { x: 150, y: 125, zoom: 0.6 },
          frontendOpId: expect.any(String),
        },
      });
    });
    expect(gpuFlowViewportStore.getState().transform).toEqual([150, 125, 0.6]);
    expect(gpuFlowViewportStore.getState().fitViewOnInit).toBe(false);
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
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: undefined,
    });
    debouncedDispatchViewportUpdate.cancel();
    routeSetViewportMock.mockClear();
    usePendingOperations.setState({ pending: [] });
    gpuFlowViewportStore
      .getState()
      .setTransform([localViewport.x, localViewport.y, localViewport.zoom]);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: undefined,
    });
    expect(useProjectState.getState().projectConfig.viewport).toEqual(
      staleBackendViewport,
    );
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(routeSetViewportMock).not.toHaveBeenCalled();
    processProjectStateUpdateFromBackend({
      projectState: createSingleConfig({
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
    expect(gpuFlowViewportStore.getState().transform).toEqual([
      localViewport.x,
      localViewport.y,
      localViewport.zoom,
    ]);
    expect(useProjectState.getState().projectConfig.viewport).toEqual(
      localViewport,
    );
  });

  it("queues viewport persistence without mutating project state during gestures", () => {
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    debouncedDispatchViewportUpdate.cancel();
    routeSetViewportMock.mockClear();
    usePendingOperations.setState({ pending: [] });
    const viewportBeforeGesture =
      useProjectState.getState().projectConfig.viewport;

    gpuFlowViewportStore.getState().setTransform([10, 20, 1.25]);
    gpuFlowViewportStore.getState().setTransform([30, 40, 1.5]);

    expect(useProjectState.getState().projectConfig.viewport).toEqual(
      viewportBeforeGesture,
    );
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(routeSetViewportMock).not.toHaveBeenCalled();
  });
});
