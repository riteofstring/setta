import React from "react";
import { useArtifactData } from "state/hooks/artifacts";
import { useImgArtifactAreaSize } from "state/hooks/sectionSizes";

export function _ImageArea({ sectionId }) {
  const { artifacts } = useArtifactData(sectionId);
  const image = Object.values(artifacts)[0]?.value;
  return !!image && <ImageAreaCore sectionId={sectionId} image={image} />;
}

function ImageAreaCore({ sectionId, image }) {
  const imgSizeLoaded = useImgArtifactAreaSize(sectionId, image);

  return (
    <figure className="section-w-full section-row-main flex overflow-clip px-3 pb-1 pt-1">
      {imgSizeLoaded && (
        <img
          src={image.src}
          className="h-auto max-h-full w-full self-center object-contain"
        />
      )}
    </figure>
  );
}

export const ImageArea = React.memo(_ImageArea);
