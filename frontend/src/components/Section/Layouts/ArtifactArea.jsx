import { ParentSize } from "@visx/responsive";
import { LineChart } from "components/Utils/Charts/LineChart";
import _ from "lodash";
import React from "react";
import { useArtifactValues } from "state/hooks/artifacts";

function _ArtifactArea({ sectionId }) {
  const values = useArtifactValues(sectionId);
  console.log("values", values);
  return _.size(values) > 0 && <OneChart series={values} title={"test"} />;
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

export const ArtifactArea = React.memo(_ArtifactArea);
