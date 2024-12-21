import _ from "lodash";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { maybeCreateArtifactAndUpdateSection } from "state/actions/artifacts";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { createNewId } from "utils/idNameCreation";

export function useImageLoadViaDropzone(sectionId) {
  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onload = () => {
        // The base64 string is in reader.result
        const base64String = reader.result.replace(
          /^data:image\/[a-z]+;base64,/,
          "",
        );
        const artifactId = createNewId();
        maybeCreateArtifactAndUpdateSection(sectionId, artifactId, {
          value: base64String,
          type: "img",
        });
      };

      reader.onerror = (error) => {
        console.error("Error reading file:", error);
      };

      // Read the file as a Data URL (base64)
      reader.readAsDataURL(file);
    });
  }, []);
  return useDropzone({ onDrop });
}

export const debouncedSetBrushStrokesArtifact = _.debounce(
  (sectionId, activeLayerId, strokes) => {
    maybeCreateArtifactAndUpdateSection(sectionId, activeLayerId, {
      type: "brushStrokes",
      value: _.cloneDeep(strokes),
    });
  },
  500,
);

export const debouncedSendDrawingToInteractiveTasks = _.debounce(
  (sectionId, fnToBase64) => {
    sendToInteractiveTasks([sectionId, "drawing"], fnToBase64());
  },
  500,
);
