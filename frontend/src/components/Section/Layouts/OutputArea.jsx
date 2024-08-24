import { ParentSize } from "@visx/responsive";
import { LineChart } from "components/Utils/Charts/LineChart";
import React from "react";
import { useGetSelectedOutputValues } from "state/hooks/sectionContents";

function _OutputArea({ sectionId }) {
  const group = useGetSelectedOutputValues(sectionId);
  console.log("group", group)
  if (!group) {
    return null;
  }
  
  // const data = useInteractive((x) => x.data);
  return group && <OneChart series={group} title={"test"} />;
}

function OneChart({ series, title }) {
  const seriesWithX = series.map((s) => ({
    ...s,
    values: s.values.map((y, i) => ({ x: i, y })),
  }));
  // const seriesWithX = [{ values: series.map((y, i) => ({ x: i, y })) }];
  return (
    <figure className="card-figure">
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

export const OutputArea = React.memo(_OutputArea);
