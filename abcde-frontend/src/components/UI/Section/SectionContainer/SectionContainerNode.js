import { useStoreState } from "easy-peasy";
import React from "react";

import SectionContainer from "./SectionContainer";

export function SectionContainerNode({ id }) {
  // In SectionPane, topLevelSectionPositions doesn't update fast enough.
  // So we have to double check here if id actually exists in the state.
  // For example, id might have been deleted, but topLevelSectionPositions hasn't yet updated.
  const sectionInfo = useStoreState((x) => x.sectionInfos.x[id]);
  return sectionInfo ? (
    <SectionContainer sectionId={id} parentId={null} depth={0} />
  ) : null;
}
