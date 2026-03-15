/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useBrushStrokes,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  ArtifactTypeEnum,
  DrawAreaBrushShapeEnum,
  DrawAreaModeEnum,
  createBrushStroke,
  createBrushStrokeArtifact,
  createCore,
  createDrawAreaLayer,
  createDrawAreaLayerItem,
  createDrawAreaLayerItemTransform,
  createDrawAreaLayerItemTransformArtifact,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildRevisionStamp,
  collectDrawAreaArtifactRefs,
  getDrawAreaArtifactLoadPlan,
  useDrawAreaArtifactRevisionStamps,
} from "./drawAreaArtifacts";

const SECTION_ID = "draw-section-1";
const VARIANT_ID = "draw-variant-1";
const IMPL_ID = "draw-impl-1";

function seedDrawProjectState(): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [SECTION_ID]: VARIANT_ID },
    });
    state.sections[SECTION_ID] = createCore({
      id: SECTION_ID,
      variants: [VARIANT_ID],
      defaultVariant: VARIANT_ID,
      sharedModifier: {},
      unsharedKeys: [],
    });
    state.sectionVariants[VARIANT_ID] = createVariant({
      id: VARIANT_ID,
      impl: IMPL_ID,
      nonPresetImpls: [IMPL_ID],
      modifier: {},
      name: "draw-variant",
    });
    state.sectionImpls[IMPL_ID] = {
      type: "Draw",
      id: IMPL_ID,
      name: "Draw",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      styleColor: null,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      layers: [
        createDrawAreaLayer({
          name: "foreground",
          elements: [
            createDrawAreaLayerItem({
              type: ArtifactTypeEnum.Image,
              dataPath: "image-1",
              transformId: "transform-1",
            }),
            createDrawAreaLayerItem({
              type: ArtifactTypeEnum.BrushStroke,
              dataPath: "stroke-1",
              transformId: "transform-2",
            }),
          ],
        }),
        createDrawAreaLayer({
          name: "background",
          elements: [
            createDrawAreaLayerItem({
              type: ArtifactTypeEnum.Image,
              dataPath: "image-1",
              transformId: "transform-1",
            }),
            createDrawAreaLayerItem({
              type: ArtifactTypeEnum.Image,
              dataPath: "image-2",
              transformId: "transform-3",
            }),
          ],
        }),
      ],
      renderedImagePath: null,
      activeLayerIdx: 0,
      brushColor: "#000000",
      brushSize: 4,
      brushShape: DrawAreaBrushShapeEnum.round,
      brushOpacity: 1,
      eraserBrushSize: 16,
      drawThrottleDelay: 0,
      canvasMode: DrawAreaModeEnum.draw,
      colorChoices: [],
    };
  });
}

function Probe({ sectionId }: { sectionId: string }) {
  const stamps = useDrawAreaArtifactRevisionStamps(sectionId);
  return <pre>{JSON.stringify(stamps)}</pre>;
}

describe("drawAreaArtifacts", () => {
  beforeEach(() => {
    resetProjectStores();
    seedDrawProjectState();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("collects deduped draw-area artifact refs from layered elements", () => {
    const refs = collectDrawAreaArtifactRefs(
      useProjectState.getState(),
      SECTION_ID,
    );

    expect(refs).toEqual({
      imagePaths: ["image-1", "image-2"],
      brushStrokeIds: ["stroke-1"],
      transformIds: ["transform-1", "transform-2", "transform-3"],
    });
  });

  it("builds stable revision stamps and fills missing revision entries with zero", () => {
    expect(buildRevisionStamp(["image-b", "image-a"], [2])).toBe(
      "image-a:0|image-b:2",
    );
  });

  it("plans draw-area artifact loads from current artifact and decode stores", () => {
    useImages.setState({
      x: {
        "image-1": {
          type: ArtifactTypeEnum.Image,
          id: "image-1",
          value: {
            contentId: "content-1",
            byteLength: 12,
            mimeType: "image/png",
            sha256: null,
          },
        },
      },
      revisionById: {},
      localRevisionById: {},
    });
    const staleDecodedImage = document.createElement("img");
    staleDecodedImage.dataset.contentId = "stale-content";
    useDecodedImages.setState({
      x: { "image-1": staleDecodedImage },
      revisionById: {},
      localRevisionById: {},
    });
    useBrushStrokes.setState({
      x: {},
      revisionById: {},
      localRevisionById: {},
    });
    useDrawAreaLayerItemTransform.setState({
      x: {
        "transform-1": createDrawAreaLayerItemTransformArtifact({
          id: "transform-1",
          value: createDrawAreaLayerItemTransform({
            transform: [1, 0, 0, 1, 0, 0],
          }),
        }),
      },
      revisionById: {},
      localRevisionById: {},
    });

    const loadPlan = getDrawAreaArtifactLoadPlan({
      refs: collectDrawAreaArtifactRefs(useProjectState.getState(), SECTION_ID),
      imagesState: useImages.getState(),
      decodedImagesState: useDecodedImages.getState(),
      brushStrokesState: useBrushStrokes.getState(),
      transformState: useDrawAreaLayerItemTransform.getState(),
    });

    expect(loadPlan).toEqual({
      missingImages: ["image-2"],
      missingBrushStrokes: ["stroke-1"],
      missingTransforms: ["transform-2", "transform-3"],
      pendingDecode: ["image-1"],
    });
  });

  it("derives revision stamps from artifact refs and per-section local revisions", async () => {
    useImages.setState({
      x: {
        "image-1": {
          type: ArtifactTypeEnum.Image,
          id: "image-1",
          value: {
            contentId: "content-1",
            byteLength: 12,
            mimeType: "image/png",
            sha256: null,
          },
        },
        "image-2": {
          type: ArtifactTypeEnum.Image,
          id: "image-2",
          value: {
            contentId: "content-2",
            byteLength: 16,
            mimeType: "image/png",
            sha256: null,
          },
        },
      },
      revisionById: { "image-1": 4, "image-2": 2 },
      localRevisionById: { "image-1": { [SECTION_ID]: 1 }, "image-2": {} },
    });
    useDecodedImages.setState({
      x: {
        "image-1": document.createElement("img"),
        "image-2": document.createElement("img"),
      },
      revisionById: { "image-1": 3, "image-2": 1 },
      localRevisionById: { "image-1": { [SECTION_ID]: 1 }, "image-2": {} },
    });
    useBrushStrokes.setState({
      x: {
        "stroke-1": createBrushStrokeArtifact({
          id: "stroke-1",
          value: createBrushStroke({
            strokeStyle: "#fff",
            lineWidth: 2,
            lineCap: DrawAreaBrushShapeEnum.round,
            points: [
              [0, 0],
              [1, 1],
            ],
          }),
        }),
      },
      revisionById: { "stroke-1": 5 },
      localRevisionById: { "stroke-1": { [SECTION_ID]: 2 } },
    });
    useDrawAreaLayerItemTransform.setState({
      x: {
        "transform-1": createDrawAreaLayerItemTransformArtifact({
          id: "transform-1",
          value: createDrawAreaLayerItemTransform({
            transform: [1, 0, 0, 1, 0, 0],
          }),
        }),
        "transform-2": createDrawAreaLayerItemTransformArtifact({
          id: "transform-2",
          value: createDrawAreaLayerItemTransform({
            transform: [1, 0, 0, 1, 5, 5],
          }),
        }),
        "transform-3": createDrawAreaLayerItemTransformArtifact({
          id: "transform-3",
          value: createDrawAreaLayerItemTransform({
            transform: [1, 0, 0, 1, 8, 8],
          }),
        }),
      },
      revisionById: { "transform-1": 2, "transform-2": 4, "transform-3": 1 },
      localRevisionById: {
        "transform-1": { [SECTION_ID]: 1 },
        "transform-2": {},
        "transform-3": {},
      },
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<Probe sectionId={SECTION_ID} />);
    });

    expect(host.textContent).toBe(
      JSON.stringify({
        images: "image-1:3|image-2:2",
        decodedImages: "image-1:2|image-2:1",
        brushStrokes: "stroke-1:3",
        transforms: "transform-1:1|transform-2:4|transform-3:1",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });
});
