import { ParentSize } from "@visx/responsive";
import { useGetSelectedOutputValues } from "hooks/useSectionContents";
import _ from "lodash";
import { LineChart } from "utils/Charts/LineChart";

export function OutputArea({ sectionId }) {
  const selectedGroups = useGetSelectedOutputValues(sectionId);

  return (
    <MultipleCharts sectionId={sectionId} selectedGroups={selectedGroups} />
  );
}

function MultipleCharts({ sectionId, selectedGroups }) {
  return (
    <ParentSize debounceTime={0}>
      {(parent) => (
        <GetCharts
          parent={parent}
          sectionId={sectionId}
          selectedGroups={selectedGroups}
        />
      )}
    </ParentSize>
  );
}

function GetCharts({ parent, sectionId, selectedGroups }) {
  const height = parent.height / _.size(selectedGroups);

  return (
    <>
      {_.map(selectedGroups, (group) => (
        <OneChart
          width={parent.width}
          height={height}
          series={group.children}
          key={`${sectionId}-${group.name}-chart`}
        />
      ))}
    </>
  );
}

function OneChart({ series, width, height }) {
  const seriesWithX = series.map((s) => ({
    ...s,
    values: s.values.map((y, i) => ({ x: i, y })),
  }));
  return <LineChart width={width} height={height} series={seriesWithX} />;
}
