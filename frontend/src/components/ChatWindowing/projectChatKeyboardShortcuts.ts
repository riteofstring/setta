export type ParsedShortcut = {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  keys: Set<string>;
};

type ChatWindowingShortcuts = {
  canvasToggle: string;
  maximizeFocused: string;
  minimizeFocused: string;
  snapLeft: string;
  snapRight: string;
  snapTop: string;
  snapBottom: string;
};

const SPECIAL_SHORTCUT_KEY_TO_EVENT_CODE: Record<string, string> = {
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  space: "Space",
  delete: "Delete",
  backspace: "Backspace",
  escape: "Escape",
  esc: "Escape",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  period: "Period",
  comma: "Comma",
  slash: "Slash",
  backslash: "Backslash",
  quote: "Quote",
  semicolon: "Semicolon",
  bracketleft: "BracketLeft",
  bracketright: "BracketRight",
  minus: "Minus",
  equal: "Equal",
  backquote: "Backquote",
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
};

const DIRECT_EVENT_KEY_CODES: Record<string, string> = {
  " ": "Space",
  Shift: "ShiftLeft",
  Control: "ControlLeft",
  Alt: "AltLeft",
  Meta: "MetaLeft",
};

const DEFAULT_CHAT_WINDOWING_SHORTCUTS: ChatWindowingShortcuts = {
  canvasToggle: "Shift + Esc",
  maximizeFocused: "Mod + Shift + Enter",
  minimizeFocused: "Mod + Shift + M",
  snapLeft: "Mod + Alt + ArrowLeft",
  snapRight: "Mod + Alt + ArrowRight",
  snapTop: "Mod + Alt + ArrowUp",
  snapBottom: "Mod + Alt + ArrowDown",
};
const CHAT_WINDOWING_SHORTCUT_KEYS = Object.keys(
  DEFAULT_CHAT_WINDOWING_SHORTCUTS,
) as Array<keyof ChatWindowingShortcuts>;

function resolveSpecialEventCode(key: string): string | null {
  const special = SPECIAL_SHORTCUT_KEY_TO_EVENT_CODE[key.toLowerCase()];
  if (special) {
    return special;
  }
  if (/^[a-z]$/i.test(key)) {
    return `Key${key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }
  return key.length > 1 ? key[0].toUpperCase() + key.slice(1) : key;
}

function hasMatchingShortcutModifiers(
  event: KeyboardEvent,
  parsedShortcut: ParsedShortcut,
  macOs: boolean,
): boolean {
  if (macOs) {
    return (
      event.metaKey === parsedShortcut.mod &&
      event.ctrlKey === parsedShortcut.ctrl &&
      event.shiftKey === parsedShortcut.shift &&
      event.altKey === parsedShortcut.alt
    );
  }
  return (
    event.ctrlKey === (parsedShortcut.ctrl || parsedShortcut.mod) &&
    event.shiftKey === parsedShortcut.shift &&
    event.altKey === parsedShortcut.alt
  );
}

export function resolveChatWindowingShortcuts(
  shortcuts: Partial<ChatWindowingShortcuts> | null | undefined,
): ChatWindowingShortcuts {
  const nextShortcuts = { ...DEFAULT_CHAT_WINDOWING_SHORTCUTS };
  for (const key of CHAT_WINDOWING_SHORTCUT_KEYS) {
    const value = shortcuts?.[key];
    if (typeof value === "string") {
      nextShortcuts[key] = value;
    }
  }
  return nextShortcuts;
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut
    .split("+")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  const keys = new Set(
    parts
      .filter((value) => !["ctrl", "shift", "alt", "mod"].includes(value))
      .map((part) => {
        if (/^[a-z]$/.test(part)) {
          return `Key${part.toUpperCase()}`;
        }
        if (/^[0-9]$/.test(part)) {
          return `Digit${part}`;
        }
        return resolveSpecialEventCode(part);
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

export function getNormalizedEventCode(event: KeyboardEvent): string | null {
  if (event.code && event.code !== "Unidentified") {
    return event.code;
  }
  if (!event.key) {
    return null;
  }
  const directCode = DIRECT_EVENT_KEY_CODES[event.key];
  if (directCode) {
    return directCode;
  }
  return resolveSpecialEventCode(event.key);
}

export function isShortcutPressed(
  event: KeyboardEvent,
  eventCode: string | null,
  parsedShortcut: ParsedShortcut,
  macOs: boolean,
): boolean {
  if (!hasMatchingShortcutModifiers(event, parsedShortcut, macOs)) {
    return false;
  }
  if (parsedShortcut.keys.size === 0) {
    return true;
  }
  return Boolean(
    eventCode &&
      parsedShortcut.keys.size === 1 &&
      parsedShortcut.keys.has(eventCode),
  );
}
