import { useReactFlow } from "forks/xyflow/core/store";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSingletonSections,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTopLevelSection as createTopLevelSectionAction,
  getEmptySpacePosition,
} from "./createSections";

const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);

vi.mock("openapi/http", () => ({
  createTopLevelSection: vi.fn(),
  setSectionName: vi.fn(),
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
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
    callOpenAPIMock.mockClear();
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
    const { createTopLevelSection: createTopLevelSectionRequest } =
      await import("openapi/http");
    const { processProjectStateUpdateFromBackend } = await import(
      "../sectionInfos"
    );
    vi.mocked(createTopLevelSectionRequest).mockResolvedValue({
      status: 200,
      data: {
        sectionId: "section-created",
        metaControlParamId: null,
        panTo: null,
      },
      hasResponse: true,
    });
    const sectionId = await createTopLevelSectionAction({
      implType: SectionTypeEnum.Group,
      implOverrides: null,
      position: null,
    });
    expect(sectionId).toBe("section-created");
    expect(createTopLevelSectionRequest).toHaveBeenCalledWith({
      body: expect.objectContaining({
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
    });
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
  it("returns null when top-level section creation fails", async () => {
    const { createTopLevelSection: createTopLevelSectionRequest } =
      await import("openapi/http");
    const { processProjectStateUpdateFromBackend } = await import(
      "../sectionInfos"
    );
    vi.mocked(createTopLevelSectionRequest).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });
    const sectionId = await createTopLevelSectionAction({
      implType: SectionTypeEnum.Group,
      implOverrides: null,
      position: null,
    });
    expect(sectionId).toBeNull();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
  it("falls back to a visible explicit position when viewport bounds are unavailable for an empty project", async () => {
    const { createTopLevelSection: createTopLevelSectionRequest } =
      await import("openapi/http");
    useReactFlow.setState({
      transform: [80, -40, 2],
      width: 0,
      height: 0,
    });
    vi.mocked(createTopLevelSectionRequest).mockResolvedValue({
      status: 200,
      data: {
        sectionId: "section-created",
        metaControlParamId: null,
        panTo: null,
      },
      hasResponse: true,
    });
    const expectedPosition = getEmptySpacePosition();
    await createTopLevelSectionAction({
      implType: SectionTypeEnum.Group,
      implOverrides: null,
      position: null,
    });
    expect(createTopLevelSectionRequest).toHaveBeenCalledWith({
      body: expect.objectContaining({
        projectConfigId: "project-alpha",
        implType: SectionTypeEnum.Group,
        topLevelSections: {},
        viewportBounds: null,
        position: expectedPosition,
      }),
    });
  });
});
