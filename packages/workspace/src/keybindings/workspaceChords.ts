const MODIFIER_TOKENS = new Set(["mod", "ctrl", "shift", "alt"]);

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
  throw new Error(
    `Workspace chord ${JSON.stringify(chord)} names an unknown key ${token}.`,
  );
}

type ChordModifiers = {
  -readonly [Key in keyof Omit<ParsedWorkspaceChord, "keys">]: boolean;
};

function addChordPart(
  chord: string,
  part: string,
  modifiers: ChordModifiers,
  keys: Set<string>,
): void {
  const token = part.trim().toLowerCase();
  if (token === "") {
    throw new Error(
      `Workspace chord ${JSON.stringify(chord)} has an empty part.`,
    );
  }
  if (MODIFIER_TOKENS.has(token)) {
    modifiers[token as keyof ChordModifiers] = true;
    return;
  }
  keys.add(getKeyCode(chord, token));
}

function hasNoChordKeys(
  modifiers: ChordModifiers,
  keys: ReadonlySet<string>,
): boolean {
  return (
    !modifiers.mod &&
    !modifiers.ctrl &&
    !modifiers.shift &&
    !modifiers.alt &&
    keys.size === 0
  );
}

export function parseWorkspaceChord(chord: string): ParsedWorkspaceChord {
  if (typeof chord !== "string") {
    throw new Error(
      `Workspace chord ${JSON.stringify(chord)} must be a string.`,
    );
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

export function getWorkspaceChordSignature(
  chord: ParsedWorkspaceChord,
  macOS: boolean,
): string {
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

export function formatWorkspaceChord(
  chord: ParsedWorkspaceChord,
  macOS: boolean,
): string {
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
