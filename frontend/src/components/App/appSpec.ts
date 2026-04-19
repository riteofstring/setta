import type { Spec } from "@json-render/core";

type RawUIElement = {
  key: string;
  type: string;
  props?: unknown;
  children?: unknown;
  parentKey?: unknown;
  visible?: unknown;
};

type UIElementMap = Record<string, RawUIElement>;
type StackEntry = {
  element: RawUIElement;
  parentKey: string | null;
};
type ResolvedChild = {
  childKey: string;
  childElement: RawUIElement;
};
type ResolvedRoot = {
  rootKey: string;
  rootElement: RawUIElement;
  elements: UIElementMap;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUIElement(value: unknown): value is RawUIElement {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.key === "string" && typeof value.type === "string";
}

function resolveOverrideKey(rootKeyOverride?: string | null): string | null {
  if (
    typeof rootKeyOverride !== "string" ||
    rootKeyOverride.trim().length === 0
  ) {
    return null;
  }
  return rootKeyOverride;
}

function collectRawElements(elementsRaw: unknown): UIElementMap {
  if (!isRecord(elementsRaw)) {
    return {};
  }
  const output: UIElementMap = {};
  for (const [key, value] of Object.entries(elementsRaw)) {
    if (isUIElement(value)) {
      output[key] = value;
    }
  }
  return output;
}

function resolveChildEntry(
  child: unknown,
  elements: UIElementMap,
): ResolvedChild | null {
  if (typeof child === "string") {
    const childElement = elements[child];
    return childElement ? { childKey: child, childElement } : null;
  }
  if (!isUIElement(child)) {
    return null;
  }
  return { childKey: child.key, childElement: child };
}

function collectChildKeys(
  element: RawUIElement,
  elements: UIElementMap,
  stack: StackEntry[],
): string[] {
  const children = Array.isArray(element.children) ? element.children : [];
  const childKeys: string[] = [];
  for (const child of children) {
    const resolvedChild = resolveChildEntry(child, elements);
    if (!resolvedChild) {
      continue;
    }
    childKeys.push(resolvedChild.childKey);
    stack.push({
      element: resolvedChild.childElement,
      parentKey: element.key,
    });
  }
  return childKeys;
}

function buildNormalizedElement(
  element: RawUIElement,
  parentKey: string | null,
  childKeys: string[],
): Spec["elements"][string] {
  const props = isRecord(element.props) ? element.props : {};
  return {
    key: element.key,
    type: element.type,
    props,
    parentKey,
    ...(element.visible !== undefined ? { visible: element.visible } : {}),
    children: childKeys.length > 0 ? childKeys : undefined,
  };
}

function normalizeElements(
  root: RawUIElement,
  elements: UIElementMap,
): Spec["elements"] {
  const output: Spec["elements"] = {};
  const stack: StackEntry[] = [{ element: root, parentKey: null }];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current.element.key)) {
      continue;
    }
    visited.add(current.element.key);
    const childKeys = collectChildKeys(current.element, elements, stack);
    output[current.element.key] = buildNormalizedElement(
      current.element,
      current.parentKey,
      childKeys,
    );
  }
  return output;
}

function resolveRecordRoot(
  rootRaw: unknown,
  rawElements: UIElementMap,
  overrideKey: string | null,
): ResolvedRoot | null {
  if (overrideKey) {
    const overrideRoot = rawElements[overrideKey];
    if (!overrideRoot) {
      return null;
    }
    return {
      rootKey: overrideKey,
      rootElement: overrideRoot,
      elements: rawElements,
    };
  }
  if (typeof rootRaw === "string") {
    const rootElement = rawElements[rootRaw];
    if (!rootElement) {
      return null;
    }
    return { rootKey: rootRaw, rootElement, elements: rawElements };
  }
  if (!isUIElement(rootRaw)) {
    return null;
  }
  return {
    rootKey: rootRaw.key,
    rootElement: rootRaw,
    elements: { ...rawElements, [rootRaw.key]: rootRaw },
  };
}

function normalizeRecordSpec(
  record: Record<string, unknown>,
  overrideKey: string | null,
): Spec | null {
  if (!("root" in record) || !("elements" in record)) {
    return null;
  }
  const resolvedRoot = resolveRecordRoot(
    record.root,
    collectRawElements(record.elements),
    overrideKey,
  );
  if (!resolvedRoot) {
    return null;
  }
  return {
    root: resolvedRoot.rootKey,
    elements: normalizeElements(
      resolvedRoot.rootElement,
      resolvedRoot.elements,
    ),
  };
}

function normalizeSingleRootSpec(spec: RawUIElement): Spec {
  return {
    root: spec.key,
    elements: normalizeElements(spec, { [spec.key]: spec }),
  };
}

export function normalizeAppSpec(
  spec: unknown,
  rootKeyOverride?: string | null,
): Spec | null {
  if (!isRecord(spec)) {
    return null;
  }
  const overrideKey = resolveOverrideKey(rootKeyOverride);
  const recordSpec = normalizeRecordSpec(spec, overrideKey);
  if (recordSpec) {
    return recordSpec;
  }
  if (overrideKey || !isUIElement(spec)) {
    return null;
  }
  return normalizeSingleRootSpec(spec);
}
