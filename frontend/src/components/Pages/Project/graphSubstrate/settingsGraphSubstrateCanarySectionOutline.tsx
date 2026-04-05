import { getSectionChromeStaticOutlineClassName } from "components/Section/Container/sectionChrome";
import React from "react";
import type { SettingsGraphSubstrateCanarySectionShellAppearance } from "./settingsGraphSubstrateCanarySectionShellAppearance";

type SettingsGraphSubstrateCanarySectionOutlineProps = {
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance;
};

function _SettingsGraphSubstrateCanarySectionOutline({
  appearance,
}: SettingsGraphSubstrateCanarySectionOutlineProps) {
  if (appearance.frameStructure.shellOutlineWidth === 0) {
    return null;
  }

  const outlineWidthClassName =
    appearance.frameStructure.shellOutlineWidth === 2
      ? "outline-2"
      : "outline-4";

  return (
    <div
      aria-hidden="true"
      className={`transition-radius pointer-events-none absolute inset-0 outline ${appearance.frameStructure.cornerStyle === "small" ? "rounded-sm" : "rounded-lg"} ${outlineWidthClassName} ${getSectionChromeStaticOutlineClassName(
        {
          outlineTone: appearance.shellDecorations.outlineTone,
          hasSectionStyleTheme: appearance.hasSectionStyleTheme,
        },
      )}`}
      data-outline-tone={appearance.shellDecorations.outlineTone}
      data-testid="graph-substrate-canary-section-outline"
      style={appearance.sectionStyleVars}
    />
  );
}

export const SettingsGraphSubstrateCanarySectionOutline = React.memo(
  _SettingsGraphSubstrateCanarySectionOutline,
);
