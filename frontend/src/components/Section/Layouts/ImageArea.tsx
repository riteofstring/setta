import React, { useEffect } from "react";
import { useDecodedImages } from "state/definitions";
import {
  decodeExistingRawImages,
  useImageArtifact,
} from "state/hooks/artifacts";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";

const IMAGE_GPU_CONTROL_PREFIX = "image";

function _ImageArea({ sectionId }: { sectionId: string }) {
  const imageArtifact = useImageArtifact(sectionId);
  const decodedImage = useDecodedImages((state) =>
    imageArtifact ? state.x[imageArtifact.id] : null,
  );
  useEffect(() => {
    if (!imageArtifact) {
      return;
    }
    const currentContentId = imageArtifact.value.contentId;
    if (!decodedImage || decodedImage.dataset.contentId !== currentContentId) {
      void decodeExistingRawImages([imageArtifact.id]);
    }
  }, [imageArtifact, decodedImage]);
  // const { getRootProps, isDragActive } = useLoadArtifactViaDropzone(
  //   sectionId,
  //   false,
  //   ArtifactTypeEnum.IMG,
  // );
  const isDragActive = false;
  return (
    <figure
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} section-w-full section-row-main flex overflow-clip px-3 pb-1 pt-1 ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`}
      data-gpu-flow-control={`${IMAGE_GPU_CONTROL_PREFIX}:${sectionId}`}
      data-gpu-flow-interactive="true"
      // {...getRootProps()}
    >
      {!!decodedImage && (
        <ImageAreaCore sectionId={sectionId} imageSrc={decodedImage.src} />
      )}
    </figure>
  );
}

function ImageAreaCore({
  sectionId,
  imageSrc,
}: {
  sectionId: string;
  imageSrc: string;
}) {
  const imgSizeLoaded = true;

  return (
    imgSizeLoaded && (
      <img
        src={imageSrc}
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} h-auto max-h-full w-full self-center object-contain`}
        data-gpu-flow-control={`${IMAGE_GPU_CONTROL_PREFIX}:preview:${sectionId}`}
        data-gpu-flow-interactive="true"
      />
    )
  );
}

export const ImageArea = React.memo(_ImageArea);
