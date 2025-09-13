import _ from "lodash";
import { useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  addArtifactAndMaybeCreateNewArtifactGroup,
  loadArtifacts,
  prepareDataURLForRendering,
} from "state/actions/artifacts";
import { useArtifacts, useImages, useProjectState } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";
import { res200 } from "utils/endpointUtils";
import { route_load_image_artifact } from "utils/generatedEndpoints";

async function loadImage(imagePath: string) {
  const res = await route_load_image_artifact({ imagePath });
  if (res200(res)) {
    const image = new Image();
    image.src = res.data;
    await image.decode();
    useImages.setState((state) => ({ x: { ...state.x, [imagePath]: image } }));
  }
}

export function useLoadedImageArtifact(imagePath: string) {
  const image = useImages((x) => x.x[imagePath]);

  useEffect(() => {
    if (!image && imagePath) {
      loadImage(imagePath);
    }
  }, [!!image]);

  return image;
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
