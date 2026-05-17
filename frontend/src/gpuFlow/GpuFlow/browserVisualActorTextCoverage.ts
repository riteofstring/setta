import type { GpuRetainedDomControlTextCoverageState } from "../retainedDomControlScene";

export function isDomControlHostFocused(element: HTMLElement): boolean {
  const ownerDocument = element.ownerDocument;
  const elementConstructor = ownerDocument.defaultView?.Element;
  const activeElement = ownerDocument.activeElement;
  return Boolean(
    elementConstructor &&
      activeElement instanceof elementConstructor &&
      element.contains(activeElement),
  );
}

export function getDomControlHostSelectionState(
  element: HTMLElement,
  focused: boolean,
): GpuRetainedDomControlTextCoverageState["selection"] {
  return (
    getFormControlSelectionState(element, focused) ??
    getDocumentSelectionState(element, focused)
  );
}

function getFormControlSelectionState(
  element: HTMLElement,
  focused: boolean,
): GpuRetainedDomControlTextCoverageState["selection"] | null {
  const activeElement = element.ownerDocument.activeElement;
  const ownerWindow = element.ownerDocument.defaultView;
  if (!ownerWindow) {
    return null;
  }
  if (
    activeElement instanceof ownerWindow.HTMLInputElement ||
    activeElement instanceof ownerWindow.HTMLTextAreaElement
  ) {
    return getTextInputSelectionState(activeElement, focused);
  }
  return null;
}

function getTextInputSelectionState(
  element: HTMLInputElement | HTMLTextAreaElement,
  focused: boolean,
): GpuRetainedDomControlTextCoverageState["selection"] {
  const selectionStart = element.selectionStart;
  const selectionEnd = element.selectionEnd;
  if (selectionStart === null || selectionEnd === null) {
    return focused ? "collapsed" : "none";
  }
  return selectionStart === selectionEnd ? "collapsed" : "range";
}

function getDocumentSelectionState(
  element: HTMLElement,
  focused: boolean,
): GpuRetainedDomControlTextCoverageState["selection"] {
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return focused ? "collapsed" : "none";
  }
  if (!isSelectionInsideElement(element, selection)) {
    return focused ? "collapsed" : "none";
  }
  return selection.isCollapsed ? "collapsed" : "range";
}

function isSelectionInsideElement(
  element: HTMLElement,
  selection: Selection,
): boolean {
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  return Boolean(
    (!anchorNode || element.contains(anchorNode)) &&
      (!focusNode || element.contains(focusNode)),
  );
}
