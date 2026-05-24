import { removeFrozenFloatingBox } from "components/Utils/FloatingBox";

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import {
  indentSelectedParams,
  unindentSelectedParams,
} from "state/actions/params/moveParams";

import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";

import { getActiveSectionUIIds } from "state/activeSectionUI";

import { useProjectState, useSettings } from "state/definitions";

import { handleTabNavigation } from "utils/focusManager";

import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

import { clearActiveSectionIds } from "../activeSections";

import { unselectAllParams } from "../sectionInfos";

import {
  TabParamAction,
  TabShortcutInfo,
  getIsInput,
  getTabShortcutInfo,
} from "./shortcutParsing";

function getEventSectionNode(event: KeyboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return target?.closest(".setta-gpu-flow__node");
}

function getDocumentActiveElement() {
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

function isRootDocumentElement(element: HTMLElement | null) {
  return (
    !element ||
    element === document.body ||
    element === document.documentElement
  );
}

function blurDocumentActiveElement() {
  const activeElement = getDocumentActiveElement();
  if (!isRootDocumentElement(activeElement)) {
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
  if (!sectionId || !getActiveSectionUIIds().includes(sectionId)) {
    return;
  }
  clearActiveSectionIds();
  blurDocumentActiveElement();
  ensureDocumentFallbackFocus();
}

export function onEscapeKey(event: KeyboardEvent) {
  removeFrozenFloatingBox();
  const sectionNode = getEventSectionNode(event);
  if (getIsInput(event) && !sectionNode) {
    return;
  }
  if (unselectAllParams() || !sectionNode) {
    return;
  }
  clearActiveSectionSelectionIfNeeded(sectionNode);
}

export function handleTabKeyDown(event: KeyboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest("[data-tab-native]")) {
    return;
  }
  if (activeSectionHasSelectedParams()) {
    const action = resolveTabParamAction(event);
    if (action === "indent") {
      indentSelectedParams();
      event.preventDefault();
      return;
    }
    if (action === "unindent") {
      unindentSelectedParams();
      event.preventDefault();
      return;
    }
  }

  const didHandle = handleTabNavigation(event);
  if (didHandle) {
    event.preventDefault();
  }
}

export function getTabParamActionForShortcuts(
  indentShortcut,
  unindentShortcut,
  shiftKey: boolean,
): TabParamAction | null {
  const shortcutsByAction: Record<TabParamAction, TabShortcutInfo | null> = {
    indent: getTabShortcutInfo(indentShortcut),
    unindent: getTabShortcutInfo(unindentShortcut),
  };
  const actionOrder: TabParamAction[] = shiftKey
    ? ["unindent", "indent"]
    : ["indent", "unindent"];

  return (
    actionOrder.find(
      (action) => shortcutsByAction[action]?.shift === shiftKey,
    ) ?? null
  );
}

function resolveTabParamAction(event: KeyboardEvent) {
  const shortcuts = useSettings.getState().shortcuts;
  return getTabParamActionForShortcuts(
    shortcuts.paramIndentShortcut,
    shortcuts.paramUnindentShortcut,
    event.shiftKey,
  );
}

function activeSectionHasSelectedParams(): boolean {
  const state = useProjectState.getState();
  const activeId = getActiveSectionUIIds()[0];
  if (!activeId) {
    return false;
  }
  const impl = getCurrEffectiveSectionImpl(state, activeId);
  return isBaseSectionWithParamsImpl(impl) && impl.selectedParams.length > 0;
}

export function activateSelectionKeyPressed() {
  gpuFlowViewportStore.getState().setSelectionKeyPressed(true);
}

export function deactivateSelectionKeyPressed() {
  gpuFlowViewportStore.getState().setSelectionKeyPressed(false);
}

export function activateMultiSelectionPressed() {
  gpuFlowViewportStore.getState().setMultiSelectionActive(true);
}

export function deactivateMultiSelectionPressed() {
  gpuFlowViewportStore.getState().setMultiSelectionActive(false);
}

export function activatePanMode() {
  gpuFlowViewportStore.getState().setPanActivationKeyPressed(true);
}

export function deactivatePanMode() {
  gpuFlowViewportStore.getState().setPanActivationKeyPressed(false);
}

export function activateZoomMode() {
  gpuFlowViewportStore.getState().setZoomActivationKeyPressed(true);
}

export function deactivateZoomMode() {
  gpuFlowViewportStore.getState().setZoomActivationKeyPressed(false);
}

export function activateMoveSectionMode() {
  gpuFlowViewportStore.getState().setMoveSectionActivationKeyPressed(true);
}

export function deactivateMoveSectionMode() {
  gpuFlowViewportStore.getState().setMoveSectionActivationKeyPressed(false);
}
