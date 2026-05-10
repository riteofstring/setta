/* @vitest-environment jsdom */

import {
  downloadBinary,
  loadCachedChartData,
  loadCachedImageArtifacts,
} from "openapi/http";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useChartData,
  useDecodedImages,
  useImages,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  ArtifactTypeEnum,
  SectionTypeEnum,
  createChartDataArtifact,
  createContentRef,
  createCore,
  createImageArtifact,
  createLineChartSettings,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeExistingRawImages,
  useImageArtifact,
  useLoadedChartData,
} from "./artifacts";

const openAPIMocks = vi.hoisted(() => ({
  loadCachedBrushStrokes: vi.fn(),
  loadCachedChartData: vi.fn(),
  loadCachedDrawAreaLayerItemTransform: vi.fn(),
  loadCachedImageArtifacts: vi.fn(),
}));

const { downloadBinaryMock } = vi.hoisted(() => ({
  downloadBinaryMock: vi.fn(),
}));

vi.mock("openapi/http", () => ({
  downloadBinary: downloadBinaryMock,
  loadCachedBrushStrokes: openAPIMocks.loadCachedBrushStrokes,
  loadCachedChartData: openAPIMocks.loadCachedChartData,
  loadCachedDrawAreaLayerItemTransform:
    openAPIMocks.loadCachedDrawAreaLayerItemTransform,
  loadCachedImageArtifacts: openAPIMocks.loadCachedImageArtifacts,
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
  };
});

vi.mock("components/Section/Layouts/DrawArea/binaryConversion", () => ({
  blobToImageObj: vi.fn(async () => {
    const image = document.createElement("img");
    image.dataset.objectUrl = "blob:test-image";
    return image;
  }),
}));

type RenderedProbe = {
  host: HTMLDivElement;
  root: Root;
};

const imageSectionId = "image-section";
const imageVariantId = "image-variant";
const imageImplId = "image-impl";
const imageArtifactId = "artifacts/image.png";

const chartSectionId = "chart-section";
const chartVariantId = "chart-variant";
const chartImplId = "chart-impl";
const chartArtifactId = "artifacts/chart.json";

function setProjectStateForArtifacts(): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [imageSectionId]: imageVariantId,
        [chartSectionId]: chartVariantId,
      },
      topLevelSections: {
        [imageSectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        [chartSectionId]: { x: 0, y: 1, zIndex: 1, w: null, h: null },
      },
    });
    state.sections = {
      [imageSectionId]: createCore({
        id: imageSectionId,
        name: "Image",
        displayName: "",
        variants: [imageVariantId],
        defaultVariant: imageVariantId,
        sharedModifier: {},
        unsharedKeys: [],
      }),
      [chartSectionId]: createCore({
        id: chartSectionId,
        name: "Chart",
        displayName: "",
        variants: [chartVariantId],
        defaultVariant: chartVariantId,
        sharedModifier: {},
        unsharedKeys: [],
      }),
    };
    state.sectionVariants = {
      [imageVariantId]: createVariant({
        id: imageVariantId,
        name: "Image variant",
        impl: imageImplId,
        nonPresetImpls: [],
        modifier: {},
        isFrozen: false,
      }),
      [chartVariantId]: createVariant({
        id: chartVariantId,
        name: "Chart variant",
        impl: chartImplId,
        nonPresetImpls: [],
        modifier: {},
        isFrozen: false,
      }),
    };
    state.sectionImpls = {
      [imageImplId]: {
        type: SectionTypeEnum.Image,
        id: imageImplId,
        name: "Image",
        isFrozen: false,
        isInOtherProjectConfigs: false,
        tagColor: null,
        styleColor: null,
        size: { width: 320, height: 240 },
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
        isMinimized: false,
        positionAndSizeLocked: false,
        isPreset: false,
        imagePath: imageArtifactId,
      },
      [chartImplId]: {
        type: SectionTypeEnum.Chart,
        id: chartImplId,
        name: "Chart",
        isFrozen: false,
        isInOtherProjectConfigs: false,
        tagColor: null,
        styleColor: null,
        size: { width: 320, height: 240 },
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
        isMinimized: false,
        positionAndSizeLocked: false,
        isPreset: false,
        dataPath: chartArtifactId,
        chartSettings: createLineChartSettings(),
      },
    };
    state.previewSectionVariantMap = {};
  });
}

function ImageArtifactProbe() {
  const image = useImageArtifact(imageSectionId);
  return (
    <output
      data-testid="image-artifact"
      data-content-id={image?.value.contentId ?? ""}
    />
  );
}

function ChartArtifactProbe() {
  const data = useLoadedChartData(chartSectionId);
  return (
    <output data-testid="chart-artifact" data-chart={JSON.stringify(data)} />
  );
}

async function renderProbe(node: ReactElement): Promise<RenderedProbe> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(node);
  });

  return { host, root } satisfies RenderedProbe;
}

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await vi.dynamicImportSettled();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

describe("artifact hooks", () => {
  beforeEach(() => {
    resetProjectStores();
    setProjectStateForArtifacts();
    downloadBinaryMock.mockReset();
    openAPIMocks.loadCachedBrushStrokes.mockReset();
    openAPIMocks.loadCachedChartData.mockReset();
    openAPIMocks.loadCachedDrawAreaLayerItemTransform.mockReset();
    openAPIMocks.loadCachedImageArtifacts.mockReset();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("hydrates missing image artifacts through the Go cached-image route", async () => {
    vi.mocked(loadCachedImageArtifacts).mockResolvedValue({
      data: [
        createImageArtifact({
          type: ArtifactTypeEnum.Image,
          id: imageArtifactId,
          value: createContentRef({
            contentId: "image-content-id",
            byteLength: 4,
            mimeType: "image/png",
            sha256: null,
          }),
        }),
      ],
      status: 200,
      hasResponse: true,
    });

    const { host, root } = await renderProbe(<ImageArtifactProbe />);

    try {
      await flushEffects();

      expect(loadCachedImageArtifacts).toHaveBeenCalledWith({
        body: {
          paths: [imageArtifactId],
        },
      });
      expect(
        host
          .querySelector('[data-testid="image-artifact"]')
          ?.getAttribute("data-content-id"),
      ).toBe("image-content-id");
      expect(useImages.getState().x[imageArtifactId]?.value.contentId).toBe(
        "image-content-id",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("hydrates missing chart data through the Go cached-chart route", async () => {
    vi.mocked(loadCachedChartData).mockResolvedValue({
      data: [
        createChartDataArtifact({
          id: chartArtifactId,
          value: {
            x: [1, 2],
            y: [3, 4],
          },
        }),
      ],
      status: 200,
      hasResponse: true,
    });

    const { host, root } = await renderProbe(<ChartArtifactProbe />);

    try {
      await flushEffects();

      expect(loadCachedChartData).toHaveBeenCalledWith({
        body: {
          paths: [chartArtifactId],
        },
      });
      expect(
        host
          .querySelector('[data-testid="chart-artifact"]')
          ?.getAttribute("data-chart"),
      ).toBe(JSON.stringify({ x: [1, 2], y: [3, 4] }));
      expect(useChartData.getState().x[chartArtifactId]?.value).toEqual({
        x: [1, 2],
        y: [3, 4],
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("decodes raw images through the Go binary download route", async () => {
    useImages.setState((state) => ({
      ...state,
      x: {
        ...state.x,
        [imageArtifactId]: createImageArtifact({
          id: imageArtifactId,
          value: createContentRef({
            contentId: "decode-content-id",
            byteLength: 4,
            mimeType: "image/png",
            sha256: null,
          }),
        }),
      },
    }));
    vi.mocked(downloadBinary).mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: "image/png",
      }),
      status: 200,
      hasResponse: true,
    });

    await decodeExistingRawImages([imageArtifactId]);

    expect(downloadBinary).toHaveBeenCalledWith({
      path: { contentId: "decode-content-id" },
    });
    expect(
      useDecodedImages.getState().x[imageArtifactId]?.dataset.contentId,
    ).toBe("decode-content-id");
  });
});
