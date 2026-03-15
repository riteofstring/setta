import { getIgnoreWhenInInputField } from "./keyShortcutInputPolicy";
import {
  getShouldPreventDefault,
  isShortcutPressed,
  parseShortcut,
  type ParsedShortcut,
} from "./keyShortcutMatching";
import type {
  KeyAction,
  KeyActionEvent,
  KeyUpAction,
  ShortcutRegistration,
  ShortcutTrackingName,
} from "./keyShortcutRegistrations";
import { createShortcutRegistrations } from "./keyShortcutRegistrations";
import type { SettingsShortcuts } from "./keyShortcutRegistrationTypes";

export type ShortcutInfo = {
  parsedShortcut: ParsedShortcut;
  wasPressed: boolean;
  shouldPreventDefault: boolean;
  keyDownAction: KeyAction;
  keyUpAction: KeyUpAction | null;
  allowRepeat: boolean;
  ignoreWhenInInputField: boolean;
  trackingName?: ShortcutTrackingName;
  keepKeyDownCondition?: (event: KeyActionEvent) => boolean;
};

function addKeepKeyDownConditions({
  shortcutInfoByName,
  isMacOsHost,
  getPressedKeys,
}: {
  shortcutInfoByName: Record<ShortcutTrackingName, ShortcutInfo | undefined>;
  isMacOsHost: boolean;
  getPressedKeys: () => Set<string>;
}) {
  const showTooltipShortcut = shortcutInfoByName.showTooltipShortcut;
  const incrementTooltipPageShortcut =
    shortcutInfoByName.incrementTooltipPageShortcut;
  const decrementTooltipPageShortcut =
    shortcutInfoByName.decrementTooltipPageShortcut;
  const copyTooltipTextShortcut = shortcutInfoByName.copyTooltipTextShortcut;

  if (
    !showTooltipShortcut ||
    !incrementTooltipPageShortcut ||
    !decrementTooltipPageShortcut ||
    !copyTooltipTextShortcut
  ) {
    return;
  }

  showTooltipShortcut.keepKeyDownCondition = (event) =>
    event instanceof KeyboardEvent &&
    (isShortcutPressed(
      event,
      showTooltipShortcut.parsedShortcut,
      isMacOsHost,
      getPressedKeys(),
    ) ||
      isShortcutPressed(
        event,
        incrementTooltipPageShortcut.parsedShortcut,
        isMacOsHost,
        getPressedKeys(),
      ) ||
      isShortcutPressed(
        event,
        decrementTooltipPageShortcut.parsedShortcut,
        isMacOsHost,
        getPressedKeys(),
      ) ||
      isShortcutPressed(
        event,
        copyTooltipTextShortcut.parsedShortcut,
        isMacOsHost,
        getPressedKeys(),
      ));
}

export function createKeyActivationShortcutInfo({
  shortcuts,
  isMacOsHost,
  getPressedKeys,
}: {
  shortcuts: SettingsShortcuts;
  isMacOsHost: boolean;
  getPressedKeys: () => Set<string>;
}): Array<ShortcutInfo> {
  const shortcutInfoByName: Record<
    ShortcutTrackingName,
    ShortcutInfo | undefined
  > = {
    copyTooltipTextShortcut: undefined,
    decrementTooltipPageShortcut: undefined,
    incrementTooltipPageShortcut: undefined,
    showTooltipShortcut: undefined,
  };
  const shortcutInfo: Array<ShortcutInfo> = [];

  for (const registration of createShortcutRegistrations(shortcuts)) {
    const {
      keyCombo,
      keyDownAction,
      keyUpAction,
      allowRepeat,
      trackingName,
    }: ShortcutRegistration = registration;
    if (!keyCombo) {
      continue;
    }

    const parsedShortcut = parseShortcut(keyCombo.toLowerCase());
    const info: ShortcutInfo = {
      parsedShortcut,
      wasPressed: false,
      shouldPreventDefault: getShouldPreventDefault(parsedShortcut),
      keyDownAction,
      keyUpAction,
      allowRepeat,
      ignoreWhenInInputField: getIgnoreWhenInInputField(
        parsedShortcut,
        isMacOsHost,
      ),
      trackingName,
    };
    shortcutInfo.push(info);
    if (trackingName) {
      shortcutInfoByName[trackingName] = info;
    }
  }

  addKeepKeyDownConditions({
    shortcutInfoByName,
    isMacOsHost,
    getPressedKeys,
  });
  return shortcutInfo;
}

export function runShortcutKeyUpActions(
  event: KeyActionEvent,
  shortcutInfo: Array<ShortcutInfo>,
) {
  for (const info of shortcutInfo) {
    if (info.wasPressed && !info.keepKeyDownCondition?.(event)) {
      info.wasPressed = false;
      info.keyUpAction?.(event);
    }
  }
}

export function getModShortcutInfo(
  shortcutInfo: Array<ShortcutInfo>,
): Array<ShortcutInfo> {
  return shortcutInfo.filter((info) => info.parsedShortcut.mod);
}
