import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";

export function useGetSectionInfo(sectionId, props) {
  return useSectionInfos(
    (x) => props.map((y) => x.x[sectionId]?.[y]),
    _.isEqual
  );
}

export function useGetManySectionInfos(sectionIds, props, prependId = false) {
  const _props = prependId ? ["id", ...props] : props;
  return useSectionInfos(
    (x) =>
      sectionIds.map((id) =>
        _props.map((name) => (name === "id" ? id : x.x[id]?.[name]))
      ),
    _.isEqual
  );
}

export function useSectionInfoNames() {
  return useSectionInfos((x) => _.mapValues(x.x, (y) => y.name));
}

export function useSomeSectionInfoNames(sectionIds) {
  return useSectionInfos((x) => sectionIds.map((y) => x.x[y].name));
}
