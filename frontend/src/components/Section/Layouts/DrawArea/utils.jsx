import _ from "lodash";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { newArtifact } from "utils/objs/artifact";

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
        useArtifacts.setState((x) => {
          x.x[artifactId] = newArtifact({
            value: base64String,
            type: "img",
          });
        });
        useSectionInfos.setState((state) => {
          state.x[sectionId].artifactIds.push(artifactId);
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
    // layer ids are the same as artifact ids
    // because we assume each artifact gets its own layer
    useArtifacts.setState((x) => {
      if (!(activeLayerId in x.x)) {
        x.x[activeLayerId] = newArtifact({
          type: "brushStrokes",
          value: _.cloneDeep(strokes),
        });
      } else {
        x.x[activeLayerId].value = _.cloneDeep(strokes);
      }
    });

    useSectionInfos.setState((x) => {
      const artifactIds = x.x[sectionId].artifactIds;
      if (!artifactIds.includes(activeLayerId)) {
        artifactIds.push(activeLayerId);
      }
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
