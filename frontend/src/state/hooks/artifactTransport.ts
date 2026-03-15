import { blobToImageObj } from "components/Section/Layouts/DrawArea/binaryConversion";
import _ from "lodash";
import { useEffect } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionEffectiveImpls";
import {
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
  useProjectState,
  useShareSession,
  type ZustandDecodedImages,
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
import { RouteEnum, SectionTypeEnum } from "utils/generatedTypes";

export async function loadCachedImages(paths: Array<string>) {
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

export async function loadCachedChartData(paths: Array<string>) {
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

export async function loadCachedBrushStrokes(paths: Array<string>) {
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

export async function loadCachedDrawAreaLayerItemTransforms(
  paths: Array<string>,
) {
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

async function fetchBinaryBlob(contentId: string): Promise<Blob | null> {
  const endpoint = RouteEnum.BINARY_DOWNLOAD.replace(
    "{contentId}",
    encodeURIComponent(contentId),
  );
  const shareSession = useShareSession.getState();
  const headers: HeadersInit = {};
  if (shareSession.isDeploymentMode && shareSession.shareSessionId) {
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

export async function decodeExistingRawImages(pathsToDecode: Array<string>) {
  if (pathsToDecode.length === 0) {
    return;
  }
  const decoded: ZustandDecodedImages["x"] = {};
  const rawImages = useImages.getState().x;
  const entries = await Promise.all(
    pathsToDecode.map(async (path) => {
      const rawImage = rawImages[path];
      if (!rawImage) {
        return null;
      }
      const blob = await fetchBinaryBlob(rawImage.value.contentId);
      if (!blob) {
        return null;
      }
      const image = await blobToImageObj(blob);
      image.dataset.contentId = rawImage.value.contentId;
      return { path, image };
    }),
  );
  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    decoded[entry.path] = entry.image;
  }
  const decodedIds = Object.keys(decoded);
  if (decodedIds.length > 0) {
    useDecodedImages.setState((state) => {
      for (const id of decodedIds) {
        const existing = state.x[id];
        const nextImage = decoded[id];
        if (!existing || !nextImage || existing === nextImage) {
          continue;
        }
        const existingUrl = existing.dataset.objectUrl;
        const nextUrl = nextImage.dataset.objectUrl;
        if (existingUrl && existingUrl !== nextUrl) {
          URL.revokeObjectURL(existingUrl);
        }
      }
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
