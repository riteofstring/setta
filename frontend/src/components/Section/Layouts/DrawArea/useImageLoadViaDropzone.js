import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { addImageArtifactAndMaybeCreateNewLayer } from "state/actions/artifacts";

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
