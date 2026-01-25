import { blobToImageObj } from "components/Section/Layouts/DrawArea/binaryConversion";
import _ from "lodash";
import { useEffect, useMemo } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import {
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
  useProjectState,
  useShareSession,
  ZustandDecodedImages,
  ZustandProjectState,
} from "state/definitions";
import { bumpRemoteRevisions } from "state/utils/revisions";
import { C_ADDRESSES } from "utils/c_addresses";
import { res200 } from "utils/endpointUtils";
import {
  route_load_cached_brush_strokes,
  route_load_cached_chart_data,
  route_load_cached_draw_area_layer_item_transform,
  route_load_cached_image_artifacts,
} from "utils/generatedEndpoints";
import {
  ArtifactTypeEnum,
  RouteEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

async function loadCachedImages(paths: Array<string>) {
  if (paths.length === 0) {
    return;
  }
  const res = await route_load_cached_image_artifacts({ paths });
  if (res200(res)) {
    useImages.setState((state) => {
      const next = { ...state.x };
      const changedIds: Array<string> = [];
      for (const img of res.data) {
        if (img) {
          const existing = state.x[img.id];
          if (!existing || !_.isEqual(existing, img)) {
            next[img.id] = img;
            changedIds.push(img.id);
          }
        }
      }
      if (changedIds.length === 0) {
        return state;
      }
      const revisions = bumpRemoteRevisions(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        changedIds,
      );
      return {
        x: next,
        ...revisions,
      };
    });
  }
}

async function fetchBinaryBlob(contentId: string): Promise<Blob | null> {
  const endpoint = RouteEnum.BINARY_DOWNLOAD.replace(
    "{contentId}",
    encodeURIComponent(contentId),
  );
  const shareSession = useShareSession.getState();
  const headers: HeadersInit = {};
  if (shareSession.isShareMode && shareSession.shareSessionId) {
    headers["X-Share-Session-Id"] = shareSession.shareSessionId;
  }
  const res = await fetch(`${C_ADDRESSES.BACKEND}${endpoint}`, {
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    return null;
  }
  return await res.blob();
}

export function useImageArtifact(sectionId: string) {
  const imagePath = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Image,
    );
    return impl.imagePath;
  });

  const imageArtifact = useImages((state) => state.x[imagePath]);

  useEffect(() => {
    if (!imageArtifact && imagePath) {
      void loadCachedImages([imagePath]);
    }
  }, [imageArtifact, imagePath]);

  return imageArtifact;
}

async function loadCachedChartData(paths: Array<string>) {
  if (paths.length === 0) {
    return;
  }
  const res = await route_load_cached_chart_data({ paths });
  if (res200(res)) {
    useChartData.setState((state) => {
      const next = { ...state.x };
      const changedIds: Array<string> = [];
      for (const artifact of res.data) {
        if (artifact) {
          const existing = state.x[artifact.id];
          if (!existing || !_.isEqual(existing, artifact)) {
            next[artifact.id] = artifact;
            changedIds.push(artifact.id);
          }
        }
      }
      if (changedIds.length === 0) {
        return state;
      }
      const revisions = bumpRemoteRevisions(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        changedIds,
      );
      return {
        x: next,
        ...revisions,
      };
    });
  }
}

export function useLoadedChartData(sectionId: string) {
  const dataPath = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chart,
    );
    return impl.dataPath;
  });

  const data = useChartData((state) => state.x[dataPath]);

  useEffect(() => {
    if (!data && dataPath) {
      void loadCachedChartData([dataPath]);
    }
  }, [data, dataPath]);

  return data?.value ?? {};
}

async function loadCachedBrushStrokes(paths: Array<string>) {
  if (paths.length === 0) {
    return;
  }
  const res = await route_load_cached_brush_strokes({ paths });
  if (res200(res)) {
    useBrushStrokes.setState((state) => {
      const next = { ...state.x };
      const changedIds: Array<string> = [];
      for (const artifact of res.data) {
        if (artifact) {
          const existing = state.x[artifact.id];
          if (!existing || !_.isEqual(existing, artifact)) {
            next[artifact.id] = artifact;
            changedIds.push(artifact.id);
          }
        }
      }
      if (changedIds.length === 0) {
        return state;
      }
      const revisions = bumpRemoteRevisions(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        changedIds,
      );
      return {
        x: next,
        ...revisions,
      };
    });
  }
}

async function loadCachedDrawAreaLayerItemTransforms(paths: Array<string>) {
  if (paths.length === 0) {
    return;
  }
  const res = await route_load_cached_draw_area_layer_item_transform({ paths });
  if (res200(res)) {
    useDrawAreaLayerItemTransform.setState((state) => {
      const next = { ...state.x };
      const changedIds: Array<string> = [];
      for (const artifact of res.data) {
        if (artifact) {
          const existing = state.x[artifact.id];
          if (!existing || !_.isEqual(existing, artifact)) {
            next[artifact.id] = artifact;
            changedIds.push(artifact.id);
          }
        }
      }
      if (changedIds.length === 0) {
        return state;
      }
      const revisions = bumpRemoteRevisions(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        changedIds,
      );
      return {
        x: next,
        ...revisions,
      };
    });
  }
}

export async function decodeExistingRawImages(needToDecode: Array<string>) {
  if (needToDecode.length === 0) {
    return;
  }
  const decoded: ZustandDecodedImages["x"] = {};
  const rawImages = useImages.getState().x;
  for (const path of needToDecode) {
    const rawImage = rawImages[path];
    if (rawImage) {
      const blob = await fetchBinaryBlob(rawImage.value.contentId);
      if (!blob) {
        continue;
      }
      const image = await blobToImageObj(blob);
      image.dataset.contentId = rawImage.value.contentId;
      decoded[path] = image;
    }
  }
  const decodedIds = Object.keys(decoded);
  if (decodedIds.length > 0) {
    useDecodedImages.setState((state) => {
      const revisions = bumpRemoteRevisions(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        decodedIds,
      );
      return {
        x: { ...state.x, ...decoded },
        ...revisions,
      };
    });
  }
}

type DrawAreaArtifactRefs = {
  imagePaths: Array<string>;
  brushStrokeIds: Array<string>;
  transformIds: Array<string>;
};

function collectDrawAreaArtifactRefs(
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

function useDrawAreaElementRefs(sectionId: string) {
  return useProjectState(
    (state) => collectDrawAreaArtifactRefs(state, sectionId),
    _.isEqual,
  );
}

function buildRevisionStamp(ids: Array<string>, revisions: Array<number>) {
  if (ids.length === 0 || revisions.length === 0) {
    return "";
  }
  const pairs = ids.map((id, idx) => [id, revisions[idx] ?? 0] as const);
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return pairs.map(([id, revision]) => `${id}:${revision}`).join("|");
}

export function useDrawAreaArtifactRevisionStamps(sectionId: string) {
  const refs = useDrawAreaElementRefs(sectionId);

  const imageRevisions = useImages(
    (state) =>
      refs.imagePaths.map((id) => {
        const total = state.revisionById[id] ?? 0;
        const local = state.localRevisionById[id]?.[sectionId] ?? 0;
        return total - local;
      }),
    _.isEqual,
  );
  const decodedRevisions = useDecodedImages(
    (state) =>
      refs.imagePaths.map((id) => {
        const total = state.revisionById[id] ?? 0;
        const local = state.localRevisionById[id]?.[sectionId] ?? 0;
        return total - local;
      }),
    _.isEqual,
  );
  const brushRevisions = useBrushStrokes(
    (state) =>
      refs.brushStrokeIds.map((id) => {
        const total = state.revisionById[id] ?? 0;
        const local = state.localRevisionById[id]?.[sectionId] ?? 0;
        return total - local;
      }),
    _.isEqual,
  );
  const transformRevisions = useDrawAreaLayerItemTransform(
    (state) =>
      refs.transformIds.map((id) => {
        const total = state.revisionById[id] ?? 0;
        const local = state.localRevisionById[id]?.[sectionId] ?? 0;
        return total - local;
      }),
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

    const { imagePaths, brushStrokeIds, transformIds } = refs;

    const imagesState = useImages.getState();
    const decodedState = useDecodedImages.getState();
    const brushState = useBrushStrokes.getState();
    const transformState = useDrawAreaLayerItemTransform.getState();
    const missingImages = imagePaths.filter((path) => !imagesState.x[path]);
    const missingBrushStrokes = brushStrokeIds.filter(
      (id) => !brushState.x[id],
    );
    const missingTransforms = transformIds.filter(
      (id) => !transformState.x[id],
    );
    const pendingDecode = imagePaths.filter((path) => {
      const rawImage = imagesState.x[path];
      if (!rawImage) {
        return false;
      }
      const decodedImage = decodedState.x[path];
      if (!decodedImage) {
        return true;
      }
      return decodedImage.dataset.contentId !== rawImage.value.contentId;
    });

    void loadCachedImages(missingImages);
    void loadCachedBrushStrokes(missingBrushStrokes);
    void loadCachedDrawAreaLayerItemTransforms(missingTransforms);
    void decodeExistingRawImages(pendingDecode);
  }, [sectionId, refs]);
}
