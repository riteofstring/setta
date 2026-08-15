// One chord vocabulary for every workspace key binding and every reserved interaction gesture.
// The reference parses its shortcut settings the same way (`parseShortcut` in
// `state/actions/keyActivations.ts`): a chord is a "+"-separated list of the mod/ctrl/shift/alt
// modifiers plus the non-modifier keys that must be held together, and the non-modifier keys are
// compared as event codes so the physical key decides the match regardless of layout or the
// character a modifier produces. "Mod" is Meta on macOS and Control elsewhere.
//
// Unlike the reference, an unknown key name fails here instead of being title-cased into a code
// that can never match: chords are host input, so an unusable binding is reported at registration.

const MODIFIER_TOKENS = new Set(["mod", "ctrl", "shift", "alt"]);

// The reference's `specialEventKeyToEventCode`, plus the code spelling of each entry so both
// "Mod + Comma" and "Mod + ," name the same key the way its shipped defaults already mix them.
const KEY_CODES_BY_TOKEN: Readonly<Record<string, string>> = Object.freeze({
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
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  backquote: "Backquote",
  backslash: "Backslash",
  backspace: "Backspace",
  bracketleft: "BracketLeft",
  bracketright: "BracketRight",
  comma: "Comma",
  delete: "Delete",
  end: "End",
  enter: "Enter",
  equal: "Equal",
  escape: "Escape",
  home: "Home",
  minus: "Minus",
  pagedown: "PageDown",
  pageup: "PageUp",
  period: "Period",
  quote: "Quote",
  semicolon: "Semicolon",
  slash: "Slash",
  space: "Space",
  tab: "Tab",
});

const LETTER_TOKEN = /^[a-z]$/u;
const DIGIT_TOKEN = /^[0-9]$/u;
const FUNCTION_KEY_TOKEN = /^f([1-9]|1[0-2])$/u;

export type ParsedWorkspaceChord = Readonly<{
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  // Sorted event codes, so two spellings of the same chord produce one signature.
  keys: ReadonlyArray<string>;
}>;

function getKeyCode(chord: string, token: string): string {
  const mapped = KEY_CODES_BY_TOKEN[token];
  if (mapped) {
    return mapped;
  }
  if (LETTER_TOKEN.test(token)) {
    return `Key${token.toUpperCase()}`;
  }
  if (DIGIT_TOKEN.test(token)) {
    return `Digit${token}`;
  }
  if (FUNCTION_KEY_TOKEN.test(token)) {
    return token.toUpperCase();
  }
  throw new Error(`Workspace chord ${JSON.stringify(chord)} names an unknown key ${token}.`);
}

type ChordModifiers = { -readonly [Key in keyof Omit<ParsedWorkspaceChord, "keys">]: boolean };

function addChordPart(
  chord: string,
  part: string,
  modifiers: ChordModifiers,
  keys: Set<string>,
): void {
  const token = part.trim().toLowerCase();
  if (token === "") {
    throw new Error(`Workspace chord ${JSON.stringify(chord)} has an empty part.`);
  }
  if (MODIFIER_TOKENS.has(token)) {
    modifiers[token as keyof ChordModifiers] = true;
    return;
  }
  keys.add(getKeyCode(chord, token));
}

function hasNoChordKeys(modifiers: ChordModifiers, keys: ReadonlySet<string>): boolean {
  return !modifiers.mod && !modifiers.ctrl && !modifiers.shift && !modifiers.alt && keys.size === 0;
}

export function parseWorkspaceChord(chord: string): ParsedWorkspaceChord {
  if (typeof chord !== "string") {
    throw new Error(`Workspace chord ${JSON.stringify(chord)} must be a string.`);
  }
  const modifiers = { mod: false, ctrl: false, shift: false, alt: false };
  const keys = new Set<string>();
  for (const part of chord.split("+")) {
    addChordPart(chord, part, modifiers, keys);
  }
  if (hasNoChordKeys(modifiers, keys)) {
    throw new Error(`Workspace chord ${JSON.stringify(chord)} names no keys.`);
  }
  return Object.freeze({ ...modifiers, keys: Object.freeze([...keys].sort()) });
}

// Two chords collide when one keypress can match both, which depends on the platform: off macOS
// "Mod" is Control, so "Mod + G" and "Ctrl + G" are the same keypress there and share a signature;
// on macOS they are different keys and keep their own. `matchesWorkspaceChord` folds them the same
// way, so conflict detection answers for the platform the dispatcher will run on.
export function getWorkspaceChordSignature(chord: ParsedWorkspaceChord, macOS: boolean): string {
  const modifiers = [
    macOS && chord.mod,
    macOS ? chord.ctrl : chord.ctrl || chord.mod,
    chord.shift,
    chord.alt,
  ]
    .map((held) => (held ? "1" : "0"))
    .join("");
  return `${modifiers}:${chord.keys.join(",")}`;
}

// The reference's `hasMatchingShortcutModifiers`: macOS distinguishes Meta from Control, every
// other platform folds "Mod" into Control and ignores Meta. `heldKeysEqual` is the caller's live
// pressed-key set, compared whole so a chord never matches while an extra key is down.
export function matchesWorkspaceChord(
  event: KeyboardEvent,
  chord: ParsedWorkspaceChord,
  macOS: boolean,
  heldKeysEqual: (codes: ReadonlyArray<string>) => boolean,
): boolean {
  if (event.shiftKey !== chord.shift || event.altKey !== chord.alt) {
    return false;
  }
  const modifiersMatch = macOS
    ? event.metaKey === chord.mod && event.ctrlKey === chord.ctrl
    : event.ctrlKey === (chord.ctrl || chord.mod);
  return modifiersMatch && heldKeysEqual(chord.keys);
}

function getKeyDisplay(code: string): string {
  if (code.startsWith("Key")) {
    return code.slice(3);
  }
  if (code.startsWith("Digit")) {
    return code.slice(5);
  }
  return code;
}

// The reference prettifies a shortcut for display by substituting the platform's "Mod" symbol
// (`shortcutPrettified`) and leaves the rest of the text alone. The package renders every chord
// from its parse instead, so one binding reads the same however a host spelled it.
export function formatWorkspaceChord(chord: ParsedWorkspaceChord, macOS: boolean): string {
  const parts: Array<string> = [];
  if (chord.mod) {
    parts.push(macOS ? "⌘" : "Ctrl");
  }
  if (chord.ctrl) {
    parts.push("Ctrl");
  }
  if (chord.alt) {
    parts.push("Alt");
  }
  if (chord.shift) {
    parts.push("Shift");
  }
  return [...parts, ...chord.keys.map(getKeyDisplay)].join(" + ");
}
