import React from "react";
import { useAllSectionArtifacts } from "state/hooks/artifacts";
import { useImgArtifactAreaSize } from "state/hooks/sectionSizes";

export function _ImageArea({ sectionId }) {
  const loadedArtifacts = useAllSectionArtifacts(sectionId, ["value"]);
  const artifact = Object.values(loadedArtifacts)[0];
  return (
    !!artifact && <ImageAreaCore sectionId={sectionId} image={artifact.value} />
  );
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
