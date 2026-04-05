import { getSectionChromeStaticTopDragHandleClassName } from "components/Section/Container/sectionChrome";
import React from "react";
import type { SettingsGraphSubstrateCanarySectionShellAppearance } from "./settingsGraphSubstrateCanarySectionShellAppearance";

type SettingsGraphSubstrateCanarySectionTopDragHandleProps = {
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance;
};

function _SettingsGraphSubstrateCanarySectionTopDragHandle({
  appearance,
}: SettingsGraphSubstrateCanarySectionTopDragHandleProps) {
  if (!appearance.surfaceDecorations.showTopDragHandle) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/canary-section:pointer-events-auto group-hover/canary-section:opacity-100"
      data-resize-handle-tone={appearance.surfaceDecorations.resizeHandleTone}
      data-testid="graph-substrate-canary-section-top-drag-handle"
      style={appearance.sectionStyleVars}
    >
      <div
        className={`h-1 w-8 rounded-full ${getSectionChromeStaticTopDragHandleClassName(
          {
            resizeHandleTone: appearance.surfaceDecorations.resizeHandleTone,
            hasSectionStyleTheme: appearance.hasSectionStyleTheme,
          },
        )}`}
      />
    </div>
  );
}

export const SettingsGraphSubstrateCanarySectionTopDragHandle = React.memo(
  _SettingsGraphSubstrateCanarySectionTopDragHandle,
);
