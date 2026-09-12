export type WorkspaceTextDirection = "ltr" | "rtl";

function parseDirection(value: string): WorkspaceTextDirection | null {
  const normalized = value.toLowerCase();
  if (normalized === "ltr" || normalized === "rtl") {
    return normalized;
  }
  return null;
}

export function getElementTextDirection(
  element: Element,
): WorkspaceTextDirection {
  const explicitAncestor = element.closest<HTMLElement>("[dir]");
  const explicitDirection = explicitAncestor
    ? parseDirection(explicitAncestor.dir)
    : null;
  if (explicitDirection) {
    return explicitDirection;
  }

  const view = element.ownerDocument.defaultView;
  const computedDirection = view
    ? parseDirection(view.getComputedStyle(element).direction)
    : null;
  if (computedDirection) {
    return computedDirection;
  }

  return parseDirection(element.ownerDocument.documentElement.dir) ?? "ltr";
}

export function getInlineDirectionSign(element: Element): 1 | -1 {
  return getElementTextDirection(element) === "rtl" ? -1 : 1;
}
