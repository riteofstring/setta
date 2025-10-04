import { base64ToImageObj } from "components/Section/Layouts/DrawArea/base64Conversion";
import _ from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import {
  addArtifactAndMaybeCreateNewArtifactGroup,
  loadArtifacts,
  prepareDataURLForRendering,
} from "state/actions/artifacts";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import {
  useArtifacts,
  useChartData,
  useDecodedImages,
  useImages,
  useProjectState,
  ZustandDecodedImages,
} from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";
import { res200 } from "utils/endpointUtils";
import {
  route_load_cached_chart_data,
  route_load_cached_image_artifacts,
} from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

async function loadCachedImages(imagePaths: Array<string>) {
  const res = await route_load_cached_image_artifacts({
    imagePaths,
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

async function loadCachedChartData(dataPath: string) {
  const res = await route_load_cached_chart_data({ dataPath });
  if (res200(res)) {
    const data = res.data;
    if (data) {
      useChartData.setState((state) => ({
        x: { ...state.x, [dataPath]: data },
      }));
    }
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
      loadCachedChartData(dataPath);
    }
  }, []);

  return data?.value ?? {};
}

async function decodeExistingRawImages(needToDecode: Array<string>) {
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
  const paths = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Draw,
    );
    return impl.layers.flatMap((l) => l.elements.map((e) => e.dataPath));
  }, _.isEqual);

  const rawImageExists = useImages((x) => paths.map((p) => p in x), _.isEqual);
  const decoded = useDecodedImages((x) => paths.map((p) => x.x[p]), _.isEqual);
  const { needToLoad, needToDecode } = useMemo(() => {
    const needToLoad: string[] = [];
    const needToDecode: string[] = [];
    for (const [idx, r] of rawImageExists.entries()) {
      if (paths[idx]) {
        if (!r) {
          needToLoad.push(paths[idx]);
        }
        if (r && !decoded[idx]) {
          needToDecode.push(paths[idx]);
        }
      }
    }
    return { needToLoad, needToDecode };
  }, [paths, decoded, rawImageExists]);

  useDeepCompareEffect(() => {
    if (needToLoad.length > 0) {
      loadCachedImages(needToLoad);
    }
    if (needToDecode.length > 0) {
      decodeExistingRawImages(needToDecode);
    }
  }, [needToLoad, needToDecode]);

  return decoded ?? {};
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
