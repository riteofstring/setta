type RevisionState = {
  revisionById: Record<string, number>;
  localRevisionById: Record<string, Record<string, number>>;
};

function ensureLocalMapEntry(
  localRevisionById: Record<string, Record<string, number>>,
  id: string,
) {
  const existing = localRevisionById[id];
  if (existing) {
    return existing;
  }
  const next = {};
  localRevisionById[id] = next;
  return next;
}

export function bumpRemoteRevisions(
  state: RevisionState,
  ids: Iterable<string>,
): RevisionState {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) {
    return state;
  }
  const revisionById = { ...state.revisionById };
  for (const id of unique) {
    revisionById[id] = (revisionById[id] ?? 0) + 1;
  }
  return {
    revisionById,
    localRevisionById: state.localRevisionById,
  };
}

export function bumpLocalRevisions(
  state: RevisionState,
  ids: Iterable<string>,
  sourceId: string,
): RevisionState {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) {
    return state;
  }

  const revisionById = { ...state.revisionById };
  const localRevisionById = { ...state.localRevisionById };

  for (const id of unique) {
    revisionById[id] = (revisionById[id] ?? 0) + 1;
    const perSource = {
      ...ensureLocalMapEntry(localRevisionById, id),
    };
    perSource[sourceId] = (perSource[sourceId] ?? 0) + 1;
    localRevisionById[id] = perSource;
  }

  return { revisionById, localRevisionById };
}

export function removeRevisionEntries(
  state: RevisionState,
  ids: Iterable<string>,
): RevisionState {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) {
    return state;
  }

  const revisionById = { ...state.revisionById };
  const localRevisionById = { ...state.localRevisionById };

  for (const id of unique) {
    delete revisionById[id];
    delete localRevisionById[id];
  }

  return { revisionById, localRevisionById };
}
