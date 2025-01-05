import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { addArtifactAndMaybeCreateNewArtifactGroup } from "state/actions/artifacts";

export function useImageLoadViaDropzone(sectionId, createNewLayer) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      acceptedFiles.forEach((file) => {
        const reader = new FileReader();

        reader.onload = async () => {
          await addArtifactAndMaybeCreateNewArtifactGroup({
            sectionId,
            createNewArtifactGroup: createNewLayer,
            imgSrc: reader.result,
          });
        };

        reader.onerror = (error) => {
          console.error("Error reading file:", error);
        };

        // Read the file as a Data URL (base64)
        reader.readAsDataURL(file);
      });
    },
    [sectionId, createNewLayer],
  );

  return useDropzone({ onDrop });
}
