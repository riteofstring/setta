import C from "constants/constants.json";
import React from "react";
import { getInfoViewHandlers } from "state/actions/infoView";
import { useGetSectionType } from "state/hooks/uiTypes";
import { CONST_INFO_VIEWS } from "utils/constants";
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
          {...getInfoViewHandlers(
            CONST_INFO_VIEWS.SECTIONCONFIG_CARDTYPES_SEARCH,
          )}
        >
          Card Types
        </p>
        <SaveUITypeConfig />
      </div> */}

      {/* <SectionConfigTypeSelection sectionId={sectionId} /> */}

      <p
        className="mt-4 text-xs font-semibold uppercase text-setta-400"
        {...getInfoViewHandlers(CONST_INFO_VIEWS.SECTIONCONFIG_CONTENTS_SEARCH)}
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
