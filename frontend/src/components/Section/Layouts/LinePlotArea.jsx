import { ParentSize } from "@visx/responsive";
import { LineChart } from "components/Utils/Charts/LineChart";
import React, { useEffect, useState } from "react";
import { useArtifactData } from "state/hooks/artifacts";

function _LinePlotArea({ sectionId }) {
  const { artifacts } = useArtifactData(sectionId);
  const data = Object.values(artifacts)[0];

  return (
    !!data && <LinePlotAreaCore series={{ [data.displayName]: data.value }} />
  );
}

export const LinePlotArea = React.memo(_LinePlotArea);

function LinePlotAreaCore({ title }) {
  const [array, setArray] = useState([1,2,3,4,5]);

  useEffect(() => {
    const interval = setInterval(() => {
      setArray((prevArray) => [...prevArray, Math.sin(prevArray.length + 1)]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const series = { fancy_graph: array };
  const seriesWithX = [];
  for (const [name, data] of Object.entries(series)) {
    seriesWithX.push({ name, values: data.map((y, i) => ({ x: i, y })) });
  }
  console.log("seriesWithX", seriesWithX)

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
