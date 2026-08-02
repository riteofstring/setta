/* global CSS, Element, HTMLButtonElement, HTMLDialogElement, HTMLElement, MutationObserver, clearTimeout, document, getComputedStyle, matchMedia, queueMicrotask, setTimeout, window */

(() => {
  const version = "setta-director-command-center-workflow-driver-v1";

  function installDirectorCommandCenterWorkflowDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      directorCommandCenterWorkflowArtifactBrowserState,
      directorCommandCenterWorkflowMinimumCompactLayout,
      directorCommandCenterWorkflowOpenArtifact,
      directorCommandCenterWorkflowRailLayout,
      directorCommandCenterWorkflowVersion: version,
    });
  }

  function directorCommandCenterWorkflowRailLayout() {
    return {
      artifacts: elementBox("#director-artifacts-rail"),
      canvas: elementBox(".director-graph-canvas"),
      compact: matchMedia("(max-width: 760px)").matches,
      composer: elementBox(".director-composer"),
      now: elementBox("#director-now-rail"),
      viewportWidth: window.innerWidth,
    };
  }

  function elementBox(selector) {
    const node = document.querySelector(selector);
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const box = node.getBoundingClientRect();
    return {
      bottom: box.bottom,
      height: box.height,
      left: box.left,
      right: box.right,
      top: box.top,
      width: box.width,
    };
  }

  function directorCommandCenterWorkflowMinimumCompactLayout() {
    const title = document.querySelector(".director-focus-title");
    return {
      composer: horizontalElementBox(".director-composer"),
      controls: horizontalElementBox(".director-command-center-view-controls"),
      headingCount: document.querySelectorAll("h1").length,
      metaHidden:
        getComputedStyle(document.querySelector(".director-focus-meta")).display === "none",
      navigation: horizontalElementBox(".director-workstream-nav"),
      titleClipped: title instanceof HTMLElement ? title.scrollWidth > title.clientWidth + 1 : true,
      viewportWidth: window.innerWidth,
    };
  }

  function horizontalElementBox(selector) {
    const node = document.querySelector(selector);
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width };
  }

  function directorCommandCenterWorkflowOpenArtifact({ artifactId }) {
    const card = document.querySelector(
      `.director-artifact-preview[data-artifact-id="${CSS.escape(String(artifactId))}"]`,
    );
    const expand = card?.querySelector(".director-artifact-expand");
    if (!(expand instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-artifact" };
    }
    if (expand.disabled) {
      return { ok: false, reason: "disabled-artifact" };
    }
    const background = document.querySelector(".director-command-center-content");
    if (!(background instanceof HTMLElement)) {
      return { ok: false, reason: "missing-background" };
    }
    return waitForArtifactModalHandoff(expand, background);
  }

  function waitForArtifactModalHandoff(expand, background) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled || !background.inert) {
          return;
        }
        settled = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(artifactModalHandoffState(background));
      };
      const observer = new MutationObserver(finish);
      observer.observe(background, {
        attributeFilter: ["aria-hidden", "inert"],
        attributes: true,
      });
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        observer.disconnect();
        resolve({ ok: false, reason: "modal-handoff-timeout" });
      }, 1000);
      expand.click();
      queueMicrotask(finish);
    });
  }

  function artifactModalHandoffState(background) {
    const modal = document.querySelector(
      ".director-artifact-browser, .director-artifact-browser-fallback",
    );
    return {
      backgroundHidden: background.getAttribute("aria-hidden") === "true",
      backgroundInert: background.inert,
      focusInsideModal: modal instanceof HTMLElement && modal.contains(document.activeElement),
      modalOpen: modal instanceof HTMLDialogElement ? modal.open : modal instanceof HTMLElement,
      ok: true,
    };
  }

  function directorCommandCenterWorkflowArtifactBrowserState({ artifactId }) {
    const browser = document.querySelector(
      `.director-artifact-browser[data-artifact-id="${CSS.escape(String(artifactId))}"]`,
    );
    const artifactDocument = queryDescendant(browser, ".director-artifact-browser-document");
    const previous = queryDescendant(browser, 'button[aria-label="Previous artifact"]');
    const next = queryDescendant(browser, 'button[aria-label="Next artifact"]');
    const popupStyle = elementStyle(browser);
    const background = document.querySelector(".director-command-center-content");
    const modalBackground = modalBackgroundState(background);
    return {
      activeDocumentId: elementAttribute(artifactDocument, "data-artifact-document"),
      backgroundHidden: modalBackground.hidden,
      backgroundInert: modalBackground.inert,
      backgroundColor: styleValue(popupStyle, "backgroundColor"),
      color: styleValue(popupStyle, "color"),
      colorMode: document.documentElement.dataset.colorMode || "",
      documentCount: descendantCount(browser, ".director-artifact-browser-document"),
      documentText: elementText(artifactDocument),
      liveText: elementText(queryDescendant(browser, ".sr-only[role='status']")),
      nextDisabled: disabledState(next),
      particleStyle: elementAttribute(browser, "data-particle-style"),
      position: elementText(queryDescendant(browser, ".director-artifact-browser-position")),
      previousDisabled: disabledState(previous),
      status: elementAttribute(browser, "data-artifact-load-state"),
      tableCount: descendantCount(artifactDocument, "[data-slot='table-container']"),
      text: elementText(browser),
    };
  }

  function queryDescendant(root, selector) {
    return root instanceof Element ? root.querySelector(selector) : null;
  }

  function descendantCount(root, selector) {
    return root instanceof Element ? root.querySelectorAll(selector).length : 0;
  }

  function elementAttribute(element, name) {
    return element instanceof Element ? (element.getAttribute(name) ?? "") : "";
  }

  function elementText(element) {
    return element instanceof Element ? (element.textContent ?? "") : "";
  }

  function elementStyle(element) {
    return element instanceof HTMLElement ? getComputedStyle(element) : null;
  }

  function styleValue(style, property) {
    return style === null ? "" : (style[property] ?? "");
  }

  function disabledState(element) {
    return element instanceof HTMLButtonElement ? element.disabled : null;
  }

  function modalBackgroundState(background) {
    if (!(background instanceof HTMLElement)) {
      return { hidden: false, inert: false };
    }
    return {
      hidden: background.getAttribute("aria-hidden") === "true",
      inert: background.inert,
    };
  }

  installDirectorCommandCenterWorkflowDriver();
})();
