import _ from "lodash";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetSectionConfig(sectionId, props) {
  const [configId] = useGetSectionInfo(sectionId, ["configId"]);
  return useSectionConfigs(
    (x) => props.map((y) => x.x[configId]?.[y]),
    _.isEqual
  );
}
