import { movePaneToIncludeElement } from "forks/xyflow/core/utils/graph";
import { getHighestAncestor, getSectionType } from "state/actions/sectionInfos";
import { useSectionRefs } from "state/stores/layoutInteractionStores";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { HOME_ROUTER_PATH, OverviewTabNameEnum } from "./constants";
import { SectionTypeEnum } from "./generatedTypes";

function overviewPaneOnKeyDown(e) {
  if (e.code !== "Tab" || e.shiftKey) {
    return;
  }
  if (e.target === lastFocusableElement(e.currentTarget)) {
    tabToFirstEnabledUIEditorButtonOrToSiteLogo(e);
  }
}

function uiEditorPaneOnKeyDown(e) {
  if (e.code !== "Tab" || e.shiftKey) {
    return;
  }
  if (e.target === lastFocusableElement(e.currentTarget)) {
    e.preventDefault();
    document.getElementById("SiteLogo").focus();
  }
}

function siteLogoOnKeyDown(e, navigate, location, homePath = HOME_ROUTER_PATH) {
  if (location.pathname === homePath) {
    return;
  }
  if (e.code === "Space") {
    navigate(homePath);
  } else if (e.code === "Tab" && e.shiftKey) {
    tabToLastFocusablePaneElement(e);
  }
}

function homePageProjectItemOnKeyDown(e, navigate, projectPath) {
  if (e.code === "Space") {
    if (!projectPath) {
      return;
    }
    navigate(projectPath);
  }
}

function withinSectionTabbingHelper(focusEl) {
  focusEl.focus({ preventScroll: true });
  movePaneToIncludeElement(focusEl);
}

function sectionContainerCoreOnKeyDown(e, ref, sectionId) {
  if (e.code !== "Tab") {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const highestAncestorRef =
    useSectionRefs.getState().withNested[getHighestAncestor(sectionId)];
  const focusableArray = getFocusableElements(highestAncestorRef);

  if (e.shiftKey) {
    const focusEl = getPrevElement(e, ref, focusableArray);
    if (!focusEl) {
      shiftTabBackToOverviewListItem(e, sectionId);
    } else {
      withinSectionTabbingHelper(focusEl);
    }
  } else {
    const focusEl = getNextElement(e, ref, focusableArray);
    if (!focusEl) {
      tabToFirstEnabledUIEditorButtonOrToSiteLogo(e);
    } else {
      withinSectionTabbingHelper(focusEl);
    }
  }
}

function getNextElement(e, ref, focusableArray) {
  if (e.target === ref.current) {
    return firstFocusableElement(ref.current);
  }
  return focusableArray[getCurrentElementIndex(e, focusableArray) + 1];
}

function getPrevElement(e, ref, focusableArray) {
  if (e.target === ref.current) {
    const firstElement = firstFocusableElement(ref.current);
    return focusableArray[focusableArray.indexOf(firstElement) - 1];
  }
  return focusableArray[getCurrentElementIndex(e, focusableArray) - 1];
}

function getCurrentElementIndex(e, focusableArray) {
  return e.target.cmView
    ? focusableArray.findIndex((f) => f.id.startsWith("CodeMirror-"))
    : focusableArray.indexOf(document.activeElement);
}

function tabFromDocumentBody(e) {
  if (document.activeElement === document.body) {
    focusOnProjectOverviewButton(e);
  }
}

function tabToFirstEnabledUIEditorButtonOrToSiteLogo(e) {
  e.preventDefault();
  const element =
    firstFocusableElement(document.getElementById("UiEditorPane")) ??
    document.getElementById("SiteLogo");
  element.focus();
}

function tabToLastFocusablePaneElement(e) {
  e.preventDefault();
  const didFocus = focusOnLastElementOf(
    document.getElementById("UiEditorPane"),
  );
  if (!didFocus) {
    focusOnLastElementOf(document.getElementById("OverviewPane"));
  }
}

function focusOnLastElementOf(container) {
  const lastElement = lastFocusableElement(container);
  if (lastElement) {
    lastElement.focus();
    return true;
  }
  return false;
}

function focusOnProjectOverviewButton(e) {
  e.preventDefault();
  firstFocusableElement(document.getElementById("OverviewPane")).focus();
}

function shiftTabBackToOverviewListItem(e, sectionId) {
  const overviewVis = useLocalStorage.getState().overviewVis;
  const overviewTab = useLocalStorage.getState().overviewTab;
  if (overviewVis && overviewTab === OverviewTabNameEnum.Overview) {
    e.preventDefault();
    const element = document.getElementById(`${sectionId}-OverviewListItem`);
    element.focus();
  } else {
    focusOnProjectOverviewButton(e);
  }
}

function focusOnSection(e, sectionId, focusOnFirstElement = true) {
  e?.preventDefault();
  if (getSectionType(sectionId) === SectionTypeEnum.Group) {
    useSectionRefs
      .getState()
      .withNested[sectionId].focus({ preventScroll: true });
  } else {
    if (focusOnFirstElement) {
      firstFocusableElement(
        useSectionRefs.getState().selfOnly[sectionId],
      ).focus({ preventScroll: true });
    } else {
      // focus on withNested here because this allows
      // react-flow controls (like arrow key) to work
      useSectionRefs
        .getState()
        .withNested[sectionId].focus({ preventScroll: true });
    }
  }
}

const getFocusableElements = (container) => {
  return Array.from(
    container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]):not([role="menubar"])',
    ),
  ).filter((element) => {
    // Check if the element is visible and not disabled
    return (
      !element.hasAttribute("disabled") &&
      !element.getAttribute("aria-hidden") &&
      element.offsetParent !== null
    );
  });
};

const lastFocusableElement = (container) => {
  const focusableElements = getFocusableElements(container);

  if (focusableElements.length === 0) {
    return null;
  }

  return focusableElements[focusableElements.length - 1];
};

const firstFocusableElement = (container) => {
  const focusableElements = getFocusableElements(container);

  if (focusableElements.length === 0) {
    return null;
  }

  return focusableElements[0];
};

export function focusOnSectionSearch(sectionId: string) {
  document.getElementById(`${sectionId}-search`).focus({ preventScroll: true });
}

const pendingSectionTextFocus = new Set<string>();
const TERMINAL_INPUT_SELECTOR = ".xterm-helper-textarea, .xterm textarea";
const TERMINAL_INPUT_SELECTORS = [".xterm-helper-textarea", ".xterm textarea"];
const SECTION_TEXT_INPUT_SELECTORS = [
  `[data-section-main-editor] .cm-content`,
  `[data-section-main-editor] [contenteditable="true"]`,
  ...TERMINAL_INPUT_SELECTORS.map(
    (selector) => `[data-section-main-editor] ${selector}`,
  ),
  ".section-full-no-title .cm-content",
  '.section-full-no-title [contenteditable="true"]',
  ".section-main .cm-content",
  '.section-main [contenteditable="true"]',
  ...TERMINAL_INPUT_SELECTORS,
  `[contenteditable="true"]`,
  ".cm-content",
];
const MAX_SECTION_TEXT_FOCUS_ATTEMPTS = 240;

export function isPendingSectionTextFocus(sectionId: string) {
  return pendingSectionTextFocus.has(sectionId);
}

export function clearPendingSectionTextFocus(sectionId: string) {
  pendingSectionTextFocus.delete(sectionId);
}

export function focusOnSectionTextInput(sectionId: string, attempt = 0) {
  if (attempt === 0) {
    if (pendingSectionTextFocus.has(sectionId)) {
      return;
    }
    pendingSectionTextFocus.add(sectionId);
  }
  const ref =
    useSectionRefs.getState().selfOnly[sectionId] ??
    useSectionRefs.getState().withNested[sectionId];
  const focusTarget = getSectionTextInputTarget(ref);
  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus({ preventScroll: true });
    const active = document.activeElement;
    if (ref && active instanceof HTMLElement && ref.contains(active)) {
      if (!focusTarget.matches(TERMINAL_INPUT_SELECTOR)) {
        clearPendingSectionTextFocus(sectionId);
      }
      return;
    }
  }
  const activeElement = document.activeElement;
  if (
    attempt > 0 &&
    ref &&
    activeElement instanceof HTMLElement &&
    !ref.contains(activeElement) &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  ) {
    clearPendingSectionTextFocus(sectionId);
    return;
  }
  if (attempt < MAX_SECTION_TEXT_FOCUS_ATTEMPTS) {
    requestAnimationFrame(() =>
      focusOnSectionTextInput(sectionId, attempt + 1),
    );
  } else {
    clearPendingSectionTextFocus(sectionId);
  }
}

function getSectionTextInputTarget(
  ref: HTMLElement | null,
): HTMLElement | null {
  if (!ref) {
    return null;
  }
  for (const selector of SECTION_TEXT_INPUT_SELECTORS) {
    const target = ref.querySelector(selector);
    if (target instanceof HTMLElement) {
      return target;
    }
  }
  return null;
}
