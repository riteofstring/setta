import { ParentSize } from "@visx/responsive";
import { LineChart } from "components/Utils/Charts/LineChart";
import React from "react";
import { useArtifactData } from "state/hooks/artifacts";

function _ArtifactArea({ sectionId }) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  return Object.values(artifacts).map((data, idx) => (
    <ArtifactSwitch key={idx} data={data} />
  ));
}

export const ArtifactArea = React.memo(_ArtifactArea);

function ArtifactSwitch({ data }) {
  switch (data.type) {
    case "list":
      return (
        <OneChart series={{ [data.displayName]: data.value }} title={"test"} />
      );
    case "img":
      return <OneImg img={data.value} />;
  }
}

function OneChart({ series, title }) {
  const seriesWithX = [];
  for (const [name, data] of Object.entries(series)) {
    seriesWithX.push({ name, values: data.map((y, i) => ({ x: i, y })) });
  }

  return (
    <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
      <ParentSize className="single-cell-child -my-2 py-1" debounceTime={0}>
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

function OneImg({ img }) {
  return (
    <figure className="section-w-full section-row-main flex overflow-clip px-3 pb-1 pt-1">
      <img
        src={`data:image/png;base64,${img}`}
        // alt={altText}
        className="h-auto max-h-full w-full self-center object-contain"
      />
    </figure>
  );
}
