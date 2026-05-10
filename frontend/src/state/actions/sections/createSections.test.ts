import type { Node } from "gpuFlow/flowTypes";
import { gpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { useNodeInternals, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createSingletonSections,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTopLevelSection as createTopLevelSectionAction,
  getEmptySpacePosition,
  openFileInCodeSection,
} from "./createSections";

const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);

vi.mock("openapi/http", () => ({
  createTopLevelSection: vi.fn(),
  setSectionName: vi.fn(),
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
  };
});

vi.mock("utils/tabbingLogic", () => ({
  focusOnSectionSearch: vi.fn(),
  focusOnSectionTextInput: vi.fn(),
}));

vi.mock("./sectionPositions", () => ({
  goToSection: vi.fn(),
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
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setViewportSize({
      height: 800,
      width: 1200,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
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
  it("uses renderer layout nodes for smart-placement top-level section snapshots", async () => {
    const { createTopLevelSection: createTopLevelSectionRequest } =
      await import("openapi/http");
    vi.mocked(createTopLevelSectionRequest).mockResolvedValue({
      status: 200,
      data: {
        sectionId: "section-created",
        metaControlParamId: null,
        panTo: null,
      },
      hasResponse: true,
    });
    useProjectState.setState((state) => {
      state.sections["section-live"] = createCore({
        id: "section-live",
        variants: ["variant-live"],
        defaultVariant: "variant-live",
      });
      state.sections["section-durable"] = createCore({
        id: "section-durable",
        variants: ["variant-durable"],
        defaultVariant: "variant-durable",
      });
      state.projectConfig.topLevelSections = {
        "section-live": { x: 1, y: 2, zIndex: 1, w: 120, h: 80 },
        "section-durable": { x: 40, y: 50, zIndex: 2, w: null, h: null },
      };
    });
    useNodeInternals.setState({
      x: new Map<string, Node>([
        [
          "section-live",
          {
            height: 444,
            id: "section-live",
            position: { x: 999, y: 888 },
            tempZIndex: 9,
            width: 333,
            zIndex: 9,
          },
        ],
      ]),
    });
    gpuFlowLayoutStore.getState().replaceNodes(
      [
        {
          height: 180,
          nodeId: "section-live",
          tempZIndex: 6,
          width: 240,
          x: 10,
          y: 20,
          zIndex: 5,
        },
      ],
      { reason: "project-sync" },
    );

    await createTopLevelSectionAction({
      implType: SectionTypeEnum.Group,
      implOverrides: null,
      position: null,
    });

    expect(createTopLevelSectionRequest).toHaveBeenCalledWith({
      body: expect.objectContaining({
        topLevelSections: {
          "section-live": { x: 10, y: 20, zIndex: 5, w: 240, h: 180 },
          "section-durable": { x: 40, y: 50, zIndex: 2, w: null, h: null },
        },
      }),
    });
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
    gpuFlowViewportStore.getState().setTransform([80, -40, 2]);
    gpuFlowViewportStore.getState().setViewportSize({
      height: 0,
      width: 0,
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
  it("reuses an existing code section for the same file path", async () => {
    const {
      createTopLevelSection: createTopLevelSectionRequest,
      setSectionName,
    } = await import("openapi/http");
    const { goToSection } = await import("./sectionPositions");
    seedExistingCodeSection("/tmp/example.py");
    const sectionId = await openFileInCodeSection({
      filePath: "/tmp/example.py",
      fileName: "example.py",
      codeLanguage: "python",
    });
    expect(sectionId).toBe("section-existing");
    expect(createTopLevelSectionRequest).not.toHaveBeenCalled();
    expect(setSectionName).not.toHaveBeenCalled();
    expect(goToSection).toHaveBeenCalledWith("section-existing");
  });
  it("creates, names, and focuses a new code section for an unopened file", async () => {
    const {
      createTopLevelSection: createTopLevelSectionRequest,
      setSectionName,
    } = await import("openapi/http");
    const { goToSection } = await import("./sectionPositions");
    vi.mocked(createTopLevelSectionRequest).mockResolvedValue({
      status: 200,
      data: {
        sectionId: "section-created",
        metaControlParamId: null,
        panTo: null,
      },
      hasResponse: true,
    });
    vi.mocked(setSectionName).mockResolvedValue({
      status: 200,
      data: undefined,
      hasResponse: true,
    });
    const sectionId = await openFileInCodeSection({
      filePath: "/tmp/new-file.py",
      fileName: "new-file.py",
      codeLanguage: "python",
    });
    expect(sectionId).toBe("section-created");
    expect(createTopLevelSectionRequest).toHaveBeenCalledWith({
      body: expect.objectContaining({
        projectConfigId: "project-alpha",
        implType: SectionTypeEnum.Code,
      }),
    });
    expect(setSectionName).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-alpha",
        sectionId: "section-created",
        name: "new-file_py",
      },
    });
    expect(goToSection).toHaveBeenCalledWith("section-created");
  });
});

function seedExistingCodeSection(
  filePath: string,
  sectionId = "section-existing",
) {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  useProjectState.setState((state) => {
    state.projectConfig.sectionVariantMap[sectionId] = variantId;
    state.projectConfig.topLevelSections[sectionId] = { x: 0, y: 0, zIndex: 0 };
    state.sections[sectionId] = createCore({
      id: sectionId,
      variants: [variantId],
      defaultVariant: variantId,
    });
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
    });
    state.sectionImpls[implId] = createCodeSectionImpl({
      id: implId,
      codeFileBinding: {
        canonical_path: filePath,
        access_mode: "read_write",
      },
    });
    state.parentSectionMap[sectionId] = null;
  });
}
