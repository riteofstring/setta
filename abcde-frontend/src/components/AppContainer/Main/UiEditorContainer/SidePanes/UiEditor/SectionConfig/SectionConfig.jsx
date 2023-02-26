import { OUTPUT, SOCIAL } from "abcde-utils/src/constants";
import { useGetSectionType } from "hooks/useSectionType";
import { ConstantInfoView, useSetCurrInfoView } from "models/info/infoView";
import { useUIEditor } from "models/uiEditor";
import React from "react";
import { IoArrowBack } from "react-icons/io5";
import { goToParamConfigTab } from "thunks/switchTabs";
import { Button } from "utils/atoms/buttons/Button";
import { SaveUITypeConfig } from "../SaveUITypeConfig";
import { CollectionsSearch } from "./CollectionsSearch";
import { OutputsSearch } from "./OutputSearch";
import { SectionConfigTypeSelection } from "./SectionConfigTypeSelection";
import { SocialTypeSearch } from "./SocialTypeSearch";

const _SectionConfig = React.forwardRef(({ sectionId }, ref) => {
  return (
    <>
      <GoBackButton sectionId={sectionId} />
      <SectionConfigCore sectionId={sectionId} />
    </>
  );
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
      <h3
        className="mt-2 text-xs font-semibold uppercase text-slate-400"
        {...infoViewHandlersCard}
      >
        Card Types
      </h3>
      <SaveUITypeConfig />
      <SectionConfigTypeSelection sectionId={sectionId} />

      <h3
        className="mt-4 text-xs font-semibold uppercase text-slate-400"
        {...infoViewHandlersContents}
      >
        Contents
      </h3>
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

function GoBackButton({ sectionId }) {
  const cameFromUIConfig = useUIEditor((x) => x.cameFromUIConfig);
  const onGoBackClick = () => goToParamConfigTab({ sectionId });

  const goBackBtnStyles =
    "mt-2 border border-solid border-slate-300 font-bold text-sm self-stretch justify-center text-slate-800 hover:bg-slate-200 hover:text-slate-900 py-1 px-2 rounded-md gap-1 select-none my-2 self-start";

  return cameFromUIConfig ? (
    <Button twClasses={goBackBtnStyles} onClick={onGoBackClick}>
      <IoArrowBack className="h-5 w-5" /> Go back
    </Button>
  ) : null;
}
