import { removeFrozenFloatingBox } from "components/Utils/FloatingBox";
import {
  indentSelectedParams,
  unindentSelectedParams,
} from "state/actions/params/moveParams";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useSettings } from "state/stores/uiPreferenceStores";
import { handleTabNavigation } from "utils/focusManager";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { clearActiveSectionIds } from "./activeSections";
import { getIsInput } from "./keyShortcutInputPolicy";
import { getTabShortcutInfo } from "./keyShortcutMatching";
import { unselectAllParams } from "./projectStateCommands";

export function runParamShortcut(
  action: () => boolean | void,
  event: KeyboardEvent,
) {
  if (getIsInput(event)) {
    return;
  }
  const didRun = action();
  if (didRun) {
    event.preventDefault();
  }
}

export function onEscapeKey(event: KeyboardEvent) {
  removeFrozenFloatingBox();
  const target = event.target instanceof HTMLElement ? event.target : null;
  const sectionNode = target?.closest(".react-flow__node");
  if (getIsInput(event) && !sectionNode) {
    return;
  }
  const didUnselectSomeParams = unselectAllParams();
  if (!didUnselectSomeParams && sectionNode) {
    const sectionId = sectionNode.getAttribute("data-id");
    const activeIds = getActiveSectionUIIds();
    if (sectionId && activeIds.includes(sectionId)) {
      clearActiveSectionIds();
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (
        activeElement &&
        activeElement !== document.body &&
        activeElement !== document.documentElement
      ) {
        activeElement.blur();
      }
      const postBlurActive =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (
        postBlurActive &&
        postBlurActive !== document.body &&
        postBlurActive !== document.documentElement
      ) {
        document.body.focus({ preventScroll: true });
        if (
          document.activeElement !== document.body &&
          document.activeElement !== document.documentElement
        ) {
          document.documentElement.focus({ preventScroll: true });
        }
      }
    }
  }
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

export function resolveTabParamAction(event: KeyboardEvent) {
  const shortcuts = useSettings.getState().shortcuts;
  const indentTab = getTabShortcutInfo(shortcuts.paramIndentShortcut);
  const unindentTab = getTabShortcutInfo(shortcuts.paramUnindentShortcut);
  if (event.shiftKey) {
    if (unindentTab?.shift) {
      return "unindent";
    }
    if (indentTab?.shift) {
      return "indent";
    }
    return null;
  }
  if (indentTab && !indentTab.shift) {
    return "indent";
  }
  if (unindentTab && !unindentTab.shift) {
    return "unindent";
  }
  return null;
}

export function activeSectionHasSelectedParams(): boolean {
  const state = useProjectState.getState();
  const activeId = getActiveSectionUIIds()[0];
  if (!activeId) {
    return false;
  }
  const impl = getCurrEffectiveSectionImpl(state, activeId);
  return isBaseSectionWithParamsImpl(impl) && impl.selectedParams.length > 0;
}
