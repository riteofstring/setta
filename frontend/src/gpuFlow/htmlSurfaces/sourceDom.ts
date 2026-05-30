export const HTML_SURFACE_SOURCE_CLASS_NAME = "setta-gpu-flow__html-source";

export const HTML_SURFACE_SOURCE_SELECTOR =
  '[data-gpu-flow-html-source="true"]';

export const HTML_SURFACE_SOURCE_ID_ATTRIBUTE = "data-gpu-flow-source-id";

export const HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE =
  "data-gpu-flow-projected-interaction";

export function isPassiveHtmlSurfaceSourceEventTarget(
  target: EventTarget | Node | null,
): boolean {
  const sourceElement = findHtmlSurfaceSourceElement(target);
  if (!sourceElement) {
    return false;
  }
  return (
    sourceElement.getAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE) !==
    "true"
  );
}

function findHtmlSurfaceSourceElement(
  target: EventTarget | Node | null,
): HTMLElement | null {
  const element = toElement(target);
  return element?.closest<HTMLElement>(HTML_SURFACE_SOURCE_SELECTOR) ?? null;
}

function toElement(target: EventTarget | Node | null): Element | null {
  if (!target || typeof target !== "object" || !("nodeType" in target)) {
    return null;
  }

  const node = target as Node;
  if (node.nodeType === 1) {
    return node as Element;
  }
  if (node.nodeType === 3) {
    return node.parentElement;
  }
  return null;
}
