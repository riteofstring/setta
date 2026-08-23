const parameterWorkspaceItemPrefix = "python-canvas:parameter-item:";

export function callableSectionID(callableId: string): string {
  return `python-canvas:callable:${callableId}`;
}

export function listSectionID(listId: string): string {
  return `python-canvas:list:${listId}`;
}

export function parameterItemRootID(callableId: string): string {
  return `${callableSectionID(callableId)}:parameter-root`;
}

// Canonical IDs are opaque application data. Their workspace structural
// counterparts live in disjoint namespaces, including the two item roots.
export function parameterWorkspaceItemID(parameterId: string): string {
  return `${parameterWorkspaceItemPrefix}${encodeURIComponent(parameterId)}`;
}

export function canonicalParameterID(itemId: string): string {
  return canonicalWorkspaceItemID(
    itemId,
    parameterWorkspaceItemPrefix,
    "parameter",
  );
}

function canonicalWorkspaceItemID(
  itemId: string,
  prefix: string,
  kind: string,
): string {
  if (!itemId.startsWith(prefix)) {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  const encoded = itemId.slice(prefix.length);
  let id: string;
  try {
    id = decodeURIComponent(encoded);
  } catch {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  if (id === "" || `${prefix}${encodeURIComponent(id)}` !== itemId) {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  return id;
}
