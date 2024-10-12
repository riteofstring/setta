import { ParentSize } from "@visx/responsive";
import { LineChart } from "components/Utils/Charts/LineChart";
import React, { useEffect } from "react";
import { useSectionInfos } from "state/definitions";
import { useArtifactData } from "state/hooks/artifacts";
import { setImgArtifactSectionSizeOnLoad } from "state/hooks/sectionSizes";

function _ArtifactArea({ sectionId }) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  return Object.values(artifacts).map((data, idx) => (
    <ArtifactSwitch sectionId={sectionId} key={idx} data={data} />
  ));
}

export const ArtifactArea = React.memo(_ArtifactArea);

function ArtifactSwitch({ sectionId, data }) {
  switch (data.type) {
    case "list":
      return (
        <OneChart series={{ [data.displayName]: data.value }} title={"test"} />
      );
    case "img":
      return <OneImg sectionId={sectionId} img={data.value} />;
  }
}

function OneChart({ series, title }) {
  const seriesWithX = [];
  for (const [name, data] of Object.entries(series)) {
    seriesWithX.push({ name, values: data.map((y, i) => ({ x: i, y })) });
  }

  // ParentSize has min-w-0 and min-h-0 to avoid resizing bug:
  // https://github.com/airbnb/visx/issues/1014#issuecomment-1180677878
  return (
    <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
      <ParentSize
        className="single-cell-child -my-2 min-h-0 min-w-0 py-1"
        debounceTime={0}
      >
        {(parent) => (
          <LineChart
            width={parent.width}
            height={parent.height}
            series={seriesWithX}
          />
        )}
      </ParentSize>
    </figure>
  );
}

function OneImg({ sectionId, img }) {
  const base64String = `data:image/png;base64,${img}`;

  const widthOrHeightIsAuto = useSectionInfos((x) => {
    const { width, height } = x.x[sectionId].size;
    return width === "auto" || height === "auto";
  });

  useEffect(async () => {
    const imgSize = await getImageDimensionsFromBase64(base64String);
    setImgArtifactSectionSizeOnLoad(sectionId, imgSize);
  }, [base64String]);

  // useEffect(() => {
  //   if (widthOrHeightIsAuto) {
  //     setImgArtifactSectionSizeOnLoad(sectionId, base64String);
  //   }
  // }, [widthOrHeightIsAuto]);

  return (
    <figure className="section-w-full section-row-main flex overflow-clip px-3 pb-1 pt-1">
      <img
        src={base64String}
        className="h-auto max-h-full w-full self-center object-contain"
      />
    </figure>
  );
}
