import C from "constants/constants.json";
import { movePaneToIncludeElement } from "forks/xyflow/core/utils/graph";
import { useRef } from "react";
import { useNodeInternals, useSectionRefs } from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";
import { localStorageFns } from "state/hooks/localStorage";
import { HOME_ROUTER_PATH } from "./constants";

export function overviewPaneOnKeyDown(e) {
  if (e.key !== "Tab" || e.shiftKey) {
    return;
  }
  if (e.target === lastFocusableElement(e.currentTarget)) {
    tabToFirstEnabledUIEditorButtonOrToSiteLogo(e);
  }
}

export function uiEditorPaneOnKeyDown(e) {
  if (e.key !== "Tab" || e.shiftKey) {
    return;
  }
  if (e.target === lastFocusableElement(e.currentTarget)) {
    e.preventDefault();
    document.getElementById("SiteLogo").focus();
  }
}

export function siteLogoOnKeyDown(e, navigate) {
  if (e.code === "Space") {
    navigate(HOME_ROUTER_PATH);
  } else if (e.key === "Tab" && e.shiftKey) {
    tabToLastFocusablePaneElement(e);
  }
}

export function containerCoreOnKeyDown(e, ref, sectionId) {
  if (e.code !== "Tab") {
    return;
  }
  console.log("containerCoreOnKeyDown");
  if (e.shiftKey) {
    if (
      e.target === firstFocusableElement(ref.current) ||
      e.target === e.currentTarget
    ) {
      shiftTabBackToOverviewListItem(e, sectionId);
    }
  } else if (e.target === lastFocusableElement(ref.current)) {
    tabToFirstEnabledUIEditorButtonOrToSiteLogo(e);
  }
}

export function useReactFlowTabInterceptor() {
  const containerRef = useRef();
  const isTabPress = useRef(false);

  function onFocus(e) {
    if (!isTabPress.current) {
      return;
    }
    // console.log("onFocus", e)
    if (containerRef.current.contains(e.relatedTarget)) {
      // console.log("movePaneToIncludeElement")
      movePaneToIncludeElement(e);
    }
  }

  function onKeyUp() {
    isTabPress.current = false;
  }

  function onBlur(e) {
    if (!containerRef.current.contains(e.relatedTarget)) {
      isTabPress.current = false;
    }
  }

  function onKeyDown(e) {
    isTabPress.current = e.key === "Tab";
    console.log("onKeyDown");
    if (isTabPress.current) {
    }
  }

  return { containerRef, onKeyDown, onKeyUp, onFocus, onBlur };
}

export function tabFromDocumentBody(e) {
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
  if (!useNodeInternals.getState().x.has(sectionId)) {
    // don't go to overview if section is not top level
    return;
  }

  const [overviewVis] = localStorageFns.overviewVis.state();
  const [overviewTab] = localStorageFns.overviewTab.state();
  if (overviewVis && overviewTab === "tab1") {
    e.preventDefault();
    const element = document.getElementById(`${sectionId}-OverviewListItem`);
    element.focus();
  } else {
    focusOnProjectOverviewButton(e);
  }
}

export function focusOnSection(e, sectionId) {
  e.preventDefault();
  if (getSectionType(sectionId).type === C.DECK) {
    useSectionRefs
      .getState()
      .withNested[sectionId].focus({ preventScroll: true });
  } else {
    firstFocusableElement(useSectionRefs.getState().selfOnly[sectionId]).focus({
      preventScroll: true,
    });
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
