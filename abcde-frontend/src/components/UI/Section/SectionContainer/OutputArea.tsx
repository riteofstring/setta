import { ParentSize } from "@visx/responsive";
import { useGetSelectedOutputValues } from "hooks/useSectionContents";
import React from "react";
import { LineChart } from "utils/Charts/LineChart";

function _OutputArea({ sectionId }) {
  const group = useGetSelectedOutputValues(sectionId);
  if (!group) {
    return null;
  }
  return <OneChart series={group.children} title={group.name} />;
}

function OneChart({ series, title }) {
  const seriesWithX = series.map((s) => ({
    ...s,
    values: s.values.map((y, i) => ({ x: i, y })),
  }));
  return (
    <figure className="h-full">
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
