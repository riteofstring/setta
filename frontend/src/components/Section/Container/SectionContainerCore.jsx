import React from "react";
import { useActiveSection } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { useGetSectionInfo } from "state/hooks/sections";
import { useSectionTypeName } from "state/hooks/uiTypes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import { getOnSectionClick } from "./utils";

function _SectionContainerCore({ sectionId }) {
  const sectionTypeName = useSectionTypeName(sectionId);
  const isActiveSection = useActiveSection((x) => x.ids.includes(sectionId));
  const sectionIsFrozen = useGetSectionInfo(sectionId, "isFrozen");
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  return (
    <section
      className={`group/card-section rounded-xl border border-white bg-white dark:border-setta-700 dark:bg-setta-925 ${boxShadow} dndline w-min [transition:_box-shadow_500ms_ease]`}
      onClick={getOnSectionClick({ sectionId, isActiveSection })}
      ref={refForPosition}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isActiveSection={isActiveSection}
        isWrongType={false} // TODO add the logic for this
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  () => true,
);
