import C from "constants/constants.json";
import React from "react";
import { useSectionType } from "state/hooks/uiTypes";
import { DrawAreaSettings } from "./DrawAreaSettings";
import { InfoAreaSettings } from "./InfoAreaSettings";
import { InputAreaSettings } from "./InputAreaSettings";
import { SocialAreaSettings } from "./SocialAreaSettings";

const _SectionConfig = React.forwardRef(({ sectionId }, ref) => {
  return <SectionConfigCore sectionId={sectionId} />;
});

export const SectionConfig = React.memo(_SectionConfig);

function SectionConfigCore({ sectionId }) {
  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-clip">
      <SpecializedConfiguration sectionId={sectionId} />
    </div>
  );
}

function SpecializedConfiguration({ sectionId }) {
  const sectionType = useSectionType(sectionId, "type");
  // if (sectionType === C.OUTPUT) {
  //   return <OutputsSearch sectionId={sectionId} />;
  // } else
  if (sectionType === C.SOCIAL) {
    return <SocialAreaSettings sectionId={sectionId} />;
  } else if (sectionType === C.DRAW) {
    return <DrawAreaSettings sectionId={sectionId} />;
  } else if (sectionType === C.SECTION || sectionType === C.GLOBAL_VARIABLES) {
    return <InputAreaSettings sectionId={sectionId} />;
  } else if (sectionType === C.INFO) {
    return <InfoAreaSettings sectionId={sectionId} />;
  }
}
