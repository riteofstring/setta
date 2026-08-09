import { useEffect } from "react";
import { activateDndMovingFreeMode, activateDndSortingMode, deactivateDnd } from "../dnd/dndState";
import { disableWorkspaceTooltip, enableWorkspaceTooltip } from "../tooltip/WorkspaceTooltip";
import { useReactFlow } from "./store";
import { isMacOs } from "./utils";

// The reference binds these through its app shortcut engine with the shipped defaults:
// selectionKeyCode = Shift, multiSelectionKeyCode = Mod, zoomActivationKeyCode = Mod,
// panActivationKeyCode = Space, showTooltipShortcut = Q (bare keys ignored while typing in
// editable targets), movingFreeShortcut = Alt (hold), sortingShortcut = Mod + Alt (hold). The
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

// The reference's hold-shortcut semantics for the dnd modes: a mode activates on the keydown
// whose modifier state matches it exactly (with no non-modifier keys held), releases through
// `deactivateDnd` as soon as any event no longer matches, and — like the reference engine —
// keydown events are the only activator, so releasing Mod while still holding Alt deactivates
// sorting without re-entering the free-move mode.
function createDndModeTracker(macOS: boolean) {
  const heldKeys = new Set<string>();
  let movingFreePressed = false;
  let sortingPressed = false;

  function matchesModifiers(event: KeyboardEvent, withMod: boolean): boolean {
    if (heldKeys.size > 0 || event.shiftKey || !event.altKey) {
      return false;
    }
    if (macOS) {
      return event.metaKey === withMod && !event.ctrlKey;
    }
    return event.ctrlKey === withMod;
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
  }

  return {
    onKeyDown(event: KeyboardEvent) {
      if (!modifierKeys.has(event.key)) {
        heldKeys.add(event.code);
      }
      releaseUnmatchedModes(event);
      if (!movingFreePressed && matchesModifiers(event, false)) {
        movingFreePressed = true;
        activateDndMovingFreeMode();
      }
      if (!sortingPressed && matchesModifiers(event, true)) {
        sortingPressed = true;
        activateDndSortingMode();
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
    onBlur() {
      heldKeys.clear();
      if (movingFreePressed || sortingPressed) {
        movingFreePressed = false;
        sortingPressed = false;
        deactivateDnd();
      }
    },
  };
}

export function useCanvasKeyActivations() {
  useEffect(() => {
    const macOS = isMacOs();
    const modKey = macOS ? "Meta" : "Control";
    const dndModeTracker = createDndModeTracker(macOS);

    const onKeyDown = (event: KeyboardEvent) => {
      dndModeTracker.onKeyDown(event);
      if (event.key === "Shift") {
        useReactFlow.setState({ selectionKeyPressed: true });
      }
      if (event.key === modKey) {
        useReactFlow.setState({
          multiSelectionActive: true,
          zoomActivationKeyPressed: true,
        });
      }
      if (event.key === " " && !getIsEditableTarget(event)) {
        useReactFlow.setState({ panActivationKeyPressed: true });
      }
      if (isBareTooltipKey(event) && !getIsEditableTarget(event)) {
        enableWorkspaceTooltip();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      dndModeTracker.onKeyUp(event);
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
          disableWorkspaceTooltip();
        }
      }
      if (event.key === " ") {
        useReactFlow.setState({ panActivationKeyPressed: false });
      }
      if (event.key === "q" || event.key === "Q") {
        disableWorkspaceTooltip();
      }
    };

    const onWindowBlur = () => {
      dndModeTracker.onBlur();
      useReactFlow.setState({
        selectionKeyPressed: false,
        multiSelectionActive: false,
        zoomActivationKeyPressed: false,
        panActivationKeyPressed: false,
      });
      disableWorkspaceTooltip();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);
}
