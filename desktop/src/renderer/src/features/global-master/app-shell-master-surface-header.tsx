import type { AppearanceMasterVoiceShortcut } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import { Sparkles, X } from "lucide-react";

import { masterPaneFocusShortcutLabel, masterVoiceShortcutLabel } from "./master-shortcuts";

export function MasterSurfaceHeader({
  headingId,
  masterVoiceShortcut,
  onClose,
  platform,
  variant,
}: {
  headingId: string;
  masterVoiceShortcut: AppearanceMasterVoiceShortcut;
  onClose?: () => void;
  platform: DesktopPlatform;
  variant: "overlay" | "pane";
}) {
  return (
    <header className="setta-master-overlay-header">
      <span aria-hidden="true" className="setta-master-overlay-mark">
        <Sparkles />
      </span>
      <div className="min-w-0 flex-1">
        <div className="setta-master-overlay-eyebrow">Global master</div>
        <h1 id={headingId}>{variant === "pane" ? "Setta" : "Ask Setta"}</h1>
      </div>
      <span className="setta-master-overlay-shortcuts">
        <kbd className="setta-master-overlay-shortcut">
          Text {masterPaneFocusShortcutLabel(platform)}
        </kbd>
        <kbd className="setta-master-overlay-shortcut">
          Voice {masterVoiceShortcutLabel(platform, masterVoiceShortcut)}
        </kbd>
      </span>
      {onClose ? (
        <button
          aria-label="Close Ask Setta"
          className="setta-master-overlay-icon-button"
          onClick={onClose}
          type="button"
        >
          <X />
        </button>
      ) : null}
    </header>
  );
}
