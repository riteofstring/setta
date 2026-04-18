/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  useDrawAreaLayerItemTransform,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ArtifactTypeEnum,
  SectionTypeEnum,
  createBaseSectionImpl,
  createCore,
  createDrawAreaLayer,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddArtifactByFilepath } from "./AddArtifactByFilepath";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const addArtifactMocks = vi.hoisted(() => ({
  appendDrawAreaLayerItemMock: vi.fn(),
  openDropzoneFilePickerModalMock: vi.fn(),
  queueTransformsForSaveMock: vi.fn(),
  setChartAreaDataPathMock: vi.fn(),
  setImageAreaImagePathMock: vi.fn(),
}));

vi.mock("components/Utils/atoms/menubar/menudropdownitem", () => ({
  MenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("openapi/http", () => ({
  appendDrawAreaLayerItem: addArtifactMocks.appendDrawAreaLayerItemMock,
  setChartAreaDataPath: addArtifactMocks.setChartAreaDataPathMock,
  setImageAreaImagePath: addArtifactMocks.setImageAreaImagePathMock,
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: <T,>(value: T) => value,
}));

vi.mock("state/actions/artifacts", () => ({
  queueTransformsForSave: addArtifactMocks.queueTransformsForSaveMock,
}));

vi.mock("state/actions/modal", () => ({
  openDropzoneFilePickerModal: addArtifactMocks.openDropzoneFilePickerModalMock,
}));

function renderComponent(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<AddArtifactByFilepath sectionId={sectionId} />);
  });

  return { host, root };
}

function setupSectionState({
  sectionId,
  variantId,
  implId,
  impl,
  sharedModifier = {},
}: {
  sectionId: string;
  variantId: string;
  implId: string;
  impl: ReturnType<typeof createBaseSectionImpl>;
  sharedModifier?: Record<string, unknown>;
}) {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Section",
        variants: [variantId],
        defaultVariant: variantId,
        sharedModifier: sharedModifier as never,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        impl: implId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {};
    state.sectionImpls[implId] = impl;
  });
}

function getLatestPickerRequest() {
  const calls = addArtifactMocks.openDropzoneFilePickerModalMock.mock.calls;
  const request = calls[calls.length - 1]?.[0];
  if (!request) {
    throw new Error("Expected file picker request");
  }
  return request as {
    title: string;
    remainingSlots: number | null;
    onPickPaths: (paths: string[]) => void;
  };
}

describe("AddArtifactByFilepath", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    resetProjectStores();
    addArtifactMocks.appendDrawAreaLayerItemMock.mockReset();
    addArtifactMocks.openDropzoneFilePickerModalMock.mockReset();
    addArtifactMocks.queueTransformsForSaveMock.mockReset();
    addArtifactMocks.setChartAreaDataPathMock.mockReset();
    addArtifactMocks.setImageAreaImagePathMock.mockReset();
    addArtifactMocks.appendDrawAreaLayerItemMock.mockResolvedValue({
      status: 200,
      data: null,
    });
    addArtifactMocks.setChartAreaDataPathMock.mockResolvedValue({
      status: 200,
      data: null,
    });
    addArtifactMocks.setImageAreaImagePathMock.mockResolvedValue({
      status: 200,
      data: null,
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
    resetProjectStores();
  });

  it("opens the current picker and updates image sections through the image-path route", async () => {
    const sectionId = "image-section";
    const variantId = "image-variant";
    const implId = "image-impl";

    setupSectionState({
      sectionId,
      variantId,
      implId,
      impl: createBaseSectionImpl({
        id: implId,
        type: SectionTypeEnum.Image,
      }),
    });
    ({ host, root } = renderComponent(sectionId));

    await act(async () => {
      host?.querySelector("button")?.click();
    });

    const pickerRequest = getLatestPickerRequest();
    expect(pickerRequest.title).toBe("Add Artifact by Filepath");
    expect(pickerRequest.remainingSlots).toBe(1);

    await act(async () => {
      pickerRequest.onPickPaths(["  assets/example.png  "]);
      await Promise.resolve();
    });

    const imageImpl = getCurrEffectiveSectionImpl(
      useProjectState.getState(),
      sectionId,
    ) as Record<string, unknown>;
    expect(imageImpl["imagePath"]).toBe("assets/example.png");
    expect(addArtifactMocks.setImageAreaImagePathMock).toHaveBeenCalledWith({
      body: expect.objectContaining({
        projectConfigId: "project-1",
        sectionId,
        imagePath: "assets/example.png",
      }),
    });
  });

  it("appends draw image artifacts through the draw layer and transform owner paths", async () => {
    const sectionId = "draw-section";
    const variantId = "draw-variant";
    const implId = "draw-impl";

    setupSectionState({
      sectionId,
      variantId,
      implId,
      impl: createBaseSectionImpl({
        id: implId,
        type: SectionTypeEnum.Draw,
      }),
      sharedModifier: {
        activeLayerIdx: 0,
        layers: [createDrawAreaLayer()],
      },
    });
    ({ host, root } = renderComponent(sectionId));

    await act(async () => {
      host?.querySelector("button")?.click();
    });

    const pickerRequest = getLatestPickerRequest();

    await act(async () => {
      pickerRequest.onPickPaths(["artifacts/sketch.png"]);
      await Promise.resolve();
    });

    const drawImpl = getCurrEffectiveSectionImpl(
      useProjectState.getState(),
      sectionId,
    ) as Record<string, unknown>;
    const projectState = useProjectState.getState();
    const layers = drawImpl["layers"] as Array<Record<string, unknown>>;
    const firstLayer = layers[0];
    const elements = firstLayer?.["elements"] as Array<Record<string, unknown>>;
    const layerItem = elements[0];
    expect(layerItem).toBeDefined();
    if (!layerItem) {
      throw new Error("Expected a draw layer item to be added");
    }
    expect(layerItem?.type).toBe(ArtifactTypeEnum.Image);
    expect(layerItem?.dataPath).toBe("artifacts/sketch.png");
    expect(layerItem?.transformId).toBeTruthy();
    expect(projectState.sections[sectionId]?.sharedModifier).not.toHaveProperty(
      "layers",
    );
    expect(
      (projectState.sectionImpls[implId] as Record<string, unknown>)["layers"],
    ).toEqual(layers);

    expect(
      useDrawAreaLayerItemTransform.getState().x[layerItem.transformId],
    ).toEqual(
      expect.objectContaining({
        id: layerItem.transformId,
      }),
    );
    expect(addArtifactMocks.queueTransformsForSaveMock).toHaveBeenCalledWith([
      layerItem.transformId,
    ]);
    expect(addArtifactMocks.appendDrawAreaLayerItemMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-1",
        sectionId,
        layerIdx: 0,
        element: layerItem,
      },
    });
  });
});
