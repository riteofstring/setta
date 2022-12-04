import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetSectionConfig(sectionId, props) {
  const [configId] = useGetSectionInfo(sectionId, ["configId"]);
  return useStoreState(
    (x) => props.map((y) => x.sectionConfigs.x[configId]?.[y]),
    _.isEqual
  );
}
