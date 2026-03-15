import { useReactFlow } from "forks/xyflow/core/store";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createProjectStateSingleConfig,
  type ViewModeConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncViewportFromProjectState } from "./sectionProjectStateViewportSync";

function seedCurrentProjectConfig(
  projectConfig: ReturnType<typeof createProjectConfig>,
) {
  useProjectState.setState({
    ...createProjectStateSingleConfig({
      projectConfig,
    }),
    previewSectionVariantMap: {},
  });
}

describe("sectionProjectStateViewportSync", () => {
  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("applies an explicit backend viewport to the react-flow store", () => {
    const initialConfig = createProjectConfig({
      id: "project-1",
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportInitialized: true,
    });
    seedCurrentProjectConfig(initialConfig);

    const shouldRequestFitView = syncViewportFromProjectState(
      createProjectStateSingleConfig({
        projectConfig: createProjectConfig({
          id: "project-1",
          viewport: { x: 20, y: -10, zoom: 1.5 },
          viewportInitialized: true,
        }),
      }),
    );

    expect(shouldRequestFitView).toBe(false);
    expect(useReactFlow.getState().transform).toEqual([20, -10, 1.5]);
    expect(useReactFlow.getState().fitViewOnInit).toBe(false);
  });

  it("requests fit-view when the backend clears viewport state for a visible view mode", () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const viewMode: ViewModeConfig = {
      id: viewModeId,
      name: "Visible View",
      sortIndex: 0,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: {
        [sectionVisible]: true,
        [sectionHidden]: false,
      },
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
    };

    seedCurrentProjectConfig(
      createProjectConfig({
        id: "project-1",
        topLevelSections: {
          [sectionVisible]: { ...layout },
          [sectionHidden]: { ...layout },
        },
        viewModes: { [viewModeId]: viewMode },
        activeViewModeId: viewModeId,
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportInitialized: true,
      }),
    );

    const shouldRequestFitView = syncViewportFromProjectState(
      createProjectStateSingleConfig({
        projectConfig: createProjectConfig({
          id: "project-1",
          topLevelSections: {
            [sectionVisible]: { ...layout },
            [sectionHidden]: { ...layout },
          },
          viewModes: { [viewModeId]: viewMode },
          activeViewModeId: viewModeId,
          viewport: null,
          viewportInitialized: false,
        }),
      }),
    );

    expect(shouldRequestFitView).toBe(true);
    expect(useReactFlow.getState().fitViewOnInit).toBe(true);
    expect(useReactFlow.getState().fitViewOnInitDone).toBe(false);
    expect(useReactFlow.getState().fitViewOnInitOptions?.nodes).toEqual([
      { id: sectionVisible },
    ]);
  });
});
