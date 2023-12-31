import { useGetSectionType } from "hooks/useSectionType";
import { ConstantInfoView, useSetCurrInfoView } from "models/info/infoView";
import React from "react";
import { OUTPUT, SOCIAL } from "z_utils/constants";
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
  const infoViewHandlersCard = useSetCurrInfoView(
    ConstantInfoView.SECTIONCONFIG_CARDTYPES_SEARCH
  );
  const infoViewHandlersContents = useSetCurrInfoView(
    ConstantInfoView.SECTIONCONFIG_CONTENTS_SEARCH
  );

  // pass infoViewHandlersContents down?
  return (
    <div className="flex flex-grow flex-col gap-1 overflow-y-hidden">
      <div className="flex justify-between">
        <p
          className="mt-2 text-xs font-semibold uppercase text-slate-400"
          {...infoViewHandlersCard}
        >
          Card Types
        </p>
        <SaveUITypeConfig />
      </div>

      <SectionConfigTypeSelection sectionId={sectionId} />

      <p
        className="mt-4 text-xs font-semibold uppercase text-slate-400"
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
  if (sectionType === OUTPUT) {
    return <OutputsSearch sectionId={sectionId} />;
  } else if (sectionType === SOCIAL) {
    return <SocialTypeSearch sectionId={sectionId} />;
  } else {
    return <CollectionsSearch sectionId={sectionId} />;
  }
}
