import {
  base64StrToImgSrc,
  base64ToImageObj,
} from "components/Section/Layouts/DrawArea/base64Conversion";
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
  ZustandDecodedImagesType,
} from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";
import { res200 } from "utils/endpointUtils";
import {
  route_load_chart_data,
  route_load_image_artifacts,
} from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

async function loadImage(imagePath: string) {
  const res = await route_load_image_artifacts({ imagePaths: [imagePath] });
  if (res200(res)) {
    if (res.data[0]) {
      const imageSrc = base64StrToImgSrc(res.data[0]);
      useImages.setState((state) => ({
        x: { ...state.x, [imagePath]: imageSrc },
      }));
    }
  }
}

export function useLoadedImageArtifact(sectionId: string) {
  const imagePath = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Image,
    );
    return impl.imagePath;
  });

  const image = useImages((x) => x.x[imagePath]);

  useEffect(() => {
    if (!image && imagePath) {
      loadImage(imagePath);
    }
  }, [!!image]);

  return image;
}

async function loadChartData(dataPath: string) {
  const res = await route_load_chart_data({ dataPath });
  if (res200(res)) {
    useChartData.setState((state) => ({
      x: { ...state.x, [dataPath]: res.data },
    }));
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
      loadChartData(dataPath);
    }
  }, [!!data]);

  return data ?? {};
}

async function loadDrawAreaImages(imagePaths: Array<string>) {
  const res = await route_load_image_artifacts({ imagePaths });
  if (res200(res)) {
    const images: ZustandDecodedImagesType["x"] = {};
    for (const [idx, r] of res.data.entries()) {
      if (imagePaths[idx]) {
        images[imagePaths[idx]] = await base64ToImageObj(r);
      }
    }
    useDecodedImages.setState((state) => ({ x: { ...state.x, ...images } }));
  }
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

  const data = useDecodedImages((x) => paths.map((p) => x.x[p]), _.isEqual);
  const notLoaded = useMemo(() => {
    const missing: string[] = [];
    for (const [idx, d] of data.entries()) {
      if (!d && paths[idx]) {
        missing.push(paths[idx]);
      }
    }
    return missing;
  }, [data, paths]);

  useDeepCompareEffect(() => {
    if (notLoaded) {
      loadDrawAreaImages(notLoaded);
    }
  }, [notLoaded]);

  return data ?? {};
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
