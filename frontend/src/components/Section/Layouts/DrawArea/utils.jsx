import _ from "lodash";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { newArtifact, newLayer } from "utils/objs/artifact";

export function useImageLoadViaDropzone(sectionId, activeLayerId) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      acceptedFiles.forEach((file) => {
        const reader = new FileReader();

        reader.onload = async () => {
          const artifactId = createNewId();
          const image = new Image();
          image.src = reader.result;
          await image.decode();
          useArtifacts.setState({
            [artifactId]: newArtifact({
              value: image,
              type: "img",
            }),
          });
          useSectionInfos.setState((state) => {
            let layerId = activeLayerId;
            if (!layerId) {
              layerId = createNewId();
              state.artifactGroups[layerId] = newLayer({});
              state.x[sectionId].artifactGroupIds.push(layerId);
            }
            state.artifactGroups[layerId].artifactIds.push(artifactId);
          });
        };

        reader.onerror = (error) => {
          console.error("Error reading file:", error);
        };

        // Read the file as a Data URL (base64)
        reader.readAsDataURL(file);
      });
    },
    [sectionId, activeLayerId],
  );

  return useDropzone({ onDrop });
}

export const debouncedSetBrushStrokesArtifact = _.debounce(
  (artifactId, strokes) => {
    useArtifacts.setState((state) => ({
      [artifactId]: { ...state[artifactId], value: _.cloneDeep(strokes) },
    }));
  },
  50,
);

export const debouncedSendDrawingToInteractiveTasks = _.debounce(
  (sectionId, fnToBase64) => {
    sendToInteractiveTasks([sectionId, "drawing"], fnToBase64());
  },
  500,
);
