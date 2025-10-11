import { base64ToImageObj } from "components/Section/Layouts/DrawArea/base64Conversion";
import _ from "lodash";
import { useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import {
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
  useProjectState,
  ZustandDecodedImages,
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
  const res = await route_load_cached_image_artifacts({
    paths,
  });
  if (res200(res)) {
    useImages.setState((state) => {
      const newImgs = { ...state.x };
      for (const img of res.data) {
        if (img) {
          newImgs[img.id] = img;
        }
      }
      return { x: newImgs };
    });
  }
}

export function useImageArtifact(sectionId: string) {
  const imagePath = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Image,
    );
    return impl.imagePath;
  });

  const imageArtifact = useImages((x) => x.x[imagePath]);

  // Read image from backend cache when this hook gets initialized,
  // i.e. when the component loads for the first time.
  // In all other cases, backend will send artifact updates by websocket.
  useEffect(() => {
    if (!imageArtifact && imagePath) {
      loadCachedImages([imagePath]);
    }
  }, []);

  return imageArtifact;
}

async function loadCachedChartData(paths: Array<string>) {
  const res = await route_load_cached_chart_data({ paths });
  if (res200(res)) {
    useChartData.setState((state) => {
      const newData = { ...state.x };
      for (const img of res.data) {
        if (img) {
          newData[img.id] = img;
        }
      }
      return { x: newData };
    });
  }
}

export function useLoadedChartData(sectionId: string) {
  const dataPath = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Chart,
    );
    return impl.dataPath;
  });

  const data = useChartData((x) => x.x[dataPath]);

  useEffect(() => {
    if (!data && dataPath) {
      loadCachedChartData([dataPath]);
    }
  }, []);

  return data?.value ?? {};
}

async function loadCachedBrushStrokes(paths: Array<string>) {
  const res = await route_load_cached_brush_strokes({ paths });
  console.log("loadCachedBrushStrokes", res);
  if (res200(res)) {
    useBrushStrokes.setState((state) => {
      const newData = { ...state.x };
      for (const img of res.data) {
        if (img) {
          newData[img.id] = img;
        }
      }
      return { x: newData };
    });
  }
}

async function loadCachedDrawAreaLayerItemTransforms(paths: Array<string>) {
  const res = await route_load_cached_draw_area_layer_item_transform({ paths });
  if (res200(res)) {
    useDrawAreaLayerItemTransform.setState((state) => {
      const newData = { ...state.x };
      for (const img of res.data) {
        if (img) {
          newData[img.id] = img;
        }
      }
      return { x: newData };
    });
  }
}

export async function decodeExistingRawImages(needToDecode: Array<string>) {
  const images: ZustandDecodedImages["x"] = {};
  for (const path of needToDecode) {
    const rawImage = useImages.getState().x[path];
    if (rawImage) {
      images[path] = await base64ToImageObj(rawImage.value);
    }
  }
  useDecodedImages.setState((state) => ({ x: { ...state.x, ...images } }));
}

export function useLoadedDrawAreaData(sectionId: string) {
  const elements = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Draw,
    );
    return impl.layers.flatMap((l) => l.elements);
  }, _.isEqual);

  const { decodedImages, imagesToDecode } = useDecodedImages((x) => {
    const decodedImages: ZustandDecodedImages["x"] = {};
    const imagesToDecode: Array<string> = [];
    for (const e of elements) {
      if (e.type === ArtifactTypeEnum.Image) {
        const d = x.x[e.dataPath];
        if (d) {
          decodedImages[e.dataPath] = d;
        } else {
          imagesToDecode.push(e.dataPath);
        }
      }
    }
    return { decodedImages, imagesToDecode };
  }, _.isEqual);

  const { brushStrokes, brushStrokesToLoad } = useBrushStrokes((x) => {
    const brushStrokes: BrushStrokeMapping = {};
    const brushStrokesToLoad: Array<string> = [];
    for (const e of elements) {
      if (e.type === ArtifactTypeEnum.BrushStroke) {
        const b = x.x[e.dataPath];
        if (b) {
          brushStrokes[e.dataPath] = b;
        } else {
          brushStrokesToLoad.push(e.dataPath);
        }
      }
    }
    return { brushStrokes, brushStrokesToLoad };
  }, _.isEqual);

  console.log("brushStrokesToLoad", brushStrokesToLoad);

  const { transforms, transformsToLoad } = useDrawAreaLayerItemTransform(
    (x) => {
      const transforms: DrawAreaLayerItemTransformMapping = {};
      const transformsToLoad: Array<string> = [];
      for (const e of elements) {
        const t = x.x[e.transformId];
        if (t) {
          transforms[e.transformId] = t;
        } else {
          transformsToLoad.push(e.transformId);
        }
      }
      return { transforms, transformsToLoad };
    },
    _.isEqual,
  );

  useEffect(() => {
    const rawImages = useImages.getState().x;
    const imagesToLoad = imagesToDecode.filter((d) => !(d in rawImages));
    if (imagesToLoad.length > 0) {
      loadCachedImages(imagesToLoad);
    }

    if (brushStrokesToLoad.length > 0) {
      loadCachedBrushStrokes(brushStrokesToLoad);
    }

    if (transformsToLoad.length > 0) {
      loadCachedDrawAreaLayerItemTransforms(transformsToLoad);
    }
  }, []);

  return { decodedImages, brushStrokes, transforms };
}

export function useLoadArtifactViaDropzone(
  sectionId,
  createNewArtifactGroup,
  artifactType,
) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      acceptedFiles.forEach((file) => {
        const reader = new FileReader();

        reader.onload = async () => {
          const value = await prepareDataURLForRendering(
            artifactType,
            reader.result,
          );
          await addArtifactAndMaybeCreateNewArtifactGroup({
            sectionId,
            createNewArtifactGroup,
            value,
            artifactType,
          });
        };

        reader.onerror = (error) => {
          console.error("Error reading file:", error);
        };

        // Read the file as a Data URL (base64)
        reader.readAsDataURL(file);
      });
    },
    [sectionId, createNewArtifactGroup],
  );

  return useDropzone({ onDrop });
}
