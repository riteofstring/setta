import { base64ToImageObj } from "components/Section/Layouts/DrawArea/base64Conversion";
import _ from "lodash";
import { useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  addArtifactAndMaybeCreateNewArtifactGroup,
  loadArtifacts,
  prepareDataURLForRendering,
} from "state/actions/artifacts";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import {
  useArtifacts,
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
  useProjectState,
  ZustandDecodedImages,
} from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";
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
  console.log("loadCachedBrushStrokes", res)
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

  console.log("brushStrokesToLoad", brushStrokesToLoad)

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

function useLoadedArtifacts(sectionId, artifactIds, attrPickerFn) {
  const loadedArtifacts = useArtifacts((x) => {
    const output = {};
    for (const id of artifactIds) {
      if (x.x[id]?.value) {
        output[id] = attrPickerFn(x.x[id]);
      }
    }
    return output;
  }, _.isEqual);

  useDeepCompareEffect(() => {
    const controller = new AbortController();
    const notLoaded = [];
    for (const id of artifactIds) {
      if (!(id in loadedArtifacts)) {
        notLoaded.push(id);
      }
    }
    if (notLoaded.length > 0) {
      loadArtifacts(sectionId, notLoaded, controller.signal);
    }

    return () => {
      controller.abort();
    };
  }, [artifactIds]);

  return loadedArtifacts;
}

export function useDrawAreaActiveLayerAndLoadedArtifacts(sectionId) {
  const { artifactIds, activeLayer, allLayersMetadata, size, canvasSettings } =
    useProjectState((state) => {
      const artifactIds = getAllSectionArtifactIds(sectionId, state);
      const canvasSettings = state.sections[sectionId].canvasSettings;
      const activeLayer = state.artifactGroups[canvasSettings.activeLayerId];
      const allLayersMetadata = getSectionArtifactGroupMetadata(
        sectionId,
        state,
      );

      return {
        activeLayer,
        artifactIds,
        allLayersMetadata,
        size: state.sections[sectionId].size,
        canvasSettings,
      };
    }, _.isEqual);

  const loadedArtifacts = useLoadedArtifacts(sectionId, artifactIds, (a) =>
    _.pick(a, ["type"]),
  );

  const loadedArtifactIdsWithDuplicates = [];
  for (const x of allLayersMetadata) {
    loadedArtifactIdsWithDuplicates.push(
      ...x.artifactIdsUsed.filter((a) => a in loadedArtifacts),
    );
    delete x.artifactIdsUsed;
  }

  return {
    activeLayer,
    allLayersMetadata,
    size,
    canvasSettings,
    loadedArtifacts,
    loadedArtifactIdsWithDuplicates,
  };
}

export function useAllSectionArtifacts(sectionId, attrPickerFn) {
  const artifactIds = useProjectState(
    (state) => getAllSectionArtifactIds(sectionId, state),
    _.isEqual,
  );

  return useLoadedArtifacts(sectionId, artifactIds, attrPickerFn);
}

export function getSectionArtifactGroupMetadata(sectionId, state) {
  const { artifactGroupIds } = state.sections[sectionId];
  const output = [];
  for (const id of artifactGroupIds) {
    const info = { id, ...state.artifactGroups[id] };
    info.artifactIdsUsed = info.artifactTransforms.map((x) => x.artifactId);
    delete info.artifactTransforms;
    output.push(info);
  }
  return output;
}

export function getAllSectionArtifactIds(sectionId, state) {
  const artifactIds = new Set();
  for (const artifactGroupId of state.sections[sectionId].artifactGroupIds) {
    for (const t of state.artifactGroups[artifactGroupId].artifactTransforms) {
      artifactIds.add(t.artifactId);
    }
  }
  return artifactIds;
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
