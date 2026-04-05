import { SectionContainer } from "components/Section/Container/SectionContainer";
import React from "react";

export type SettingsGraphSubstrateCanarySectionBodyShellChromeOwner =
  | "section-body"
  | "shell-layer";

export type SettingsGraphSubstrateCanarySectionBody = {
  sectionId: string;
  shellChromeOwner: SettingsGraphSubstrateCanarySectionBodyShellChromeOwner;
};

export function resolveSettingsGraphSubstrateCanarySectionBody({
  sectionId,
  shellChromeOwner,
}: SettingsGraphSubstrateCanarySectionBody): SettingsGraphSubstrateCanarySectionBody {
  return {
    sectionId,
    shellChromeOwner,
  };
}

function getSectionContainerChromeSuppression(
  shellChromeOwner: SettingsGraphSubstrateCanarySectionBodyShellChromeOwner,
) {
  switch (shellChromeOwner) {
    case "section-body":
      return {};
    case "shell-layer":
      return {
        forceHideOutline: true,
        forceHideTopDragHandle: true,
        forceTransparentBorder: true,
      };
  }
}

type SettingsGraphSubstrateCanarySectionBodyDomAdapterProps = {
  sectionBody: SettingsGraphSubstrateCanarySectionBody;
};

function _SettingsGraphSubstrateCanarySectionBodyDomAdapter({
  sectionBody,
}: SettingsGraphSubstrateCanarySectionBodyDomAdapterProps) {
  return (
    <SectionContainer
      sectionId={sectionBody.sectionId}
      isTopLevel={true}
      {...getSectionContainerChromeSuppression(sectionBody.shellChromeOwner)}
    />
  );
}

export const SettingsGraphSubstrateCanarySectionBodyDomAdapter = React.memo(
  _SettingsGraphSubstrateCanarySectionBodyDomAdapter,
  (previousProps, nextProps) =>
    previousProps.sectionBody.sectionId === nextProps.sectionBody.sectionId &&
    previousProps.sectionBody.shellChromeOwner ===
      nextProps.sectionBody.shellChromeOwner,
);
