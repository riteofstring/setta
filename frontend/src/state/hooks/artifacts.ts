import { base64ToImageObj } from "components/Section/Layouts/DrawArea/base64Conversion";
import _ from "lodash";
import { useEffect } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import {
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
  useProjectState,
  ZustandDecodedImages,
  ZustandProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_load_cached_brush_strokes,
  route_load_cached_chart_data,
  route_load_cached_draw_area_layer_item_transform,
  route_load_cached_image_artifacts,
} from "utils/generatedEndpoints";
import {
  ArtifactTypeEnum,
  BrushStrokeMapping,
  DrawAreaLayerItemTransformMapping,
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
      for (const img of res.data) {
        if (img) {
          next[img.id] = img;
        }
      }
      return { x: next, remoteRevision: state.remoteRevision + 1 };
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

async function loadCachedChartData(paths: Array<string>) {
  if (paths.length === 0) {
    return;
  }
  const res = await route_load_cached_chart_data({ paths });
  if (res200(res)) {
    useChartData.setState((state) => {
      const next = { ...state.x };
      for (const artifact of res.data) {
        if (artifact) {
          next[artifact.id] = artifact;
        }
      }
      return { x: next, remoteRevision: state.remoteRevision + 1 };
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
      for (const artifact of res.data) {
        if (artifact) {
          next[artifact.id] = artifact;
        }
      }
      return { x: next, remoteRevision: state.remoteRevision + 1 };
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
      for (const artifact of res.data) {
        if (artifact) {
          next[artifact.id] = artifact;
        }
      }
      return { x: next, remoteRevision: state.remoteRevision + 1 };
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
      decoded[path] = await base64ToImageObj(rawImage.value);
    }
  }
  if (Object.keys(decoded).length > 0) {
    useDecodedImages.setState((state) => ({
      x: { ...state.x, ...decoded },
      remoteRevision: state.remoteRevision + 1,
    }));
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
    const pendingDecode = imagePaths.filter(
      (path) => imagesState.x[path] && !decodedState.x[path],
    );

    void loadCachedImages(missingImages);
    void loadCachedBrushStrokes(missingBrushStrokes);
    void loadCachedDrawAreaLayerItemTransforms(missingTransforms);
    void decodeExistingRawImages(pendingDecode);
  }, [sectionId, refs]);
}

export function useDrawAreaArtifactData(sectionId: string) {
  const refs = useDrawAreaElementRefs(sectionId);

  const decodedImages = useDecodedImages(
    (state) => {
      const acc: ZustandDecodedImages["x"] = {};
      for (const path of refs.imagePaths) {
        const decoded = state.x[path];
        if (decoded) {
          acc[path] = decoded;
        }
      }
      return acc;
    },
    _.isEqual,
  );

  const brushStrokes = useBrushStrokes(
    (state) => {
      const acc: BrushStrokeMapping = {};
      for (const id of refs.brushStrokeIds) {
        const stroke = state.x[id];
        if (stroke) {
          acc[id] = stroke;
        }
      }
      return acc;
    },
    _.isEqual,
  );

  const transforms = useDrawAreaLayerItemTransform(
    (state) => {
      const acc: DrawAreaLayerItemTransformMapping = {};
      for (const id of refs.transformIds) {
        const transform = state.x[id];
        if (transform) {
          acc[id] = transform;
        }
      }
      return acc;
    },
    _.isEqual,
  );

  return { decodedImages, brushStrokes, transforms };
}

export const useLoadedDrawAreaData = useDrawAreaArtifactData;
