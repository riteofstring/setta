import { useEffect } from "react";
import { createSectionCommandContext } from "../commands/workspaceCommandContexts";
import { runWorkspaceCommandById } from "../commands/workspaceCommandResolution";
import { activateDndMovingFreeMode, activateDndSortingMode, deactivateDnd } from "../dnd/dndState";
import { getActiveSectionIds, setActiveSectionIds } from "../document/activeSections";
import { getSectionHasSelectedItems } from "../document/documentSelectors";
import { unselectAllItems } from "../document/itemSelection";
import { activateItemSelect, deactivateItemSelect } from "../document/itemSelectionMode";
import { useWorkspaceDocument } from "../document/stores";
import { getSectionItemVisibility } from "../items/itemListRegistry";
import {
  indentSelectedItems,
  moveSelectedItemsDown,
  moveSelectedItemsUp,
  unindentSelectedItems,
} from "../items/selectedItemMoves";
import {
  closeFrozenWorkspaceTooltip,
  copyWorkspaceTooltipPage,
  decrementWorkspaceTooltipPage,
  disableWorkspaceTooltip,
  enableWorkspaceTooltip,
  freezeWorkspaceTooltip,
  getIsFrozenWorkspaceTooltipFocused,
  incrementWorkspaceTooltipPage,
} from "../tooltip/WorkspaceTooltip";
import { useReactFlow } from "./store";
import { isMacOs } from "./utils";

// The reference binds these through its app shortcut engine with the shipped defaults:
// selectionKeyCode = Shift, multiSelectionKeyCode = Mod, zoomActivationKeyCode = Mod,
// panActivationKeyCode = Space, showTooltipShortcut = Q (bare keys ignored while typing in
// editable targets), movingFreeShortcut = Alt (hold), sortingShortcut = Mod + Alt (hold),
// paramSelect = Mod + Shift (hold; the package's item-select mode), paramMoveUp/Down =
// Alt + ArrowUp/Down (repeat allowed), paramIndent/Unindent = Tab / Shift + Tab, and the
// Escape handler that unselects params before it clears an in-section active selection. The
// package owns the same activation-key state directly. A1 also restores main's ungroup command
// (Shift+Mod+G) through the canonical package operation; the other command shortcuts (fit view
// "F", zoom "="/"-", zoom to mouse "Z") stay application-side until the command milestone.
// tooltip auxiliary shortcuts = Q+F freeze, Q+ArrowLeft/ArrowRight page navigation, Q+C copy;
// a focused frozen tooltip owns ArrowLeft/ArrowRight, C, and Escape. Product-only tooltip-to-
// section commands stay in the application. The reference's shortcut engine matches the bare
// "Q" shortcut only with no modifiers held.
function isBareTooltipKey(event: KeyboardEvent): boolean {
  return (
    (event.key === "q" || event.key === "Q") &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function hasNoTooltipModifiers(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

function getTooltipShortcutKey(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

function runTooltipAuxiliaryShortcut(event: KeyboardEvent): boolean {
  const key = getTooltipShortcutKey(event);
  if (key === "f") {
    return freezeWorkspaceTooltip();
  }
  if (key === "ArrowRight") {
    return incrementWorkspaceTooltipPage();
  }
  if (key === "ArrowLeft") {
    return decrementWorkspaceTooltipPage();
  }
  if (key === "c") {
    return copyWorkspaceTooltipPage();
  }
  return false;
}

function getIsTooltipAuxiliaryKey(event: KeyboardEvent): boolean {
  const key = getTooltipShortcutKey(event);
  return key === "f" || key === "ArrowRight" || key === "ArrowLeft" || key === "c";
}

function runFocusedFrozenTooltipShortcut(event: KeyboardEvent): boolean {
  if (!getIsFrozenWorkspaceTooltipFocused()) {
    return false;
  }
  const key = getTooltipShortcutKey(event);
  if (key === "ArrowRight") {
    return incrementWorkspaceTooltipPage();
  }
  if (key === "ArrowLeft") {
    return decrementWorkspaceTooltipPage();
  }
  if (key === "c") {
    return copyWorkspaceTooltipPage();
  }
  return false;
}

function getShouldActivateTooltip(event: KeyboardEvent): boolean {
  return !event.repeat && !getIsEditableTarget(event);
}

function getIsTransientTooltipAuxiliaryChord(
  event: KeyboardEvent,
  tooltipPressed: boolean,
): boolean {
  return tooltipPressed && hasNoTooltipModifiers(event) && getIsTooltipAuxiliaryKey(event);
}

function runTooltipShortcutWithoutRepeat(
  event: KeyboardEvent,
  action: (shortcutEvent: KeyboardEvent) => boolean,
) {
  if (!event.repeat && action(event)) {
    event.preventDefault();
  }
}

function getIsEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

const modifierKeys = new Set(["Shift", "Meta", "Control", "Alt"]);

// One engine-bound hold shortcut: the exact modifier state plus the exact non-modifier
// pressed set that must match for the mode to hold.
type HoldChord = {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  keys: Array<string>;
};

type HoldMode = {
  chord: HoldChord;
  // The reference engine ignores its shift-only, mod-only, and no-modifier shortcut
  // patterns while typing in an input (`getIgnoreWhenInInputField`); the alt-parsed dnd
  // holds and the Mod+Shift item chord are not in that set and activate everywhere.
  ignoreInInput: boolean;
  pressed: boolean;
  activate: () => void;
  deactivate: () => void;
};

// The reference's hold-shortcut semantics, shared by the dnd modes, the item-select chord,
// and the canvas activation keys (marquee "Shift", multi-select and zoom "Mod", pan
// "Space"): a mode activates on the keydown whose modifier state and pressed-key set match
// it exactly, releases through its deactivation action as soon as any event no longer
// matches, and — like the reference engine — non-repeat keydown events are the only
// activator: auto-repeat keydowns never activate a mode, so releasing Mod while still
// holding Alt deactivates sorting without re-entering the free-move mode even where
// modifier keys auto-repeat. Ungroup is a one-shot command rather than a hold mode, so its
// KeyG participates in this exact pressed-key set without adding a mode; swallowed macOS
// keyups are recovered by the Meta-keyup clear below.
function createHoldChordTracker(macOS: boolean) {
  const heldKeys = new Set<string>();

  const modes: Array<HoldMode> = [
    {
      chord: { mod: false, alt: true, shift: false, keys: [] },
      ignoreInInput: false,
      pressed: false,
      activate: activateDndMovingFreeMode,
      deactivate: deactivateDnd,
    },
    {
      chord: { mod: true, alt: true, shift: false, keys: [] },
      ignoreInInput: false,
      pressed: false,
      activate: activateDndSortingMode,
      deactivate: deactivateDnd,
    },
    // The reference's `paramSelect` shortcut "Mod + Shift": exactly Mod and Shift.
    {
      chord: { mod: true, alt: false, shift: true, keys: [] },
      ignoreInInput: false,
      pressed: false,
      activate: activateItemSelect,
      deactivate: deactivateItemSelect,
    },
    {
      chord: { mod: false, alt: false, shift: true, keys: [] },
      ignoreInInput: true,
      pressed: false,
      activate: () => useReactFlow.setState({ selectionKeyPressed: true }),
      deactivate: () => useReactFlow.setState({ selectionKeyPressed: false }),
    },
    // The reference registers multi-selection and zoom activation as two "Mod" shortcuts
    // with identical lifecycles; the package drives both states through one mode.
    {
      chord: { mod: true, alt: false, shift: false, keys: [] },
      ignoreInInput: true,
      pressed: false,
      activate: () =>
        useReactFlow.setState({ multiSelectionActive: true, zoomActivationKeyPressed: true }),
      deactivate: () =>
        useReactFlow.setState({ multiSelectionActive: false, zoomActivationKeyPressed: false }),
    },
    {
      chord: { mod: false, alt: false, shift: false, keys: ["Space"] },
      ignoreInInput: true,
      pressed: false,
      activate: () => useReactFlow.setState({ panActivationKeyPressed: true }),
      deactivate: () => useReactFlow.setState({ panActivationKeyPressed: false }),
    },
  ];

  // The reference engine's pressed-key equality (`isShortcutPressed` compares the whole
  // non-modifier pressed set against the shortcut's keys).
  function heldKeysEqual(codes: Array<string>): boolean {
    return heldKeys.size === codes.length && codes.every((code) => heldKeys.has(code));
  }

  function matchesChord(event: KeyboardEvent, chord: HoldChord): boolean {
    if (event.shiftKey !== chord.shift || event.altKey !== chord.alt) {
      return false;
    }
    if (!heldKeysEqual(chord.keys)) {
      return false;
    }
    return macOS ? event.metaKey === chord.mod && !event.ctrlKey : event.ctrlKey === chord.mod;
  }

  function releaseMode(mode: HoldMode) {
    if (!mode.pressed) {
      return;
    }
    mode.pressed = false;
    mode.deactivate();
  }

  return {
    onKeyDown(event: KeyboardEvent) {
      if (!modifierKeys.has(event.key)) {
        heldKeys.add(event.code);
      }
      const editableTarget = getIsEditableTarget(event);
      for (const mode of modes) {
        if (!matchesChord(event, mode.chord)) {
          releaseMode(mode);
          continue;
        }
        if (mode.pressed || event.repeat || (mode.ignoreInInput && editableTarget)) {
          continue;
        }
        mode.pressed = true;
        mode.activate();
      }
    },
    onKeyUp(event: KeyboardEvent) {
      heldKeys.delete(event.code);
      // On macOS, keyups for non-modifier keys are swallowed while Meta is held, so releasing
      // Meta clears the held set the same way the reference prunes its stale pressed keys.
      if (macOS && event.key === "Meta") {
        heldKeys.clear();
      }
      for (const mode of modes) {
        if (!matchesChord(event, mode.chord)) {
          releaseMode(mode);
        }
      }
    },
    // The reference's aborted-Cmd-Tab recovery: switching away via Mod+Tab and back delivers
    // neither a keyup nor a blur, so the first mouse move without the mod key held releases
    // every Mod-parsed mode (sorting, item select, and the multi-select/zoom activation;
    // free move, marquee, and pan are not Mod-gated, matching the reference's
    // mod-shortcut-only listener).
    onMouseMove(event: MouseEvent) {
      if (!modes.some((mode) => mode.chord.mod && mode.pressed)) {
        return;
      }
      const modHeld = macOS ? event.metaKey : event.ctrlKey;
      if (modHeld) {
        return;
      }
      for (const mode of modes) {
        if (mode.chord.mod) {
          releaseMode(mode);
        }
      }
    },
    onBlur() {
      heldKeys.clear();
      for (const mode of modes) {
        releaseMode(mode);
      }
    },
    heldKeysEqual,
  };
}

type HoldChordTracker = ReturnType<typeof createHoldChordTracker>;

const itemMoveActionsByCode: Record<string, () => boolean> = {
  ArrowUp: moveSelectedItemsUp,
  ArrowDown: moveSelectedItemsDown,
};

function hasExactAltModifiers(event: KeyboardEvent, macOS: boolean): boolean {
  if (!event.altKey || event.shiftKey) {
    return false;
  }
  return macOS ? !event.metaKey && !event.ctrlKey : !event.ctrlKey;
}

// The reference's paramMoveUp/Down shortcuts (Alt + ArrowUp / Alt + ArrowDown, repeat
// allowed): the engine prevents the browser default whenever the chord matches, and the
// action itself declines inside editable targets (`runParamShortcut`).
function handleItemMoveShortcut(event: KeyboardEvent, tracker: HoldChordTracker, macOS: boolean) {
  const action = itemMoveActionsByCode[event.code];
  if (!action || !hasExactAltModifiers(event, macOS) || !tracker.heldKeysEqual([event.code])) {
    return;
  }
  event.preventDefault();
  if (!getIsEditableTarget(event)) {
    action();
  }
}

function hasTabChordModifiers(event: KeyboardEvent, macOS: boolean): boolean {
  if (event.altKey) {
    return false;
  }
  return macOS ? !event.metaKey && !event.ctrlKey : !event.ctrlKey;
}

function activeSectionHasSelectedItems(): boolean {
  const activeId = getActiveSectionIds()[0];
  if (!activeId) {
    return false;
  }
  return getSectionHasSelectedItems(useWorkspaceDocument.getState(), activeId);
}

function activeSectionHasItemFilter(): boolean {
  const activeId = getActiveSectionIds()[0];
  return activeId ? (getSectionItemVisibility(activeId)?.filterActive ?? false) : false;
}

function matchesTabChord(event: KeyboardEvent, tracker: HoldChordTracker, macOS: boolean): boolean {
  if (event.key !== "Tab" || event.repeat) {
    return false;
  }
  return hasTabChordModifiers(event, macOS) && tracker.heldKeysEqual(["Tab"]);
}

// The reference's Tab handling (`handleTabKeyDown` with the shipped Tab / Shift + Tab
// defaults): hosts opt a subtree out with [data-tab-native], and an active filter keeps native
// navigation available because structural moves are suspended. Otherwise, while the active
// section has selected items the keypress indents or unindents instead of reaching the browser.
// The reference's fallback tab navigation is its app focus manager and stays application-side.
function handleTabShortcut(event: KeyboardEvent, tracker: HoldChordTracker, macOS: boolean) {
  if (!matchesTabChord(event, tracker, macOS)) {
    return;
  }
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (
    target?.closest("[data-tab-native]") ||
    !activeSectionHasSelectedItems() ||
    activeSectionHasItemFilter()
  ) {
    return;
  }
  if (event.shiftKey) {
    unindentSelectedItems();
  } else {
    indentSelectedItems();
  }
  event.preventDefault();
}

function hasNoModifiers(event: KeyboardEvent, macOS: boolean): boolean {
  if (event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  return macOS ? !event.metaKey : true;
}

function getEventSectionNode(event: KeyboardEvent): Element | null {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return target?.closest(".react-flow__node") ?? null;
}

function getDocumentActiveElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function isRootDocumentElement(element: HTMLElement | null): boolean {
  return !element || element === document.body || element === document.documentElement;
}

function blurDocumentActiveElement() {
  const activeElement = getDocumentActiveElement();
  if (activeElement && !isRootDocumentElement(activeElement)) {
    activeElement.blur();
  }
}

function ensureDocumentFallbackFocus() {
  if (isRootDocumentElement(getDocumentActiveElement())) {
    return;
  }
  document.body.focus({ preventScroll: true });
  if (isRootDocumentElement(getDocumentActiveElement())) {
    return;
  }
  document.documentElement.focus({ preventScroll: true });
}

function clearActiveSectionSelectionIfNeeded(sectionNode: Element) {
  const sectionId = sectionNode.getAttribute("data-id");
  if (!sectionId || !getActiveSectionIds().includes(sectionId)) {
    return;
  }
  setActiveSectionIds([]);
  blurDocumentActiveElement();
  ensureDocumentFallbackFocus();
}

// The reference's Escape handler first removes a frozen tooltip. Otherwise item unselection
// consumes the keypress; when the event originated inside an active section node, the active
// selection clears and focus falls back to the document. The pane keeps its own focused Escape
// deselect path from the canvas batch.
function runEscapeAction(event: KeyboardEvent) {
  if (closeFrozenWorkspaceTooltip()) {
    event.preventDefault();
    return;
  }
  const sectionNode = getEventSectionNode(event);
  if (getIsEditableTarget(event) && !sectionNode) {
    return;
  }
  if (unselectAllItems() || !sectionNode) {
    return;
  }
  clearActiveSectionSelectionIfNeeded(sectionNode);
}

function handleEscapeShortcut(event: KeyboardEvent, tracker: HoldChordTracker, macOS: boolean) {
  if (event.key !== "Escape" || event.repeat) {
    return;
  }
  if (!hasNoModifiers(event, macOS) || !tracker.heldKeysEqual(["Escape"])) {
    return;
  }
  runEscapeAction(event);
}

const UNGROUP_COMMAND_ID = "workspace.ungroup-sections";

function hasExactUngroupModifiers(event: KeyboardEvent, macOS: boolean): boolean {
  if (!event.shiftKey || event.altKey) {
    return false;
  }
  return macOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

// Main ships Shift+Mod+G for ungroup. The chord runs the same command every menu, the Inspector,
// and the header offer, and it owns the browser chord only while that command accepts the active
// selection; unavailable and mixed selections retain their native behavior.
function handleUngroupShortcut(event: KeyboardEvent, tracker: HoldChordTracker, macOS: boolean) {
  if (
    event.code !== "KeyG" ||
    event.repeat ||
    !hasExactUngroupModifiers(event, macOS) ||
    !tracker.heldKeysEqual(["KeyG"])
  ) {
    return;
  }
  const state = useWorkspaceDocument.getState();
  const sections = getActiveSectionIds().flatMap((sectionId) => {
    const section = state.sections[sectionId];
    return section ? [section] : [];
  });
  const primarySection = sections[0];
  if (!primarySection) {
    return;
  }
  const result = runWorkspaceCommandById(
    UNGROUP_COMMAND_ID,
    createSectionCommandContext(primarySection, sections),
  );
  if (result.ran) {
    event.preventDefault();
  }
}

export function useCanvasKeyActivations() {
  useEffect(() => {
    const macOS = isMacOs();
    const chordTracker = createHoldChordTracker(macOS);
    // Mirrors the reference shortcut's `wasPressed`: Q remains held across its page/copy/freeze
    // chords, releases when any unrelated key joins it, and an auto-repeat never re-enables it.
    let tooltipPressed = false;

    const disableTooltipIfPressed = () => {
      if (tooltipPressed) {
        tooltipPressed = false;
        disableWorkspaceTooltip();
      }
    };

    const handleTooltipKeyDown = (event: KeyboardEvent) => {
      if (isBareTooltipKey(event)) {
        if (getShouldActivateTooltip(event)) {
          tooltipPressed = true;
          enableWorkspaceTooltip();
        }
        return;
      }
      if (getIsTransientTooltipAuxiliaryChord(event, tooltipPressed)) {
        runTooltipShortcutWithoutRepeat(event, runTooltipAuxiliaryShortcut);
        return;
      }
      disableTooltipIfPressed();
      if (hasNoTooltipModifiers(event)) {
        runTooltipShortcutWithoutRepeat(event, runFocusedFrozenTooltipShortcut);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      chordTracker.onKeyDown(event);
      handleTooltipKeyDown(event);
      handleUngroupShortcut(event, chordTracker, macOS);
      handleItemMoveShortcut(event, chordTracker, macOS);
      handleTabShortcut(event, chordTracker, macOS);
      handleEscapeShortcut(event, chordTracker, macOS);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      chordTracker.onKeyUp(event);
      // On macOS, keyup events for the held tooltip key are swallowed while Meta is down, so
      // releasing Meta also releases the tooltip (the reference clears its pressed-key set
      // the same way).
      if (macOS && event.key === "Meta") {
        disableTooltipIfPressed();
      }
      if (event.key === "q" || event.key === "Q") {
        disableTooltipIfPressed();
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      chordTracker.onMouseMove(event);
    };

    const onWindowBlur = () => {
      chordTracker.onBlur();
      disableTooltipIfPressed();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);
}
