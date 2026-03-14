import React, { useEffect } from "react";
import {
  decodeExistingRawImages,
  useImageArtifact,
} from "state/hooks/artifacts";
import { useDecodedImages } from "state/stores/artifactStores";

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
      className={`section-w-full section-row-main flex overflow-clip px-3 pb-1 pt-1 ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`}
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
  // const imgSizeLoaded = useImgArtifactAreaSize(sectionId, image);

  const imgSizeLoaded = true;

  return (
    imgSizeLoaded && (
      <img
        src={imageSrc}
        className="h-auto max-h-full w-full self-center object-contain"
      />
    )
  );
}

export const ImageArea = React.memo(_ImageArea);
