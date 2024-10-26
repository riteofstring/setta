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

export function siteLogoOnKeyDown(e, navigate) {
  if (e.code === "Space") {
    navigate(HOME_ROUTER_PATH);
  } else if (e.key === "Tab" && e.shiftKey) {
    tabToLastFocusablePaneElement(e);
  }
}

export function useReactFlowTabInterceptor() {
  const containerRef = useRef();
  const isTabPress = useRef(false);

  function onFocus(e) {
    if (!isTabPress.current) {
      return;
    }
    movePaneToIncludeElement(e);
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
    if (e.key === "Tab") {
      if (e.shiftKey) {
        if (e.target.id.endsWith("-MenuButtonTrigger")) {
          const sectionId = e.target.id.split("-MenuButtonTrigger")[0];
          shiftTabBackToOverviewListItem(e, sectionId);
        } else if (e.target.id.endsWith("-ContainerCore")) {
          const sectionId = e.target.id.split("-ContainerCore")[0];
          shiftTabBackToOverviewListItem(e, sectionId);
        }
      }

      // let preventedDefault = false;
      // const focusableArray = tabbable(containerRef.current);
      // if (focusableArray.length === 0) {
      //   return;
      // }

      // let nextElement;
      // const currentFocusedElement = document.activeElement;
      // const currentIndex = focusableArray.indexOf(currentFocusedElement);

      // let nextIndex;
      // if (e.shiftKey) {
      //   nextIndex =
      //     currentIndex > 0 ? currentIndex - 1 : focusableArray.length - 1;
      // } else {
      //   nextIndex =
      //     currentIndex < focusableArray.length - 1 ? currentIndex + 1 : 0;
      // }

      // nextElement = focusableArray[nextIndex];
      // if (nextElement.className.includes("react-flow__node")) {
      //   preventedDefault = goToSectionIfNotFullyVisible(
      //     e,
      //     nextElement.dataset.id,
      //   );
      // } else {
      //   for (const [sectionId, ref] of Object.entries(
      //     useSectionRefs.getState().selfOnly,
      //   )) {
      //     if (ref.contains(nextElement)) {
      //       preventedDefault = goToSectionIfNotFullyVisible(e, sectionId);
      //       break;
      //     }
      //   }
      // }

      // if (preventedDefault) {
      //   nextElement.focus({ preventScroll: true });
      // }
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
    document.querySelector("#UiEditorTabButtons button:not([disabled])") ??
    document.getElementById("SiteLogo");
  setTimeout(() => {
    element.focus();
  }, 0);
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
  document.getElementById("ProjectOverviewButtonDiv").focus();
}

function shiftTabBackToOverviewListItem(e, sectionId) {
  if (!useNodeInternals.getState().x.has(sectionId)) {
    // don't go to overview if section is not top level
    return;
  }

  const [overviewVis] = localStorageFns.overviewVis.state();
  const [overviewTab] = localStorageFns.overviewTab.state();
  if (overviewVis && overviewTab === "tab1") {
    // tab back to overview
    const element = document.getElementById(`${sectionId}-OverviewListItem`);
    // need to do setTimeout for some reason,
    // otherwise the div only briefly gets focus and then focus goes to a higher up div
    setTimeout(() => {
      element.focus();
    }, 0);
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
    document
      .getElementById(`${sectionId}-MenuButtonTrigger`)
      .focus({ preventScroll: true });
  }
}

const getFocusableElements = (container) => {
  return Array.from(
    container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
