import { useGetSelectedOutputValues } from "hooks/useSectionContents";
import _ from "lodash";
import { LineChart } from "utils/Charts/LineChart";

export function OutputArea({ sectionId }) {
  const selectedGroups = useGetSelectedOutputValues(sectionId);

  return (
    <>
      {_.map(selectedGroups, (group) => (
        <OneChart
          series={group.children}
          title={group.name}
          key={`${sectionId}-${group.name}-chart`}
        />
      ))}
    </>
  );
}

export function OneChart({ series, title }) {
  console.log("my series", series)
  return <LineChart width={500} height={500} series={series} />;
}
