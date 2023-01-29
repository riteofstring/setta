import { ResponsiveLine } from "@nivo/line";
import { useGetSelectedOutputValues } from "hooks/useSectionContents";
import _ from "lodash";

export function OutputArea({ sectionId }) {
  const selectedGroups = useGetSelectedOutputValues(sectionId);

  return (
    <>
      {_.map(selectedGroups, (group) => (
        <LineChart
          outputs={group.children}
          title={group.name}
          key={`${sectionId}-${group.name}-chart`}
        />
      ))}
    </>
  );
}

function LineChart({ outputs, title }) {
  const data = outputs.map((d) => ({
    id: d.name,
    data: d.values.map((s, idx) => ({ x: idx, y: s })),
    color: "rgb(255, 99, 132)",
  }));

  return (
    <ResponsiveLine
      data={data}
      margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
      xScale={{ type: 'point' }}
      yScale={{
        type: "linear",
        min: "auto",
        max: "auto",
        stacked: true,
        reverse: false,
      }}
      // height={300}
      // width={300}
      legends={[
        {
          anchor: "bottom-right",
          direction: "column",
          justify: false,
          translateX: 100,
          translateY: 0,
          itemsSpacing: 0,
          itemDirection: "left-to-right",
          itemWidth: 80,
          itemHeight: 20,
          itemOpacity: 0.75,
          symbolSize: 12,
          symbolShape: "circle",
          symbolBorderColor: "rgba(0, 0, 0, .5)",
          effects: [
            {
              on: "hover",
              style: {
                itemBackground: "rgba(0, 0, 0, .03)",
                itemOpacity: 1,
              },
            },
          ],
        },
      ]}
    />
  );
}
