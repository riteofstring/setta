import React from "react";
import { useArtifactData } from "state/hooks/artifacts";
import { useImgArtifactAreaSize } from "state/hooks/sectionSizes";

export function _ImageArea({ sectionId }) {
  const { artifacts } = useArtifactData(sectionId);
  const img = Object.values(artifacts)[0]?.value;
  return !!img && <ImageAreaCore sectionId={sectionId} img={img} />;
}

function ImageAreaCore({ sectionId, img }) {
  const base64String = `data:image/png;base64,${img}`;
  const imgSizeLoaded = useImgArtifactAreaSize(sectionId, base64String);

  return (
    <figure className="section-w-full section-row-main flex overflow-clip px-3 pb-1 pt-1">
      {imgSizeLoaded && (
        <img
          src={base64String}
          className="h-auto max-h-full w-full self-center object-contain"
        />
      )}
    </figure>
  );
}

export const ImageArea = React.memo(_ImageArea);
