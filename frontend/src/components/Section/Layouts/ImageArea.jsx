import React from "react";
import { useSectionArtifactGroups } from "state/hooks/artifacts";
import { useImgArtifactAreaSize } from "state/hooks/sectionSizes";

export function _ImageArea({ sectionId }) {
  const { artifactGroups, loadedArtifacts } = useSectionArtifactGroups(
    sectionId,
    ["value"],
  );
  const artifact = loadedArtifacts[artifactGroups[0]?.artifactIds?.[0]];
  if (!artifact || !artifact.value) {
    return null;
  }
  return <ImageAreaCore sectionId={sectionId} image={artifact.value} />;
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
