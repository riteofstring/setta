import type { ParsedWorkspaceChord } from "./workspaceChords.js";

type ChordPatternMode =
  | "no-modifiers"
  | "shift-only"
  | "mod-only"
  | "ctrl-only"
  | "alt-only"
  | "alt-shift"
  | "mod-shift"
  | "mod-ctrl"
  | "mod-or-ctrl"
  | "mod-or-ctrl-shift";

type ChordPattern = {
  mode: ChordPatternMode;
  keys?: ReadonlyArray<string>;
};

type ChordModifiers = Omit<ParsedWorkspaceChord, "keys">;

function matchesModifiers(
  chord: ParsedWorkspaceChord,
  expected: ChordModifiers,
): boolean {
  return (
    chord.mod === expected.mod &&
    chord.ctrl === expected.ctrl &&
    chord.shift === expected.shift &&
    chord.alt === expected.alt
  );
}

const CHORD_MODE_MATCHERS: Record<
  ChordPatternMode,
  (chord: ParsedWorkspaceChord) => boolean
> = {
  "no-modifiers": (chord) =>
    !chord.mod && !chord.ctrl && !chord.shift && !chord.alt,
  "shift-only": (chord) =>
    matchesModifiers(chord, {
      mod: false,
      ctrl: false,
      shift: true,
      alt: false,
    }),
  "mod-only": (chord) =>
    matchesModifiers(chord, {
      mod: true,
      ctrl: false,
      shift: false,
      alt: false,
    }),
  "ctrl-only": (chord) =>
    matchesModifiers(chord, {
      mod: false,
      ctrl: true,
      shift: false,
      alt: false,
    }),
  "alt-only": (chord) =>
    matchesModifiers(chord, {
      mod: false,
      ctrl: false,
      shift: false,
      alt: true,
    }),
  "alt-shift": (chord) =>
    matchesModifiers(chord, {
      mod: false,
      ctrl: false,
      shift: true,
      alt: true,
    }),
  "mod-shift": (chord) =>
    matchesModifiers(chord, {
      mod: true,
      ctrl: false,
      shift: true,
      alt: false,
    }),
  "mod-ctrl": (chord) =>
    matchesModifiers(chord, {
      mod: true,
      ctrl: true,
      shift: false,
      alt: false,
    }),
  "mod-or-ctrl": (chord) =>
    (chord.mod || chord.ctrl) && !chord.shift && !chord.alt,
  "mod-or-ctrl-shift": (chord) =>
    (chord.mod || chord.ctrl) && chord.shift && !chord.alt,
};

function matchesChordPattern(
  chord: ParsedWorkspaceChord,
  pattern: ChordPattern,
): boolean {
  if (!CHORD_MODE_MATCHERS[pattern.mode](chord)) {
    return false;
  }
  if (pattern.mode === "no-modifiers") {
    return true;
  }
  const keys = pattern.keys ?? [];
  return (
    chord.keys.length === keys.length &&
    keys.every((key) => chord.keys.includes(key))
  );
}

function matchesAnyChordPattern(
  chord: ParsedWorkspaceChord,
  patterns: ReadonlyArray<ChordPattern>,
): boolean {
  return patterns.some((pattern) => matchesChordPattern(chord, pattern));
}

function isTabChord(chord: ParsedWorkspaceChord): boolean {
  return (
    chord.keys.length === 1 &&
    chord.keys[0] === "Tab" &&
    !chord.mod &&
    !chord.ctrl &&
    !chord.alt
  );
}

const BROWSER_OWNED_CHORDS: ReadonlyArray<ChordPattern> = [
  { mode: "mod-or-ctrl", keys: ["KeyC"] },
  { mode: "mod-or-ctrl", keys: ["KeyV"] },
];

const SHARED_EDITING_CHORDS: ReadonlyArray<ChordPattern> = [
  { mode: "no-modifiers" },
  { mode: "shift-only", keys: [] },
  { mode: "mod-only", keys: [] },
];

const MACOS_EDITING_CHORDS: ReadonlyArray<ChordPattern> = [
  ...SHARED_EDITING_CHORDS,
  { mode: "mod-only", keys: ["KeyC"] },
  { mode: "mod-only", keys: ["KeyV"] },
  { mode: "mod-only", keys: ["KeyX"] },
  { mode: "mod-only", keys: ["KeyZ"] },
  { mode: "mod-shift", keys: ["KeyZ"] },
  { mode: "mod-only", keys: ["KeyA"] },
  { mode: "mod-only", keys: ["ArrowLeft"] },
  { mode: "mod-only", keys: ["ArrowRight"] },
  { mode: "alt-only", keys: ["ArrowLeft"] },
  { mode: "alt-only", keys: ["ArrowRight"] },
  { mode: "shift-only", keys: ["ArrowLeft"] },
  { mode: "shift-only", keys: ["ArrowRight"] },
  { mode: "shift-only", keys: ["ArrowUp"] },
  { mode: "shift-only", keys: ["ArrowDown"] },
  { mode: "alt-shift", keys: ["ArrowLeft"] },
  { mode: "alt-shift", keys: ["ArrowRight"] },
  { mode: "mod-shift", keys: ["ArrowLeft"] },
  { mode: "mod-shift", keys: ["ArrowRight"] },
  { mode: "alt-only", keys: ["Backspace"] },
  { mode: "mod-only", keys: ["Backspace"] },
  { mode: "ctrl-only", keys: ["KeyA"] },
  { mode: "ctrl-only", keys: ["KeyE"] },
  { mode: "ctrl-only", keys: ["KeyF"] },
  { mode: "ctrl-only", keys: ["KeyB"] },
  { mode: "ctrl-only", keys: ["KeyN"] },
  { mode: "ctrl-only", keys: ["KeyP"] },
  { mode: "ctrl-only", keys: ["KeyD"] },
  { mode: "ctrl-only", keys: ["KeyH"] },
  { mode: "ctrl-only", keys: ["KeyT"] },
  { mode: "mod-ctrl", keys: ["Space"] },
  { mode: "mod-shift", keys: ["KeyV"] },
  { mode: "mod-only", keys: ["ArrowUp"] },
  { mode: "mod-only", keys: ["ArrowDown"] },
  { mode: "mod-shift", keys: ["ArrowUp"] },
  { mode: "mod-shift", keys: ["ArrowDown"] },
  { mode: "mod-only", keys: ["KeyY"] },
  { mode: "mod-only", keys: ["KeyB"] },
  { mode: "mod-only", keys: ["KeyI"] },
];

const OTHER_PLATFORM_EDITING_CHORDS: ReadonlyArray<ChordPattern> = [
  ...SHARED_EDITING_CHORDS,
  { mode: "mod-or-ctrl", keys: ["KeyA"] },
  { mode: "mod-or-ctrl", keys: ["KeyC"] },
  { mode: "mod-or-ctrl", keys: ["KeyV"] },
  { mode: "mod-or-ctrl", keys: ["KeyX"] },
  { mode: "mod-or-ctrl", keys: ["KeyZ"] },
  { mode: "mod-or-ctrl-shift", keys: ["KeyZ"] },
  { mode: "mod-or-ctrl", keys: ["KeyY"] },
  { mode: "mod-or-ctrl", keys: ["ArrowLeft"] },
  { mode: "mod-or-ctrl", keys: ["ArrowRight"] },
  { mode: "shift-only", keys: ["ArrowLeft"] },
  { mode: "shift-only", keys: ["ArrowRight"] },
  { mode: "mod-or-ctrl-shift", keys: ["ArrowLeft"] },
  { mode: "mod-or-ctrl-shift", keys: ["ArrowRight"] },
  { mode: "mod-or-ctrl", keys: ["ArrowUp"] },
  { mode: "mod-or-ctrl", keys: ["ArrowDown"] },
  { mode: "mod-or-ctrl-shift", keys: ["ArrowUp"] },
  { mode: "mod-or-ctrl-shift", keys: ["ArrowDown"] },
  { mode: "shift-only", keys: ["ArrowUp"] },
  { mode: "shift-only", keys: ["ArrowDown"] },
  { mode: "alt-only", keys: ["ArrowLeft"] },
  { mode: "alt-only", keys: ["ArrowRight"] },
  { mode: "mod-or-ctrl", keys: ["KeyK"] },
  { mode: "shift-only", keys: ["Home"] },
  { mode: "shift-only", keys: ["End"] },
  { mode: "mod-or-ctrl", keys: ["Home"] },
  { mode: "mod-or-ctrl", keys: ["End"] },
  { mode: "mod-or-ctrl-shift", keys: ["Home"] },
  { mode: "mod-or-ctrl-shift", keys: ["End"] },
  { mode: "mod-or-ctrl", keys: ["Backspace"] },
  { mode: "mod-or-ctrl", keys: ["Delete"] },
  { mode: "shift-only", keys: ["Enter"] },
  { mode: "mod-or-ctrl-shift", keys: ["KeyV"] },
  { mode: "mod-or-ctrl", keys: ["KeyB"] },
  { mode: "mod-or-ctrl", keys: ["KeyI"] },
  { mode: "mod-or-ctrl", keys: ["KeyU"] },
];

export function getChordSuppressesBrowserDefault(
  chord: ParsedWorkspaceChord,
): boolean {
  if (!chord.mod && !chord.ctrl && !chord.shift && !chord.alt) {
    return false;
  }
  if (isTabChord(chord)) {
    return false;
  }
  if (chord.keys.length === 0) {
    return false;
  }
  return !matchesAnyChordPattern(chord, BROWSER_OWNED_CHORDS);
}

export function getChordYieldsToEditableTarget(
  chord: ParsedWorkspaceChord,
  macOS: boolean,
): boolean {
  if (isTabChord(chord) || chord.keys.includes("Escape")) {
    return false;
  }
  return matchesAnyChordPattern(
    chord,
    macOS ? MACOS_EDITING_CHORDS : OTHER_PLATFORM_EDITING_CHORDS,
  );
}
