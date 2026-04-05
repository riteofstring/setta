import { getSectionChromeStaticShellBorderClassName } from "components/Section/Container/sectionChrome";
import React from "react";
import type { SettingsGraphSubstrateCanarySectionShellAppearance } from "./settingsGraphSubstrateCanarySectionShellAppearance";

type SettingsGraphSubstrateCanarySectionBorderProps = {
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance;
};

function _SettingsGraphSubstrateCanarySectionBorder({
  appearance,
}: SettingsGraphSubstrateCanarySectionBorderProps) {
  if (
    !appearance.frameStructure.shellBorderVisible ||
    appearance.frameStructure.shellBorderTone === "transparent"
  ) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`transition-radius pointer-events-none absolute inset-0 border ${appearance.frameStructure.cornerStyle === "small" ? "rounded-sm" : "rounded-lg"} ${getSectionChromeStaticShellBorderClassName(
        {
          shellBorderTone: appearance.frameStructure.shellBorderTone,
          hasSectionStyleTheme: appearance.hasSectionStyleTheme,
        },
      )}`}
      data-border-tone={appearance.frameStructure.shellBorderTone}
      data-testid="graph-substrate-canary-section-border"
      style={appearance.sectionStyleVars}
    />
  );
}

export const SettingsGraphSubstrateCanarySectionBorder = React.memo(
  _SettingsGraphSubstrateCanarySectionBorder,
);
