import { ParentSize } from "@visx/responsive";
import { useGetSelectedOutputValues } from "hooks/useSectionContents";
import { LineChart } from "utils/Charts/LineChart";

export function OutputArea({ sectionId }) {
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
    <div className="h-full">
      <ParentSize
        className="-my-2 flex flex-1 flex-col px-8 pt-2"
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
    </div>
  );
}
