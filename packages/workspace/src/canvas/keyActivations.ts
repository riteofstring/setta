import { useEffect } from "react";
import {
  activateDndMovingFreeMode,
  activateDndSortingMode,
  deactivateDnd,
} from "../dnd/dndState.js";
import {
  getActiveSectionIds,
  setActiveSectionIds,
} from "../document/activeSections.js";
import { unselectAllItems } from "../document/itemSelection.js";
import {
  activateItemSelect,
  deactivateItemSelect,
} from "../document/itemSelectionMode.js";
import { getIsEditableTarget } from "../keybindings/editableTarget.js";
import { RESERVED_WORKSPACE_GESTURES } from "../keybindings/reservedWorkspaceGestures.js";
import {
  matchesWorkspaceChord,
  type ParsedWorkspaceChord,
} from "../keybindings/workspaceChords.js";
import { runWorkspaceKeyBindings } from "../keybindings/workspaceKeyBindingDispatch.js";
import {
  closeFrozenWorkspaceTooltip,
  copyWorkspaceTooltipPage,
  decrementWorkspaceTooltipPage,
  disableWorkspaceTooltip,
  enableWorkspaceTooltip,
  freezeWorkspaceTooltip,
  getIsFrozenWorkspaceTooltipFocused,
  incrementWorkspaceTooltipPage,
} from "../tooltip/WorkspaceTooltip.js";
import { getReactFlowStore } from "./store.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import {
  getWorkspaceHostForElement,
  isWorkspaceHostElement,
} from "../workspaceHostInternals.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { getWorkspacePointerLocation } from "./pointerLocation.js";
import { isMacOs } from "./utils.js";

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

function runTooltipAuxiliaryShortcut(
  host: WorkspaceHost,
  event: KeyboardEvent,
): boolean {
  const key = getTooltipShortcutKey(event);
  if (key === "f") {
    return freezeWorkspaceTooltip(host);
  }
  if (key === "ArrowRight") {
    return incrementWorkspaceTooltipPage(host);
  }
  if (key === "ArrowLeft") {
    return decrementWorkspaceTooltipPage(host);
  }
  if (key === "c") {
    return copyWorkspaceTooltipPage(host);
  }
  return false;
}

function getIsTooltipAuxiliaryKey(event: KeyboardEvent): boolean {
  const key = getTooltipShortcutKey(event);
  return (
    key === "f" || key === "ArrowRight" || key === "ArrowLeft" || key === "c"
  );
}

function runFocusedFrozenTooltipShortcut(
  host: WorkspaceHost,
  event: KeyboardEvent,
): boolean {
  if (!getIsFrozenWorkspaceTooltipFocused(host)) {
    return false;
  }
  const key = getTooltipShortcutKey(event);
  if (key === "ArrowRight") {
    return incrementWorkspaceTooltipPage(host);
  }
  if (key === "ArrowLeft") {
    return decrementWorkspaceTooltipPage(host);
  }
  if (key === "c") {
    return copyWorkspaceTooltipPage(host);
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
  return (
    tooltipPressed &&
    hasNoTooltipModifiers(event) &&
    getIsTooltipAuxiliaryKey(event)
  );
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
  chord: ParsedWorkspaceChord;

  activateInPointerOwnedInput?: boolean;
  ignoreInInput: boolean;
  pressed: boolean;
  activate: () => void;
  deactivate: () => void;
};

function shouldActivateHoldMode(
  mode: HoldMode,
  event: KeyboardEvent,
  editableTarget: boolean,
  pointerOwned: boolean,
): boolean {
  if (mode.pressed || event.repeat) {
    return false;
  }
  if (!mode.ignoreInInput || !editableTarget) {
    return true;
  }
  return pointerOwned && mode.activateInPointerOwnedInput === true;
}

function createHoldChordTracker(host: WorkspaceHost, macOS: boolean) {
  const heldKeys = new Set<string>();

  const modes: Array<HoldMode> = [
    {
      chord: RESERVED_WORKSPACE_GESTURES.freeParameterDrag.chord,
      ignoreInInput: false,
      pressed: false,
      activate: () => activateDndMovingFreeMode(host),
      deactivate: () => deactivateDnd(host),
    },
    {
      chord: RESERVED_WORKSPACE_GESTURES.sortingParameterDrag.chord,
      ignoreInInput: false,
      pressed: false,
      activate: () => activateDndSortingMode(host),
      deactivate: () => deactivateDnd(host),
    },

    {
      chord: RESERVED_WORKSPACE_GESTURES.parameterSelection.chord,
      ignoreInInput: false,
      pressed: false,
      activate: () => activateItemSelect(host),
      deactivate: () => deactivateItemSelect(host),
    },
    {
      chord: RESERVED_WORKSPACE_GESTURES.marqueeSelection.chord,
      ignoreInInput: true,
      pressed: false,
      activate: () =>
        getReactFlowStore(host).setState({ selectionKeyPressed: true }),
      deactivate: () =>
        getReactFlowStore(host).setState({ selectionKeyPressed: false }),
    },

    {
      chord: RESERVED_WORKSPACE_GESTURES.multiSelection.chord,
      activateInPointerOwnedInput: true,
      ignoreInInput: true,
      pressed: false,
      activate: () =>
        getReactFlowStore(host).setState({
          multiSelectionActive: true,
          zoomActivationKeyPressed: true,
        }),
      deactivate: () =>
        getReactFlowStore(host).setState({
          multiSelectionActive: false,
          zoomActivationKeyPressed: false,
        }),
    },
    {
      chord: RESERVED_WORKSPACE_GESTURES.panActivation.chord,
      ignoreInInput: true,
      pressed: false,
      activate: () =>
        getReactFlowStore(host).setState({ panActivationKeyPressed: true }),
      deactivate: () =>
        getReactFlowStore(host).setState({ panActivationKeyPressed: false }),
    },
  ];

  function heldKeysEqual(codes: ReadonlyArray<string>): boolean {
    return (
      heldKeys.size === codes.length &&
      codes.every((code) => heldKeys.has(code))
    );
  }

  function matchesChord(
    event: KeyboardEvent,
    chord: ParsedWorkspaceChord,
  ): boolean {
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
    onKeyDown(event: KeyboardEvent, pointerOwned = false) {
      if (!modifierKeys.has(event.key)) {
        heldKeys.add(event.code);
      }
      const editableTarget = getIsEditableTarget(event);
      for (const mode of modes) {
        if (!matchesChord(event, mode.chord)) {
          releaseMode(mode);
          continue;
        }
        if (
          !shouldActivateHoldMode(mode, event, editableTarget, pointerOwned)
        ) {
          continue;
        }
        mode.pressed = true;
        mode.activate();
      }
    },
    onKeyUp(event: KeyboardEvent) {
      heldKeys.delete(event.code);

      if (macOS && event.key === "Meta") {
        heldKeys.clear();
      }
      for (const mode of modes) {
        if (!matchesChord(event, mode.chord)) {
          releaseMode(mode);
        }
      }
    },

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
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

function isRootDocumentElement(element: HTMLElement | null): boolean {
  return (
    !element ||
    element === document.body ||
    element === document.documentElement
  );
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

function clearActiveSectionSelectionIfNeeded(
  host: WorkspaceHost,
  sectionNode: Element,
) {
  const sectionId = sectionNode.getAttribute("data-id");
  if (!sectionId || !getActiveSectionIds(host).includes(sectionId)) {
    return;
  }
  setActiveSectionIds(host, []);
  blurDocumentActiveElement();
  ensureDocumentFallbackFocus();
}

function runEscapeAction(host: WorkspaceHost, event: KeyboardEvent) {
  if (closeFrozenWorkspaceTooltip(host)) {
    event.preventDefault();
    return;
  }
  const sectionNode = getEventSectionNode(event);
  if (getIsEditableTarget(event) && !sectionNode) {
    return;
  }
  if (unselectAllItems(host) || !sectionNode) {
    return;
  }
  clearActiveSectionSelectionIfNeeded(host, sectionNode);
}

function handleEscapeShortcut(
  host: WorkspaceHost,
  event: KeyboardEvent,
  tracker: HoldChordTracker,
  macOS: boolean,
) {
  if (event.key !== "Escape" || event.repeat) {
    return;
  }
  if (!hasNoModifiers(event, macOS) || !tracker.heldKeysEqual(["Escape"])) {
    return;
  }
  runEscapeAction(host, event);
}

function getPointerWorkspaceHost(host: WorkspaceHost): WorkspaceHost | null {
  const pointer = getWorkspacePointerLocation(host);
  if (!pointer || typeof document.elementFromPoint !== "function") {
    return null;
  }
  return getWorkspaceHostForElement(
    document.elementFromPoint(pointer.x, pointer.y),
  );
}

export function useCanvasKeyActivations() {
  const host = useWorkspaceHost();
  useEffect(() => {
    const macOS = isMacOs();
    const chordTracker = createHoldChordTracker(host, macOS);

    let tooltipPressed = false;

    const disableTooltipIfPressed = () => {
      if (tooltipPressed) {
        tooltipPressed = false;
        disableWorkspaceTooltip(host);
      }
    };

    const handleTooltipKeyDown = (event: KeyboardEvent) => {
      if (isBareTooltipKey(event)) {
        if (getShouldActivateTooltip(event)) {
          tooltipPressed = true;
          enableWorkspaceTooltip(host);
        }
        return;
      }
      if (getIsTransientTooltipAuxiliaryChord(event, tooltipPressed)) {
        runTooltipShortcutWithoutRepeat(event, (shortcutEvent) =>
          runTooltipAuxiliaryShortcut(host, shortcutEvent),
        );
        return;
      }
      disableTooltipIfPressed();
      if (hasNoTooltipModifiers(event)) {
        runTooltipShortcutWithoutRepeat(event, (shortcutEvent) =>
          runFocusedFrozenTooltipShortcut(host, shortcutEvent),
        );
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const keyboardOwned = isWorkspaceHostElement(host, event.target);
      const pointerHost = getPointerWorkspaceHost(host);
      const pointerOwned = pointerHost === host;
      if (pointerOwned || (pointerHost === null && keyboardOwned)) {
        chordTracker.onKeyDown(event, pointerOwned);
      }
      if (!keyboardOwned) {
        return;
      }
      handleTooltipKeyDown(event);
      runWorkspaceKeyBindings(host, event, macOS, chordTracker.heldKeysEqual);
      handleEscapeShortcut(host, event, chordTracker, macOS);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      chordTracker.onKeyUp(event);

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
  }, [host]);
}
