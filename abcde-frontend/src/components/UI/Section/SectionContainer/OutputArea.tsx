import { useGetSelectedOutputValues } from "hooks/useSectionContents";
import { LineChart } from "utils/Charts/LineChart";

export function OutputArea({ sectionId }) {
  const selectedGroups = useGetSelectedOutputValues(sectionId);

  return <LineChart width={500} height={500} />;
}
