import { debounced_route_set_top_level_section_layout } from "state/actions/sectionInfos";
import {
  useNodeInternals,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createCore, createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_set_top_level_section_layout: vi.fn(),
  };
});

describe("top-level layout snapshots", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.useFakeTimers();
    useShareSession.setState({ isShareMode: false });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("preserves top-level sections missing from node internals", async () => {
    const route_set_top_level_section_layout =
      (await import("utils/generatedEndpoints"))
        .route_set_top_level_section_layout as unknown as vi.Mock;
    route_set_top_level_section_layout.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    const projectConfigId = "layout-project";
    const sectionIdA = "section-a";
    const sectionIdB = "section-b";
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: projectConfigId });
      state.sections = {
        [sectionIdA]: createCore({
          id: sectionIdA,
          name: "A",
          variants: [],
          defaultVariant: null,
        }),
        [sectionIdB]: createCore({
          id: sectionIdB,
          name: "B",
          variants: [],
          defaultVariant: null,
        }),
      };
      state.sectionVariants = {};
      state.sectionImpls = {};
      state.previewSectionVariantMap = {};
      state.projectConfig.topLevelSections = {
        [sectionIdA]: { x: 10, y: 20, zIndex: 1, w: null, h: null },
        [sectionIdB]: { x: 300, y: 400, zIndex: 2, w: null, h: null },
      };
    });
    useNodeInternals.setState({
      x: new Map([
        [
          sectionIdA,
          {
            id: sectionIdA,
            position: { x: 50, y: 60 },
            width: 200,
            height: 150,
            zIndex: 5,
            tempZIndex: 5,
          },
        ],
      ]),
    });

    debounced_route_set_top_level_section_layout();
    await vi.runAllTimersAsync();

    expect(route_set_top_level_section_layout).toHaveBeenCalledTimes(1);
    const payload = route_set_top_level_section_layout.mock.calls[0][0];
    expect(Object.keys(payload.topLevelSections).sort()).toEqual([
      sectionIdA,
      sectionIdB,
    ]);
    expect(payload.topLevelSections[sectionIdA]).toEqual({
      x: 50,
      y: 60,
      zIndex: 5,
      w: 200,
      h: 150,
    });
    expect(payload.topLevelSections[sectionIdB]).toEqual({
      x: 300,
      y: 400,
      zIndex: 2,
      w: null,
      h: null,
    });
  });
});
