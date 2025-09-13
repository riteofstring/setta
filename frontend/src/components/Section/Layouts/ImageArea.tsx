import React from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useLoadedImageArtifact } from "state/hooks/artifacts";
import { SectionTypeEnum } from "utils/generatedTypes";

function _ImageArea({ sectionId }: { sectionId: string }) {
  const imagePath = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Image,
    );
    return impl.imagePath;
  });

  const imageSrc = useLoadedImageArtifact(imagePath);
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
      {!!imageSrc && (
        <ImageAreaCore sectionId={sectionId} imageSrc={imageSrc} />
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
