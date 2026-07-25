import type { AppearanceMasterVoiceShortcut } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import { Sparkles } from "lucide-react";

import { masterPaneFocusShortcutLabel, masterVoiceShortcutLabel } from "./master-shortcuts";

export function MasterSurfaceHeader({
  headingId,
  masterVoiceShortcut,
  platform,
}: {
  headingId: string;
  masterVoiceShortcut: AppearanceMasterVoiceShortcut;
  platform: DesktopPlatform;
}) {
  return (
    <header className="setta-master-overlay-header">
      <span aria-hidden="true" className="setta-master-overlay-mark">
        <Sparkles />
      </span>
      <div className="min-w-0 flex-1">
        <div className="setta-master-overlay-eyebrow">Global master</div>
        <h1 id={headingId}>Setta</h1>
      </div>
      <span className="setta-master-overlay-shortcuts">
        <kbd className="setta-master-overlay-shortcut">
          Text {masterPaneFocusShortcutLabel(platform)}
        </kbd>
        <kbd className="setta-master-overlay-shortcut">
          Voice {masterVoiceShortcutLabel(platform, masterVoiceShortcut)}
        </kbd>
      </span>
    </header>
  );
}
