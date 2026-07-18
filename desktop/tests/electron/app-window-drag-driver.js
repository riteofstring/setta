/* global Element, document, getComputedStyle */

(() => {
  const version = "setta-app-window-drag-driver-v1";

  function installAppWindowDragDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      appWindowDragVersion: version,
      sampleWindowDragRegions,
      shellTopBarControlMeasurements,
    });
  }

  function shellTopBarControlMeasurements() {
    return {
      masterButton: measuredRect('[data-testid="master-overlay-button"]'),
      newFrameButton: measuredRect(".workspace-toolbar-menu-button"),
      projectToggle: measuredRect('[data-testid="project-sidebar-toggle"]'),
      settingsButton: measuredRect('[data-testid="shell-settings-button"]'),
      shellTopBar: measuredRect('[data-testid="shell-top-bar"]'),
      toolbarButton: measuredRect(".workspace-toolbar-button"),
      toolbarGap: numericGap(".workspace-toolbar-group"),
    };
  }

  function measuredRect(selector) {
    const rect = rectForSelector(selector);
    if (!rect) {
      return null;
    }
    return {
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    };
  }

  function numericGap(selector) {
    const element = document.querySelector(selector);
    if (!(element instanceof Element)) {
      return null;
    }
    const gap = Number.parseFloat(getComputedStyle(element).gap);
    return Number.isFinite(gap) ? gap : null;
  }

  function sampleWindowDragRegions() {
    const toolbar = rectForSelector(".workspace-toolbar");
    const paneTop = rectForSelector(
      '[data-testid="workspace-pane-host"][data-visible="true"] .workspace-pane-top-bar',
    );
    const paneHandle = rectForSelector(
      '[data-testid="workspace-pane-host"][data-visible="true"] [data-workspace-pane-drag-handle="true"]',
    );
    return [
      sampleWindowDragRegionPoint("workspace-control", xOr(toolbar, 14, 118), yOr(toolbar, 14, 18)),
      sampleWindowDragRegionElement("shell-top-bar", '[data-testid="shell-top-bar"]'),
      sampleWindowDragRegionPoint("pane-title-bar", xOr(paneTop, 120, 350), yOr(paneTop, 12, 53)),
      sampleWindowDragRegionPoint(
        "pane-drag-handle",
        centerXOr(paneHandle, 30),
        centerYOr(paneHandle, 53),
      ),
    ];
  }

  function rectForSelector(selector) {
    return document.querySelector(selector)?.getBoundingClientRect() ?? null;
  }

  function xOr(rect, offset, fallback) {
    return rect ? rect.left + offset : fallback;
  }

  function yOr(rect, offset, fallback) {
    return rect ? rect.top + offset : fallback;
  }

  function centerXOr(rect, fallback) {
    return rect ? rect.left + rect.width / 2 : fallback;
  }

  function centerYOr(rect, fallback) {
    return rect ? rect.top + rect.height / 2 : fallback;
  }

  function sampleWindowDragRegionPoint(name, x, y) {
    return {
      ...elementSample(document.elementFromPoint(x, y)),
      name,
      x,
      y,
    };
  }

  function sampleWindowDragRegionElement(name, selector) {
    const element = elementOrNull(document.querySelector(selector));
    const rect = element ? element.getBoundingClientRect() : emptyRect();
    return {
      ...elementSample(element),
      height: rect.height,
      left: rect.left,
      name,
      top: rect.top,
      width: rect.width,
      x: -1,
      y: -1,
    };
  }

  function elementSample(value) {
    const element = elementOrNull(value);
    if (!element) {
      return emptyElementSample();
    }
    const style = getComputedStyle(element);
    return {
      aria: element.getAttribute("aria-label"),
      className: element.getAttribute("class") ?? "",
      region: style.getPropertyValue("-webkit-app-region"),
      tag: element.tagName.toLowerCase(),
      testid: elementTestId(element),
    };
  }

  function elementOrNull(value) {
    return value instanceof Element ? value : null;
  }

  function emptyElementSample() {
    return {
      aria: null,
      className: "",
      region: null,
      tag: null,
      testid: null,
    };
  }

  function emptyRect() {
    return {
      height: 0,
      left: 0,
      top: 0,
      width: 0,
    };
  }

  function elementTestId(element) {
    return (
      element?.getAttribute("data-testid") ??
      element?.closest("[data-testid]")?.getAttribute("data-testid") ??
      null
    );
  }

  installAppWindowDragDriver();
})();
