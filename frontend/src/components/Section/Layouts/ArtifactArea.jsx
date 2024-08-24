import { ParentSize } from "@visx/responsive";
import { LineChart } from "components/Utils/Charts/LineChart";
import React from "react";
import { useArtifactData } from "state/hooks/artifacts";

function _ArtifactArea({ sectionId }) {
  const data = useArtifactData(sectionId);
  return Object.entries(data).map(([name, data], idx) => (
    <ArtifactSwitch key={idx} name={name} data={data} />
  ));
}

export const ArtifactArea = React.memo(_ArtifactArea);

function ArtifactSwitch({ name, data }) {
  switch (data.type) {
    case "generic":
      return <OneChart series={{ [name]: data.value }} title={"test"} />;
    case "img":
      return <OneImg img={data.value} />;
  }
}

function OneChart({ series, title }) {
  const seriesWithX = [];
  for (const [name, data] of Object.entries(series)) {
    seriesWithX.push({ name, values: data.map((y, i) => ({ x: i, y })) });
  }

  console.log("seriesWithX", seriesWithX);
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
