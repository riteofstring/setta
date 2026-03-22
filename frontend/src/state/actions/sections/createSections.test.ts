import { useReactFlow } from "forks/xyflow/core/store";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSingletonSections,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopLevelSection, getEmptySpacePosition } from "./createSections";

vi.mock("utils/generatedEndpoints", () => ({
  route_create_top_level_section: vi.fn(),
  route_set_section_name: vi.fn(),
}));

vi.mock("../sectionInfos", async () => {
  const actual =
    await vi.importActual<typeof import("../sectionInfos")>("../sectionInfos");
  return {
    ...actual,
    processProjectStateUpdateFromBackend: vi.fn(),
  };
});

describe("createTopLevelSection", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-alpha",
        sectionVariantMap: {},
        topLevelSections: {},
        activeIds: [],
      });
      state.singletonSections = createSingletonSections();
    });
    useReactFlow.setState({
      transform: [0, 0, 1],
      width: 1200,
      height: 800,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetProjectStores();
  });

  it("returns the created section id after a successful top-level section creation", async () => {
    const { route_create_top_level_section } = await import(
      "utils/generatedEndpoints"
    );
    const { processProjectStateUpdateFromBackend } = await import(
      "../sectionInfos"
    );

    vi.mocked(route_create_top_level_section).mockResolvedValue({
      status: 200,
      data: {
        sectionId: "section-created",
        metaControlParamId: null,
        panTo: null,
      },
      hasResponse: true,
    });

    const sectionId = await createTopLevelSection({
      implType: SectionTypeEnum.Group,
      implOverrides: null,
      position: null,
    });

    expect(sectionId).toBe("section-created");
    expect(route_create_top_level_section).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-alpha",
        implType: SectionTypeEnum.Group,
        topLevelSections: {},
        viewportBounds: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          w: expect.any(Number),
          h: expect.any(Number),
        }),
      }),
    );
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });

  it("returns null when top-level section creation fails", async () => {
    const { route_create_top_level_section } = await import(
      "utils/generatedEndpoints"
    );
    const { processProjectStateUpdateFromBackend } = await import(
      "../sectionInfos"
    );

    vi.mocked(route_create_top_level_section).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const sectionId = await createTopLevelSection({
      implType: SectionTypeEnum.Group,
      implOverrides: null,
      position: null,
    });

    expect(sectionId).toBeNull();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });

  it("falls back to a visible explicit position when viewport bounds are unavailable for an empty project", async () => {
    const { route_create_top_level_section } = await import(
      "utils/generatedEndpoints"
    );

    useReactFlow.setState({
      transform: [80, -40, 2],
      width: 0,
      height: 0,
    });

    vi.mocked(route_create_top_level_section).mockResolvedValue({
      status: 200,
      data: {
        sectionId: "section-created",
        metaControlParamId: null,
        panTo: null,
      },
      hasResponse: true,
    });

    const expectedPosition = getEmptySpacePosition();

    await createTopLevelSection({
      implType: SectionTypeEnum.Group,
      implOverrides: null,
      position: null,
    });

    expect(route_create_top_level_section).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-alpha",
        implType: SectionTypeEnum.Group,
        topLevelSections: {},
        viewportBounds: null,
        position: expectedPosition,
      }),
    );
  });
});
