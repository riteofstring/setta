import _ from "lodash";

export type ParsedShortcut = {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  keys: Set<string>;
};

type TabShortcutInfo = {
  shift: boolean;
};

const specialEventKeyToEventCode: Record<string, string> = {
  ".": "Period",
  ",": "Comma",
  "/": "Slash",
  "\\": "Backslash",
  "'": "Quote",
  ";": "Semicolon",
  "[": "BracketLeft",
  "]": "BracketRight",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
  arrowright: "ArrowRight",
  arrowleft: "ArrowLeft",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
};

export const modifierKeyCodes = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
]);

export function getNormalizedEventCode(event: KeyboardEvent): string | null {
  if (event.code && event.code !== "Unidentified") {
    return event.code;
  }

  const key = event.key;
  if (!key) {
    return null;
  }

  if (key === " ") {
    return "Space";
  }
  if (key === "Shift") {
    return "ShiftLeft";
  }
  if (key === "Control") {
    return "ControlLeft";
  }
  if (key === "Alt") {
    return "AltLeft";
  }
  if (key === "Meta") {
    return "MetaLeft";
  }

  const lowerKey = key.toLowerCase();
  const special =
    specialEventKeyToEventCode[lowerKey] ?? specialEventKeyToEventCode[key];
  if (special) {
    return special;
  }

  if (/^[a-zA-Z]$/.test(key)) {
    return `Key${key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }

  if (key.length > 1) {
    return key[0].toUpperCase() + key.slice(1);
  }

  return key;
}

// shortcutString is a lowercase string.
export function parseShortcut(shortcutString: string): ParsedShortcut {
  const parts = shortcutString.split("+").map((x) => x.trim());

  let keys = parts.filter((x) => !["ctrl", "shift", "alt", "mod"].includes(x));

  keys = new Set(
    keys.map((part) => {
      const x = part.trim();
      if (/^[a-zA-Z]$/.test(x)) {
        return `Key${x.toUpperCase()}`;
      }
      if (/^[0-9]$/.test(x)) {
        return `Digit${x}`;
      }
      const special = specialEventKeyToEventCode[x];
      return special ?? x[0].toUpperCase() + x.slice(1);
    }),
  );

  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    keys,
  };
}

export function getTabShortcutInfo(
  shortcut: string | null | undefined,
): TabShortcutInfo | null {
  if (!shortcut) {
    return null;
  }
  const parsed = parseShortcut(shortcut.toLowerCase());
  if (!isParsedTabShortcut(parsed)) {
    return null;
  }
  return { shift: parsed.shift };
}

export function isTabLikeShortcut(shortcut: string | null | undefined) {
  return getTabShortcutInfo(shortcut) !== null;
}

export function isShortcutPressed(
  event: KeyboardEvent,
  parsedShortcut: ParsedShortcut,
  isMacOs: boolean,
  keysPressed: Set<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  if (isMacOs) {
    return (
      event.metaKey === mod &&
      event.ctrlKey === ctrl &&
      event.shiftKey === shift &&
      event.altKey === alt &&
      _.isEqual(keysPressed, keys)
    );
  }
  return (
    event.ctrlKey === (ctrl || mod) &&
    event.shiftKey === shift &&
    event.altKey === alt &&
    _.isEqual(keysPressed, keys)
  );
}

export function getShouldPreventDefault(parsedShortcut: ParsedShortcut) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;

  if (!mod && !ctrl && !shift && !alt) {
    return false;
  }

  if (isParsedTabShortcut(parsedShortcut)) {
    return false;
  }

  if (keys.size === 0) {
    return false;
  }

  if (
    isModOrCtrlPlus(parsedShortcut, ["KeyC"]) ||
    isModOrCtrlPlus(parsedShortcut, "KeyV")
  ) {
    return false;
  }

  return true;
}

export function isParsedTabShortcut(parsedShortcut: ParsedShortcut) {
  return (
    parsedShortcut.keys.size === 1 &&
    parsedShortcut.keys.has("Tab") &&
    !parsedShortcut.mod &&
    !parsedShortcut.ctrl &&
    !parsedShortcut.alt
  );
}

function keysMatch(keys: Set<string>, targetKeyList: Iterable<string>) {
  return _.isEqual(keys, new Set(targetKeyList));
}

function isModOrCtrlPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return (ctrl || mod) && !shift && !alt && keysMatch(keys, targetKeyList);
}
