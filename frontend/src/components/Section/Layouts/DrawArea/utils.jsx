import _ from "lodash";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { addImageArtifactAndMaybeCreateNewLayer } from "state/actions/artifacts";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { useArtifacts } from "state/definitions";

export function useImageLoadViaDropzone(sectionId, activeLayerId) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      acceptedFiles.forEach((file) => {
        const reader = new FileReader();

        reader.onload = async () => {
          await addImageArtifactAndMaybeCreateNewLayer(
            sectionId,
            activeLayerId,
            reader.result,
          );
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
