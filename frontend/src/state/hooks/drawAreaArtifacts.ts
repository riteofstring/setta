import _ from "lodash";
import { useEffect, useMemo } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionEffectiveImpls";
import {
  useBrushStrokes,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import { ArtifactTypeEnum, SectionTypeEnum } from "utils/generatedTypes";

import {
  decodeExistingRawImages,
  loadCachedBrushStrokes,
  loadCachedDrawAreaLayerItemTransforms,
  loadCachedImages,
} from "./artifactTransport";

export type DrawAreaArtifactRefs = {
  imagePaths: Array<string>;
  brushStrokeIds: Array<string>;
  transformIds: Array<string>;
};

export type DrawAreaArtifactLoadPlan = {
  missingImages: Array<string>;
  missingBrushStrokes: Array<string>;
  missingTransforms: Array<string>;
  pendingDecode: Array<string>;
};

export function collectDrawAreaArtifactRefs(
  state: ZustandProjectState,
  sectionId: string,
): DrawAreaArtifactRefs {
  const impl = getCurrEffectiveSectionImplOfType(
    state,
    sectionId,
    SectionTypeEnum.Draw,
  );

  const imagePaths = new Set<string>();
  const brushStrokeIds = new Set<string>();
  const transformIds = new Set<string>();

  for (const layer of impl.layers) {
    for (const element of layer.elements) {
      transformIds.add(element.transformId);
      if (element.type === ArtifactTypeEnum.Image) {
        imagePaths.add(element.dataPath);
      } else if (element.type === ArtifactTypeEnum.BrushStroke) {
        brushStrokeIds.add(element.dataPath);
      }
    }
  }

  return {
    imagePaths: Array.from(imagePaths),
    brushStrokeIds: Array.from(brushStrokeIds),
    transformIds: Array.from(transformIds),
  };
}

export function buildRevisionStamp(
  ids: Array<string>,
  revisions: Array<number>,
): string {
  if (ids.length === 0 || revisions.length === 0) {
    return "";
  }
  const pairs = ids.map((id, idx) => [id, revisions[idx] ?? 0] as const);
  pairs.sort((left, right) => left[0].localeCompare(right[0]));
  return pairs.map(([id, revision]) => `${id}:${revision}`).join("|");
}

export function getDrawAreaArtifactLoadPlan({
  refs,
  imagesState,
  decodedImagesState,
  brushStrokesState,
  transformState,
}: {
  refs: DrawAreaArtifactRefs;
  imagesState: ReturnType<typeof useImages.getState>;
  decodedImagesState: ReturnType<typeof useDecodedImages.getState>;
  brushStrokesState: ReturnType<typeof useBrushStrokes.getState>;
  transformState: ReturnType<typeof useDrawAreaLayerItemTransform.getState>;
}): DrawAreaArtifactLoadPlan {
  const missingImages = refs.imagePaths.filter((path) => !imagesState.x[path]);
  const missingBrushStrokes = refs.brushStrokeIds.filter(
    (id) => !brushStrokesState.x[id],
  );
  const missingTransforms = refs.transformIds.filter(
    (id) => !transformState.x[id],
  );
  const pendingDecode = refs.imagePaths.filter((path) => {
    const rawImage = imagesState.x[path];
    if (!rawImage) {
      return false;
    }
    const decodedImage = decodedImagesState.x[path];
    if (!decodedImage) {
      return true;
    }
    return decodedImage.dataset.contentId !== rawImage.value.contentId;
  });

  return {
    missingImages,
    missingBrushStrokes,
    missingTransforms,
    pendingDecode,
  };
}

function useDrawAreaElementRefs(sectionId: string) {
  return useProjectState(
    (state) => collectDrawAreaArtifactRefs(state, sectionId),
    _.isEqual,
  );
}

function getRemoteRevisionDelta({
  revisionById,
  localRevisionById,
  artifactId,
  sectionId,
}: {
  revisionById: Record<string, number>;
  localRevisionById: Record<string, Record<string, number>>;
  artifactId: string;
  sectionId: string;
}): number {
  const total = revisionById[artifactId] ?? 0;
  const local = localRevisionById[artifactId]?.[sectionId] ?? 0;
  return total - local;
}

export function useDrawAreaArtifactRevisionStamps(sectionId: string) {
  const refs = useDrawAreaElementRefs(sectionId);

  const imageRevisions = useImages(
    (state) =>
      refs.imagePaths.map((artifactId) =>
        getRemoteRevisionDelta({
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
          artifactId,
          sectionId,
        }),
      ),
    _.isEqual,
  );
  const decodedRevisions = useDecodedImages(
    (state) =>
      refs.imagePaths.map((artifactId) =>
        getRemoteRevisionDelta({
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
          artifactId,
          sectionId,
        }),
      ),
    _.isEqual,
  );
  const brushRevisions = useBrushStrokes(
    (state) =>
      refs.brushStrokeIds.map((artifactId) =>
        getRemoteRevisionDelta({
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
          artifactId,
          sectionId,
        }),
      ),
    _.isEqual,
  );
  const transformRevisions = useDrawAreaLayerItemTransform(
    (state) =>
      refs.transformIds.map((artifactId) =>
        getRemoteRevisionDelta({
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
          artifactId,
          sectionId,
        }),
      ),
    _.isEqual,
  );

  const images = useMemo(
    () => buildRevisionStamp(refs.imagePaths, imageRevisions),
    [refs.imagePaths, imageRevisions],
  );
  const decodedImages = useMemo(
    () => buildRevisionStamp(refs.imagePaths, decodedRevisions),
    [refs.imagePaths, decodedRevisions],
  );
  const brushStrokes = useMemo(
    () => buildRevisionStamp(refs.brushStrokeIds, brushRevisions),
    [refs.brushStrokeIds, brushRevisions],
  );
  const transforms = useMemo(
    () => buildRevisionStamp(refs.transformIds, transformRevisions),
    [refs.transformIds, transformRevisions],
  );

  return { images, decodedImages, brushStrokes, transforms };
}

export function useDrawAreaArtifactLoader(sectionId: string) {
  const refs = useDrawAreaElementRefs(sectionId);

  useEffect(() => {
    if (sectionId === "") {
      return;
    }

    const loadPlan = getDrawAreaArtifactLoadPlan({
      refs,
      imagesState: useImages.getState(),
      decodedImagesState: useDecodedImages.getState(),
      brushStrokesState: useBrushStrokes.getState(),
      transformState: useDrawAreaLayerItemTransform.getState(),
    });

    void loadCachedImages(loadPlan.missingImages);
    void loadCachedBrushStrokes(loadPlan.missingBrushStrokes);
    void loadCachedDrawAreaLayerItemTransforms(loadPlan.missingTransforms);
    void decodeExistingRawImages(loadPlan.pendingDecode);
  }, [sectionId, refs]);
}
