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
    <figure className="section-figure">
      <ParentSize
        className="-my-5 flex flex-1 flex-col px-8 pt-6"
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

function OneImg({ img }) {
  return (
    <figure className="section-figure">
      <img
        src={`data:image/png;base64,${img}`}
        // alt={altText}
        // className="h-auto max-w-full rounded-lg shadow-md"
        style={{
          width: "100%",
          height: "100%",
        }}
      />
    </figure>
  );
}
