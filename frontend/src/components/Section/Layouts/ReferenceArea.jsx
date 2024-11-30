import React from "react";
import { getSectionVariantToShow } from "state/actions/sectionVariants";
import { useSectionInfos } from "state/definitions";
import { SectionSearch } from "../SectionParts/Search";

function _ReferenceArea({ sectionId }) {
  const selectedItem = useSectionInfos(
    (x) => getSectionVariantToShow(sectionId, x).selectedItem,
  );

  return <SectionSearch sectionId={sectionId} selectedItem={selectedItem} />;
}

export const ReferenceArea = React.memo(_ReferenceArea);
