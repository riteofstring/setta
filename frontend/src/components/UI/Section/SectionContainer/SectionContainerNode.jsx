import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { SectionContainer } from "./SectionContainer";

export function SectionContainerNode({ id }) {
  // In SectionPane, topLevelSectionPositions doesn't update fast enough.
  // So we have to double check here if id actually exists in the state.
  // For example, id might have been deleted, but topLevelSectionPositions hasn't yet updated.
  const sectionInfo = useSectionInfos((x) => !_.isUndefined(x.x[id]));
  return sectionInfo && <SectionContainer sectionId={id} />;
}
