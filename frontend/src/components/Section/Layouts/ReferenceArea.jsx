import React from "react";
import { useSectionSelectedItem } from "state/hooks/sectionVariants";
import { SectionSearch } from "../SectionParts/Search";

function _ReferenceArea({ sectionId }) {
  const selectedItem = useSectionSelectedItem(sectionId);

  return <SectionSearch sectionId={sectionId} selectedItem={selectedItem} />;
}

export const ReferenceArea = React.memo(_ReferenceArea);
