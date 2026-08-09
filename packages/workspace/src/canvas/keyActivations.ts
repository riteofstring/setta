import { useEffect } from "react";
import { activateDndMovingFreeMode, activateDndSortingMode, deactivateDnd } from "../dnd/dndState";
import { getActiveSectionIds, setActiveSectionIds } from "../document/activeSections";
import { getSectionHasSelectedItems } from "../document/documentSelectors";
import { unselectAllItems } from "../document/itemSelection";
import { activateItemSelect, deactivateItemSelect } from "../document/itemSelectionMode";
import { useWorkspaceDocument } from "../document/stores";
import {
  indentSelectedItems,
  moveSelectedItemsDown,
  moveSelectedItemsUp,
  unindentSelectedItems,
} from "../items/selectedItemMoves";
import { disableWorkspaceTooltip, enableWorkspaceTooltip } from "../tooltip/WorkspaceTooltip";
import { useReactFlow } from "./store";
import { isMacOs } from "./utils";

// The reference binds these through its app shortcut engine with the shipped defaults:
// selectionKeyCode = Shift, multiSelectionKeyCode = Mod, zoomActivationKeyCode = Mod,
// panActivationKeyCode = Space, showTooltipShortcut = Q (bare keys ignored while typing in
// editable targets), movingFreeShortcut = Alt (hold), sortingShortcut = Mod + Alt (hold),
// paramSelect = Mod + Shift (hold; the package's item-select mode), paramMoveUp/Down =
// Alt + ArrowUp/Down (repeat allowed), paramIndent/Unindent = Tab / Shift + Tab, and the
// Escape handler that unselects params before it clears an in-section active selection. The
// package owns the same activation-key state directly; the engine's command shortcuts (fit
// view "F", zoom "="/"-", zoom to mouse "Z") stay application-side.
// The reference's shortcut engine matches the bare "Q" shortcut only with no modifiers held.
function isBareTooltipKey(event: KeyboardEvent): boolean {
  return (
    (event.key === "q" || event.key === "Q") &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
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

// The reference prunes pressed keys whose keydown is older than this before processing the
// next keydown: on macOS, keyups are swallowed while Meta is held, so a swallowed key can
// only be told apart from a held one by its auto-repeat refreshing the timestamp.
const STALE_HELD_KEY_MS = 100;

// The reference's hold-shortcut semantics for the dnd modes and the item-select chord: a mode
// activates on the keydown whose modifier state matches it exactly (with no non-modifier keys
// held), releases through its deactivation action as soon as any event no longer matches, and
// — like the reference engine — non-repeat keydown events are the only activator: auto-repeat
// keydowns never activate a mode, so releasing Mod while still holding Alt deactivates sorting
// without re-entering the free-move mode even where modifier keys auto-repeat.
function createHoldChordTracker(macOS: boolean) {
  const heldKeys = new Map<string, number>();
  let movingFreePressed = false;
  let sortingPressed = false;
  let itemSelectPressed = false;

  function matchesModifiers(event: KeyboardEvent, withMod: boolean): boolean {
    if (heldKeys.size > 0 || event.shiftKey || !event.altKey) {
      return false;
    }
    if (macOS) {
      return event.metaKey === withMod && !event.ctrlKey;
    }
    return event.ctrlKey === withMod;
  }

  // The reference's `paramSelect` shortcut "Mod + Shift": exactly Mod and Shift, nothing else.
  function matchesItemSelectChord(event: KeyboardEvent): boolean {
    if (heldKeys.size > 0 || !event.shiftKey || event.altKey) {
      return false;
    }
    return macOS ? event.metaKey && !event.ctrlKey : event.ctrlKey;
  }

  function releaseUnmatchedModes(event: KeyboardEvent) {
    if (movingFreePressed && !matchesModifiers(event, false)) {
      movingFreePressed = false;
      deactivateDnd();
    }
    if (sortingPressed && !matchesModifiers(event, true)) {
      sortingPressed = false;
      deactivateDnd();
    }
    if (itemSelectPressed && !matchesItemSelectChord(event)) {
      itemSelectPressed = false;
      deactivateItemSelect();
    }
  }

  function pruneStaleHeldKeys() {
    const now = Date.now();
    for (const [code, timestamp] of heldKeys) {
      if (now - timestamp > STALE_HELD_KEY_MS) {
        heldKeys.delete(code);
      }
    }
  }

  return {
    onKeyDown(event: KeyboardEvent) {
      // The reference prunes after any Mod shortcut ran; the package owns no other Mod
      // shortcuts to key that off, so it prunes before every keydown. Held keys survive
      // through their auto-repeat refreshing the timestamp below.
      pruneStaleHeldKeys();
      if (!modifierKeys.has(event.key)) {
        heldKeys.set(event.code, Date.now());
      }
      releaseUnmatchedModes(event);
      if (event.repeat) {
        return;
      }
      if (!movingFreePressed && matchesModifiers(event, false)) {
        movingFreePressed = true;
        activateDndMovingFreeMode();
      }
      if (!sortingPressed && matchesModifiers(event, true)) {
        sortingPressed = true;
        activateDndSortingMode();
      }
      if (!itemSelectPressed && matchesItemSelectChord(event)) {
        itemSelectPressed = true;
        activateItemSelect();
      }
    },
    onKeyUp(event: KeyboardEvent) {
      heldKeys.delete(event.code);
      // On macOS, keyups for non-modifier keys are swallowed while Meta is held, so releasing
      // Meta clears the held set the same way the reference prunes its stale pressed keys.
      if (macOS && event.key === "Meta") {
        heldKeys.clear();
      }
      releaseUnmatchedModes(event);
    },
    // The reference's aborted-Cmd-Tab recovery: switching away via Mod+Tab and back delivers
    // neither a keyup nor a blur, so the first mouse move without the mod key held releases
    // the mod-gated modes (sorting and item select; free move is not mod-gated, matching the
    // reference's mod-shortcut-only listener).
    onMouseMove(event: MouseEvent) {
      if (!sortingPressed && !itemSelectPressed) {
        return;
      }
      const modHeld = macOS ? event.metaKey : event.ctrlKey;
      if (modHeld) {
        return;
      }
      if (sortingPressed) {
        sortingPressed = false;
        deactivateDnd();
      }
      if (itemSelectPressed) {
        itemSelectPressed = false;
        deactivateItemSelect();
      }
    },
    onBlur() {
      heldKeys.clear();
      if (movingFreePressed || sortingPressed) {
        movingFreePressed = false;
        sortingPressed = false;
        deactivateDnd();
      }
      if (itemSelectPressed) {
        itemSelectPressed = false;
        deactivateItemSelect();
      }
    },
    isItemSelectPressed(): boolean {
      return itemSelectPressed;
    },
    // The reference engine's pressed-key equality (`isShortcutPressed` compares the whole
    // non-modifier pressed set against the shortcut's keys).
    heldKeysEqual(codes: Array<string>): boolean {
      return heldKeys.size === codes.length && codes.every((code) => heldKeys.has(code));
    },
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

function matchesTabChord(event: KeyboardEvent, tracker: HoldChordTracker, macOS: boolean): boolean {
  if (event.key !== "Tab" || event.repeat) {
    return false;
  }
  return hasTabChordModifiers(event, macOS) && tracker.heldKeysEqual(["Tab"]);
}

// The reference's Tab handling (`handleTabKeyDown` with the shipped Tab / Shift + Tab
// defaults): hosts opt a subtree out with [data-tab-native]; while the active section has
// selected items the keypress indents or unindents instead of reaching the browser. The
// reference's fallback tab navigation is its app focus manager and stays application-side.
function handleTabShortcut(event: KeyboardEvent, tracker: HoldChordTracker, macOS: boolean) {
  if (!matchesTabChord(event, tracker, macOS)) {
    return;
  }
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest("[data-tab-native]") || !activeSectionHasSelectedItems()) {
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

// The reference's Escape handler: item unselection consumes the keypress; otherwise, when the
// event originated inside an active section node, the active selection clears and focus falls
// back to the document. The reference's frozen-tooltip removal stays application-side, and the
// pane keeps its own focused Escape deselect path from the canvas batch.
function handleEscapeShortcut(event: KeyboardEvent, tracker: HoldChordTracker, macOS: boolean) {
  if (event.key !== "Escape" || event.repeat) {
    return;
  }
  if (!hasNoModifiers(event, macOS) || !tracker.heldKeysEqual(["Escape"])) {
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

// While the item-select chord is held, the reference's exact-chord Shift and Mod shortcuts
// release (Mod+Shift matches neither), so the chord clears those states and suppresses
// re-arming them until a keydown outside the chord.
function updateActivationKeyStates(
  event: KeyboardEvent,
  itemSelectHeld: boolean,
  modKey: string,
  macOS: boolean,
) {
  if (itemSelectHeld) {
    useReactFlow.setState({
      selectionKeyPressed: false,
      multiSelectionActive: false,
      zoomActivationKeyPressed: false,
    });
  }
  if (event.key === "Shift" && !itemSelectHeld) {
    useReactFlow.setState({ selectionKeyPressed: true });
  }
  if (event.key === modKey && !itemSelectHeld) {
    useReactFlow.setState({ multiSelectionActive: true, zoomActivationKeyPressed: true });
  }
  // The reference's "Space" pan shortcut matches only with no modifiers held.
  if (event.key === " " && hasNoModifiers(event, macOS) && !getIsEditableTarget(event)) {
    useReactFlow.setState({ panActivationKeyPressed: true });
  }
}

export function useCanvasKeyActivations() {
  useEffect(() => {
    const macOS = isMacOs();
    const modKey = macOS ? "Meta" : "Control";
    const chordTracker = createHoldChordTracker(macOS);
    // Mirrors the reference shortcut's `wasPressed`: the tooltip releases on any keydown that
    // no longer matches the bare tooltip key (the reference compares the full pressed-key
    // set), and an auto-repeat of the tooltip key never re-enables it.
    let tooltipPressed = false;

    const disableTooltipIfPressed = () => {
      if (tooltipPressed) {
        tooltipPressed = false;
        disableWorkspaceTooltip();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      chordTracker.onKeyDown(event);
      updateActivationKeyStates(event, chordTracker.isItemSelectPressed(), modKey, macOS);
      if (isBareTooltipKey(event)) {
        if (!event.repeat && !getIsEditableTarget(event)) {
          tooltipPressed = true;
          enableWorkspaceTooltip();
        }
      } else {
        disableTooltipIfPressed();
      }
      handleItemMoveShortcut(event, chordTracker, macOS);
      handleTabShortcut(event, chordTracker, macOS);
      handleEscapeShortcut(event, chordTracker, macOS);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      chordTracker.onKeyUp(event);
      if (event.key === "Shift") {
        useReactFlow.setState({ selectionKeyPressed: false });
      }
      if (event.key === modKey) {
        useReactFlow.setState({ multiSelectionActive: false, zoomActivationKeyPressed: false });
        // On macOS, keyup events for held non-modifier keys are swallowed while Meta is down,
        // so releasing Meta also releases the pan activation (the reference clears its
        // pressed-key set the same way).
        if (macOS) {
          useReactFlow.setState({ panActivationKeyPressed: false });
          disableTooltipIfPressed();
        }
      }
      if (event.key === " ") {
        useReactFlow.setState({ panActivationKeyPressed: false });
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
      useReactFlow.setState({
        selectionKeyPressed: false,
        multiSelectionActive: false,
        zoomActivationKeyPressed: false,
        panActivationKeyPressed: false,
      });
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
