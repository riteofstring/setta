import C from "constants/constants.json";
import React from "react";
import { getInfoViewHandlers } from "state/actions/infoView";
import { useGetSectionType } from "state/hooks/useUITypes";
import { constInfoViews } from "utils/constants";
import { SaveUITypeConfig } from "../SaveUITypeConfig";
import { CollectionsSearch } from "./CollectionsSearch";
import { OutputsSearch } from "./OutputSearch";
import { SectionConfigTypeSelection } from "./SectionConfigTypeSelection";
import { SocialTypeSearch } from "./SocialTypeSearch";

const _SectionConfig = React.forwardRef(({ sectionId }, ref) => {
  return <SectionConfigCore sectionId={sectionId} />;
});

export const SectionConfig = React.memo(_SectionConfig);

function SectionConfigCore({ sectionId }) {
  const infoViewHandlersCard = getInfoViewHandlers(
    constInfoViews.SECTIONCONFIG_CARDTYPES_SEARCH,
  );
  const infoViewHandlersContents = getInfoViewHandlers(
    constInfoViews.SECTIONCONFIG_CONTENTS_SEARCH,
  );

  // pass infoViewHandlersContents down?
  return (
    <div className="flex flex-grow flex-col gap-1 overflow-y-hidden">
      <div className="flex justify-between">
        <p
          className="mt-2 text-xs font-semibold uppercase text-setta-400"
          {...infoViewHandlersCard}
        >
          Card Types
        </p>
        <SaveUITypeConfig />
      </div>

      <SectionConfigTypeSelection sectionId={sectionId} />

      <p
        className="mt-4 text-xs font-semibold uppercase text-setta-400"
        {...infoViewHandlersContents}
      >
        Contents
      </p>
      <SearchSwitch sectionId={sectionId} />
    </div>
  );
}

function SearchSwitch({ sectionId }) {
  const sectionType = useGetSectionType(sectionId, "type");
  if (sectionType === C.OUTPUT) {
    return <OutputsSearch sectionId={sectionId} />;
  } else if (sectionType === C.SOCIAL) {
    return <SocialTypeSearch sectionId={sectionId} />;
  } else {
    return <CollectionsSearch sectionId={sectionId} />;
  }
}
