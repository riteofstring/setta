import { type SettingsState } from "utils/generatedTypes";

export type KeyActionEvent = Event | KeyboardEvent | MouseEvent;

export type KeyAction = (event: KeyboardEvent) => void;
export type KeyUpAction = (event: KeyActionEvent) => void;

export type ShortcutTrackingName =
  | "showTooltipShortcut"
  | "incrementTooltipPageShortcut"
  | "decrementTooltipPageShortcut"
  | "copyTooltipTextShortcut";

export type ShortcutRegistration = {
  keyCombo: string | null | undefined;
  keyDownAction: KeyAction;
  keyUpAction: KeyUpAction | null;
  allowRepeat: boolean;
  trackingName: ShortcutTrackingName | null;
};

export type SettingsShortcuts = SettingsState["shortcuts"];
