import { useEffect } from "react";
import { activateDndMovingFreeMode, activateDndSortingMode, deactivateDnd } from "../dnd/dndState";
import { getActiveSectionIds, setActiveSectionIds } from "../document/activeSections";
import { unselectAllItems } from "../document/itemSelection";
import { activateItemSelect, deactivateItemSelect } from "../document/itemSelectionMode";
import { getIsEditableTarget } from "../keybindings/editableTarget";
import { RESERVED_WORKSPACE_GESTURES } from "../keybindings/reservedWorkspaceGestures";
import { matchesWorkspaceChord, type ParsedWorkspaceChord } from "../keybindings/workspaceChords";
import { runWorkspaceKeyBindings } from "../keybindings/workspaceKeyBindingDispatch";
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
// paramSelect = Mod + Shift (hold; the package's item-select mode), and the Escape handler that
// unselects params before it clears an in-section active selection. These are the workspace's
// reserved gestures: they activate and release with their keys instead of running an operation,
// and `reservedWorkspaceGestures.ts` states their chords so a host binding cannot take them.
// The one-shot operations the reference's engine also binds — group, ungroup, delete, and the
// parameter moves — are configurable bindings dispatched by `runWorkspaceKeyBindings`.
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

const modifierKeys = new Set(["Shift", "Meta", "Control", "Alt"]);

type HoldMode = {
  // One reserved gesture: the exact modifier state plus the exact non-modifier pressed set that
  // must match for the mode to hold.
  chord: ParsedWorkspaceChord;
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
      chord: RESERVED_WORKSPACE_GESTURES.freeParameterDrag.chord,
      ignoreInInput: false,
      pressed: false,
      activate: activateDndMovingFreeMode,
      deactivate: deactivateDnd,
    },
    {
      chord: RESERVED_WORKSPACE_GESTURES.sortingParameterDrag.chord,
      ignoreInInput: false,
      pressed: false,
      activate: activateDndSortingMode,
      deactivate: deactivateDnd,
    },
    // The reference's `paramSelect` shortcut "Mod + Shift": exactly Mod and Shift.
    {
      chord: RESERVED_WORKSPACE_GESTURES.parameterSelection.chord,
      ignoreInInput: false,
      pressed: false,
      activate: activateItemSelect,
      deactivate: deactivateItemSelect,
    },
    {
      chord: RESERVED_WORKSPACE_GESTURES.marqueeSelection.chord,
      ignoreInInput: true,
      pressed: false,
      activate: () => useReactFlow.setState({ selectionKeyPressed: true }),
      deactivate: () => useReactFlow.setState({ selectionKeyPressed: false }),
    },
    // The reference registers multi-selection and zoom activation as two "Mod" shortcuts
    // with identical lifecycles; the package drives both states through one mode.
    {
      chord: RESERVED_WORKSPACE_GESTURES.multiSelection.chord,
      ignoreInInput: true,
      pressed: false,
      activate: () =>
        useReactFlow.setState({ multiSelectionActive: true, zoomActivationKeyPressed: true }),
      deactivate: () =>
        useReactFlow.setState({ multiSelectionActive: false, zoomActivationKeyPressed: false }),
    },
    {
      chord: RESERVED_WORKSPACE_GESTURES.panActivation.chord,
      ignoreInInput: true,
      pressed: false,
      activate: () => useReactFlow.setState({ panActivationKeyPressed: true }),
      deactivate: () => useReactFlow.setState({ panActivationKeyPressed: false }),
    },
  ];

  // The reference engine's pressed-key equality (`isShortcutPressed` compares the whole
  // non-modifier pressed set against the shortcut's keys).
  function heldKeysEqual(codes: ReadonlyArray<string>): boolean {
    return heldKeys.size === codes.length && codes.every((code) => heldKeys.has(code));
  }

  function matchesChord(event: KeyboardEvent, chord: ParsedWorkspaceChord): boolean {
    return matchesWorkspaceChord(event, chord, macOS, heldKeysEqual);
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
      runWorkspaceKeyBindings(event, macOS, chordTracker.heldKeysEqual);
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
