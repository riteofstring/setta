import { ParentSize } from "@visx/responsive";
import { LineChart } from "components/Utils/Charts/LineChart";
import React from "react";
import { useAllSectionArtifacts } from "state/hooks/artifacts";

function _LinePlotArea({ sectionId }) {
  const loadedArtifacts = useAllSectionArtifacts(sectionId, ["name", "value"]);
  const artifact = Object.values(loadedArtifacts)[0];
  return (
    !!artifact && (
      <LinePlotAreaCore series={{ [artifact.name]: artifact.value }} />
    )
  );
}

export const LinePlotArea = React.memo(_LinePlotArea);

function LinePlotAreaCore({ series, title }) {
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
