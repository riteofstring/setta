import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import C from "constants/constants.json";
import React from "react";
import { useGetSectionType } from "state/hooks/uiTypes";
import { DrawAreaSettings } from "./DrawAreaSettings";
import { InputAreaSettings } from "./InputAreaSettings";
import { SocialAreaSettings } from "./SocialAreaSettings";

const _SectionConfig = React.forwardRef(({ sectionId }, ref) => {
  return <SectionConfigCore sectionId={sectionId} />;
});

export const SectionConfig = React.memo(_SectionConfig);

function SectionConfigCore({ sectionId }) {
  // pass infoViewHandlersContents down?
  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-clip">
      {/* <div className="flex justify-between">
        <p
          className="mt-2 text-xs font-semibold uppercase text-setta-400"
          {...getFloatingBoxHandlers(
             "Select your card's type. Options include: Object, List of Objects, Dictionary of Objects, and Info. The Info Card only takes in Markdown text.",
          )}
        >
          Card Types
        </p>
        <SaveUITypeConfig />
      </div> */}

      {/* <SectionConfigTypeSelection sectionId={sectionId} /> */}

      <p
        className="mt-4 text-xs font-semibold uppercase text-setta-400"
        {...getFloatingBoxHandlers(
          "Choose which arguments appear in your selected card.",
        )}
      >
        Contents
      </p>
      <SpecializedConfiguration sectionId={sectionId} />
    </div>
  );
}

function SpecializedConfiguration({ sectionId }) {
  const sectionType = useGetSectionType(sectionId, "type");
  // if (sectionType === C.OUTPUT) {
  //   return <OutputsSearch sectionId={sectionId} />;
  // } else
  if (sectionType === C.SOCIAL) {
    return <SocialAreaSettings sectionId={sectionId} />;
  } else if (sectionType === C.DRAW) {
    return <DrawAreaSettings sectionId={sectionId} />;
  } else if (sectionType === C.SECTION || sectionType === C.GLOBAL_VARIABLES) {
    return <InputAreaSettings sectionId={sectionId} />;
  }
}
