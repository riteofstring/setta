import { SectionContainer } from "components/Section/Container/SectionContainer";
import React from "react";

function _SettingsGraphSubstrateCanaryDomSectionBody({
  sectionId,
}: {
  sectionId: string;
}) {
  return <SectionContainer sectionId={sectionId} isTopLevel={true} />;
}

export const SettingsGraphSubstrateCanaryDomSectionBody = React.memo(
  _SettingsGraphSubstrateCanaryDomSectionBody,
);
