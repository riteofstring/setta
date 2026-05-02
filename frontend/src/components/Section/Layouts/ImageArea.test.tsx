/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import {
  useDecodedImages,
  useImages,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import {
  SectionTypeEnum,
  createCore,
  createImageArtifact,
  createProjectConfig,
  createSectionSize,
  createVariant,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageArea } from "./ImageArea";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function seedImageSection() {
  const sectionId = "image-section";
  const variantId = "image-variant";
  const implId = "image-impl";
  const imagePath = "artifacts/image.png";
  const contentId = "image-content";
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });
  const sectionImpl = {
    type: SectionTypeEnum.Image,
    id: implId,
    name: "Image",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    styleColor: null,
    size: createSectionSize({ width: 320, height: 180 }),
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    imagePath,
  } as BaseSectionImplUnion;

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Image",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        name: "Variant",
        impl: implId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = { [implId]: sectionImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);

  const imageArtifact = createImageArtifact({
    id: imagePath,
    value: {
      byteLength: 12,
      contentId,
      mimeType: "image/png",
      sha256: "sha",
    },
  });
  useImages.setState({
    x: { [imagePath]: imageArtifact },
    revisionById: { [imagePath]: 1 },
    localRevisionById: {},
  });
  syncStoreInitialState(useImages);

  const decodedImage = new Image();
  decodedImage.src = "data:image/png;base64,iVBORw0KGgo=";
  decodedImage.dataset.contentId = contentId;
  useDecodedImages.setState({
    x: { [imagePath]: decodedImage },
    revisionById: { [imagePath]: 1 },
    localRevisionById: {},
  });
  syncStoreInitialState(useDecodedImages);

  return sectionId;
}

function expectGpuGuardedElement(element: Element | null) {
  expect(element).not.toBeNull();
  expect(element?.getAttribute("data-gpu-flow-interactive")).toBe("true");
  expect(element?.classList.contains(NO_DRAG_CLASS_NAME)).toBe(true);
  expect(element?.classList.contains(NO_PAN_CLASS_NAME)).toBe(true);
}

describe("ImageArea GPU flow ownership", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("marks the image section and decoded preview as GPU flow interactive nodrag regions", () => {
    const sectionId = seedImageSection();
    const markup = renderToStaticMarkup(<ImageArea sectionId={sectionId} />);
    const container = document.createElement("div");
    container.innerHTML = markup;

    expectGpuGuardedElement(
      container.querySelector(`[data-gpu-flow-control="image:${sectionId}"]`),
    );
    expectGpuGuardedElement(
      container.querySelector(
        `[data-gpu-flow-control="image:preview:${sectionId}"]`,
      ),
    );
  });
});
