import _ from "lodash";

import {
  isParsedTabShortcut,
  type ParsedShortcut,
} from "./keyShortcutMatching";

export function getIsInput(event: KeyboardEvent | Event) {
  return (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    Boolean((event.target as HTMLElement | null)?.isContentEditable)
  );
}

export function getIgnoreWhenInInputField(
  parsedShortcut: ParsedShortcut,
  isMacOs: boolean,
) {
  if (isParsedTabShortcut(parsedShortcut)) {
    return false;
  }
  if (parsedShortcut.keys.has("Escape")) {
    return false;
  }
  return isMacOs
    ? getMacosIgnoreWhenInInputField(parsedShortcut)
    : getWindowsIgnoreWhenInInputField(parsedShortcut);
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

function isModOrCtrlShiftPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return (ctrl || mod) && shift && !alt && keysMatch(keys, targetKeyList);
}

function isCtrlPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return ctrl && !mod && !shift && !alt && keysMatch(keys, targetKeyList);
}

function isModPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return mod && !ctrl && !shift && !alt && keysMatch(keys, targetKeyList);
}

function isModShiftPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return mod && shift && !ctrl && !alt && keysMatch(keys, targetKeyList);
}

function isOptionPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return alt && !shift && !ctrl && !mod && keysMatch(keys, targetKeyList);
}

function isOptionShiftPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return alt && shift && !ctrl && !mod && keysMatch(keys, targetKeyList);
}

function isShiftPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return shift && !alt && !ctrl && !mod && keysMatch(keys, targetKeyList);
}

function isModCtrlPlus(
  parsedShortcut: ParsedShortcut,
  targetKeyList: Iterable<string>,
) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return mod && ctrl && !alt && !shift && keysMatch(keys, targetKeyList);
}

function getMacosIgnoreWhenInInputField(parsedShortcut: ParsedShortcut) {
  const { mod, shift, ctrl, alt } = parsedShortcut;
  return (
    (!mod && !shift && !ctrl && !alt) ||
    isShiftPlus(parsedShortcut, []) ||
    isModPlus(parsedShortcut, []) ||
    isModPlus(parsedShortcut, ["KeyC"]) ||
    isModPlus(parsedShortcut, ["KeyV"]) ||
    isModPlus(parsedShortcut, ["KeyX"]) ||
    isModPlus(parsedShortcut, ["KeyZ"]) ||
    isModShiftPlus(parsedShortcut, ["KeyZ"]) ||
    isModPlus(parsedShortcut, ["KeyA"]) ||
    isModPlus(parsedShortcut, ["ArrowLeft"]) ||
    isModPlus(parsedShortcut, ["ArrowRight"]) ||
    isOptionPlus(parsedShortcut, ["ArrowLeft"]) ||
    isOptionPlus(parsedShortcut, ["ArrowRight"]) ||
    isShiftPlus(parsedShortcut, ["ArrowLeft"]) ||
    isShiftPlus(parsedShortcut, ["ArrowRight"]) ||
    isShiftPlus(parsedShortcut, ["ArrowUp"]) ||
    isShiftPlus(parsedShortcut, ["ArrowDown"]) ||
    isOptionShiftPlus(parsedShortcut, ["ArrowLeft"]) ||
    isOptionShiftPlus(parsedShortcut, ["ArrowRight"]) ||
    isModShiftPlus(parsedShortcut, ["ArrowLeft"]) ||
    isModShiftPlus(parsedShortcut, ["ArrowRight"]) ||
    isOptionPlus(parsedShortcut, ["Backspace"]) ||
    isModPlus(parsedShortcut, ["Backspace"]) ||
    isCtrlPlus(parsedShortcut, ["KeyA"]) ||
    isCtrlPlus(parsedShortcut, ["KeyE"]) ||
    isCtrlPlus(parsedShortcut, ["KeyF"]) ||
    isCtrlPlus(parsedShortcut, ["KeyB"]) ||
    isCtrlPlus(parsedShortcut, ["KeyN"]) ||
    isCtrlPlus(parsedShortcut, ["KeyP"]) ||
    isCtrlPlus(parsedShortcut, ["KeyD"]) ||
    isCtrlPlus(parsedShortcut, ["KeyH"]) ||
    isCtrlPlus(parsedShortcut, ["KeyT"]) ||
    isModCtrlPlus(parsedShortcut, ["Space"]) ||
    isModShiftPlus(parsedShortcut, ["KeyV"]) ||
    isModPlus(parsedShortcut, ["ArrowUp"]) ||
    isModPlus(parsedShortcut, ["ArrowDown"]) ||
    isModShiftPlus(parsedShortcut, ["ArrowUp"]) ||
    isModShiftPlus(parsedShortcut, ["ArrowDown"]) ||
    isModPlus(parsedShortcut, ["KeyY"]) ||
    isModPlus(parsedShortcut, ["KeyB"]) ||
    isModPlus(parsedShortcut, ["KeyI"])
  );
}

function getWindowsIgnoreWhenInInputField(parsedShortcut: ParsedShortcut) {
  const { mod, shift, ctrl, alt } = parsedShortcut;
  return (
    (!mod && !shift && !ctrl && !alt) ||
    isShiftPlus(parsedShortcut, []) ||
    isModPlus(parsedShortcut, []) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyA"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyC"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyV"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyX"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyZ"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyY"]) ||
    isModOrCtrlPlus(parsedShortcut, ["ArrowLeft"]) ||
    isModOrCtrlPlus(parsedShortcut, ["ArrowRight"]) ||
    isShiftPlus(parsedShortcut, ["ArrowLeft"]) ||
    isShiftPlus(parsedShortcut, ["ArrowRight"]) ||
    isModOrCtrlShiftPlus(parsedShortcut, ["ArrowLeft"]) ||
    isModOrCtrlShiftPlus(parsedShortcut, ["ArrowRight"]) ||
    isModOrCtrlPlus(parsedShortcut, ["ArrowUp"]) ||
    isModOrCtrlPlus(parsedShortcut, ["ArrowDown"]) ||
    isModOrCtrlShiftPlus(parsedShortcut, ["ArrowUp"]) ||
    isModOrCtrlShiftPlus(parsedShortcut, ["ArrowDown"]) ||
    isShiftPlus(parsedShortcut, ["ArrowUp"]) ||
    isShiftPlus(parsedShortcut, ["ArrowDown"]) ||
    isOptionPlus(parsedShortcut, ["ArrowLeft"]) ||
    isOptionPlus(parsedShortcut, ["ArrowRight"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyK"]) ||
    isShiftPlus(parsedShortcut, ["Home"]) ||
    isShiftPlus(parsedShortcut, ["End"]) ||
    isModOrCtrlPlus(parsedShortcut, ["Home"]) ||
    isModOrCtrlPlus(parsedShortcut, ["End"]) ||
    isModOrCtrlShiftPlus(parsedShortcut, ["Home"]) ||
    isModOrCtrlShiftPlus(parsedShortcut, ["End"]) ||
    isModOrCtrlPlus(parsedShortcut, ["Backspace"]) ||
    isModOrCtrlPlus(parsedShortcut, ["Delete"]) ||
    isShiftPlus(parsedShortcut, ["Enter"]) ||
    isModOrCtrlShiftPlus(parsedShortcut, ["KeyV"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyB"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyI"]) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyU"])
  );
}
