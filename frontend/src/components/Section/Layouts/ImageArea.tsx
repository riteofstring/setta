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

  const image = useLoadedImageArtifact(imagePath);
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
      {!!image && <ImageAreaCore sectionId={sectionId} image={image} />}
    </figure>
  );
}

function ImageAreaCore({
  sectionId,
  image,
}: {
  sectionId: string;
  image: HTMLImageElement;
}) {
  // const imgSizeLoaded = useImgArtifactAreaSize(sectionId, image);

  // useEffect(() => {
  //   if (image?.src) {
  //   }
  // }, [image?.src]);

  const imgSizeLoaded = true;

  return (
    imgSizeLoaded && (
      <img
        src={image.src}
        className="h-auto max-h-full w-full self-center object-contain"
      />
    )
  );
}

export const ImageArea = React.memo(_ImageArea);
