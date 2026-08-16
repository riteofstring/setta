import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSectionData,
  deleteWorkspaceItems,
  insertWorkspaceItem,
  setItemData,
  setSectionData,
  setWorkspaceCodeSectionData,
  type WorkspaceDocument,
  type WorkspaceDocumentInput,
  type WorkspaceHost,
  type WorkspaceItem,
  type WorkspaceSection,
} from "@setta/workspace";

import {
  DIAGNOSTIC_SEVERITY_INFORMATION_V1,
  type DiagnosticV1,
  type ParameterV1,
  type ProjectSnapshotV1,
} from "../backend/generatedContract";
import {
  CALLABLE_SECTION_ID,
  PARAMETER_ITEM_ROOT_ID,
  type CallableSectionData,
  type ParameterItemData,
  readParameterItemData,
} from "../sections/CallableSection";

export const CALLABLE_SECTION_KIND = "python-canvas.callable" as const;
export const GENERATED_PYTHON_SECTION_ID =
  "python-canvas:generated-python" as const;

export const CALLABLE_SECTION_SIZE = { width: 360, height: 280 } as const;
export const GENERATED_PYTHON_SECTION_SIZE = {
  width: 640,
  height: 420,
} as const;

export function projectWorkspaceDocument(
  snapshot: ProjectSnapshotV1,
): WorkspaceDocumentInput {
  return {
    sections: {
      [CALLABLE_SECTION_ID]: {
        id: CALLABLE_SECTION_ID,
        kind: CALLABLE_SECTION_KIND,
        name: getCallable(snapshot).name,
        size: CALLABLE_SECTION_SIZE,
        overflowMode: false,
        isMinimized: false,
        // Parameter authoring is a structural item mutation, which the package
        // refuses on a locked section, so this card is an ordinary movable one.
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        tagColor: null,
        children: [],
        data: projectCallableSectionData(snapshot),
        itemTree: {
          rootId: PARAMETER_ITEM_ROOT_ID,
          items: projectParameterItems(snapshot),
          selectedItemIds: [],
        },
      },
      [GENERATED_PYTHON_SECTION_ID]: {
        id: GENERATED_PYTHON_SECTION_ID,
        kind: WORKSPACE_CODE_SECTION_KIND,
        name: "Generated Python",
        size: GENERATED_PYTHON_SECTION_SIZE,
        overflowMode: false,
        isMinimized: false,
        positionAndSizeLocked: true,
        isHorizontalOrientation: false,
        styleColor: null,
        tagColor: null,
        children: [],
        data: projectGeneratedCodeData(snapshot),
      },
    },
    topLevelSections: {
      [CALLABLE_SECTION_ID]: {
        x: 0,
        y: 0,
        w: CALLABLE_SECTION_SIZE.width,
        h: CALLABLE_SECTION_SIZE.height,
        zIndex: 0,
      },
      [GENERATED_PYTHON_SECTION_ID]: {
        x: 400,
        y: 0,
        w: GENERATED_PYTHON_SECTION_SIZE.width,
        h: GENERATED_PYTHON_SECTION_SIZE.height,
        zIndex: 1,
      },
    },
    viewport: null,
    activeIds: [],
  };
}

// Applies one canonical Go response through the workspace public mutation seams. The item tree is
// the canonical parameter list: same IDs, same order. Ordinary edits leave the structure alone, so
// only item data is written; a response that reshapes the list — a fresh signature, or a restore
// after a rejected proposal — is rebuilt through the package's own insertion and deletion funnels.
export function applyProjectSnapshotToWorkspace(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV1,
): void {
  setSectionData(
    host,
    CALLABLE_SECTION_ID,
    projectCallableSectionData(snapshot),
  );
  reconcileParameterItems(host, snapshot);
  setWorkspaceCodeSectionData(
    host,
    GENERATED_PYTHON_SECTION_ID,
    projectGeneratedCodeData(snapshot),
  );
}

// The response to a proposal the person has already moved past. A structural edit lands the moment
// the package's own action runs, which can be while a proposal is in flight, and the document is
// what they last asked for — so this writes everything the project owns except the parameter list
// itself, and the controller proposes the newer list rather than rebuilding the older one over it.
export function applyProjectSnapshotKeepingParameterList(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV1,
): void {
  setSectionData(
    host,
    CALLABLE_SECTION_ID,
    projectCallableSectionData(snapshot),
  );
  const documentIds = new Set(readParameterItemIds(host));
  for (const parameter of getCallableParameters(snapshot)) {
    if (documentIds.has(parameter.id)) {
      setItemData(
        host,
        CALLABLE_SECTION_ID,
        parameter.id,
        projectParameterItemData(parameter),
      );
    }
  }
  setWorkspaceCodeSectionData(
    host,
    GENERATED_PYTHON_SECTION_ID,
    projectGeneratedCodeData(snapshot),
  );
}

export function setParameterItemsDisabled(
  host: WorkspaceHost,
  disabled: boolean,
): void {
  for (const item of readCallableParameterItems(host.getSnapshot())) {
    if (item.data.disabled !== disabled) {
      setItemData(host, CALLABLE_SECTION_ID, item.id, {
        ...item.data,
        disabled,
      });
    }
  }
}

export function setParameterItemExpression(
  host: WorkspaceHost,
  parameterID: string,
  authoredExpression: string,
): void {
  updateParameterItem(host, parameterID, (data) =>
    data.authoredExpression === authoredExpression
      ? null
      : { ...data, authoredExpression },
  );
}

export function setParameterItemName(
  host: WorkspaceHost,
  parameterID: string,
  name: string,
): void {
  updateParameterItem(host, parameterID, (data) =>
    data.name === name ? null : { ...data, name },
  );
}

// The one blank app-authored record the package's Add parameter action inserts, or the exact
// canonical record a reprojection is putting back. Its ID is the parameter ID the store will
// adopt, proposed once here.
export function createCallableParameterItem(
  host: WorkspaceHost,
): WorkspaceItem {
  const queued = projectedItemQueues.get(host)?.shift();
  if (queued !== undefined) {
    return queued;
  }
  return {
    id: `parameter:authored:${crypto.randomUUID()}`,
    children: [],
    data: {
      authoredExpression: "",
      default: null,
      disabled: false,
      name: "",
      nameEditable: true,
    } satisfies ParameterItemData,
  };
}

export function readCallableParameterItemIds(
  section: WorkspaceSection,
): Array<string> {
  const itemTree = section.itemTree;
  if (itemTree === undefined) {
    throw new Error("The Python Canvas callable section has no item tree.");
  }
  return [...(itemTree.items[itemTree.rootId]?.children ?? [])];
}

// The callable's rows in document order, which is what a proposal to the store is made of.
export function readCallableParameterItems(
  document: WorkspaceDocument,
): Array<{ data: ParameterItemData; id: string }> {
  const section = document.sections[CALLABLE_SECTION_ID];
  if (section === undefined) {
    throw new Error(
      "Python Canvas projection is missing its callable section.",
    );
  }
  const itemTree = section.itemTree;
  if (itemTree === undefined) {
    throw new Error("The Python Canvas callable section has no item tree.");
  }
  return readCallableParameterItemIds(section).map((itemId) => {
    const item = itemTree.items[itemId];
    if (item === undefined) {
      throw new Error(`Python Canvas parameter item ${itemId} is missing.`);
    }
    return { data: readParameterItemData(item.data), id: itemId };
  });
}

// A reprojection hands the factory the exact records it wants back, because the workspace item ID
// is the canonical parameter ID and only the registered factory may propose one.
const projectedItemQueues = new WeakMap<WorkspaceHost, Array<WorkspaceItem>>();

function reconcileParameterItems(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV1,
): void {
  const canonical = getCallableParameters(snapshot);
  const canonicalIds = canonical.map((parameter) => parameter.id);
  let documentIds = readParameterItemIds(host);

  // Records the project dropped go first, in one atomic deletion.
  const stale = documentIds.filter((itemId) => !canonicalIds.includes(itemId));
  if (stale.length > 0) {
    deleteWorkspaceItems(host, CALLABLE_SECTION_ID, stale);
    documentIds = readParameterItemIds(host);
  }
  // Records the project holds that this document does not: a rejected deletion put back.
  const missing = canonical.filter(
    (parameter) => !documentIds.includes(parameter.id),
  );
  if (missing.length > 0) {
    insertProjectedItems(host, missing);
    documentIds = readParameterItemIds(host);
  }
  // Only a rejected reorder can leave retained rows in an order the project does not hold, and
  // appending cannot fix an order, so that one case rebuilds the list from canonical.
  if (!sameOrder(documentIds, canonicalIds)) {
    deleteWorkspaceItems(host, CALLABLE_SECTION_ID, documentIds);
    insertProjectedItems(host, canonical);
  }

  for (const parameter of canonical) {
    setItemData(
      host,
      CALLABLE_SECTION_ID,
      parameter.id,
      projectParameterItemData(parameter),
    );
  }
}

// The package owns insertion placement and asks the registered factory for each item, so a
// reprojection queues the exact canonical records it needs put back.
function insertProjectedItems(
  host: WorkspaceHost,
  parameters: Array<ParameterV1>,
): void {
  projectedItemQueues.set(
    host,
    parameters.map((parameter) => ({
      id: parameter.id,
      children: [],
      data: projectParameterItemData(parameter),
    })),
  );
  try {
    for (const _parameter of parameters) {
      insertWorkspaceItem(host, CALLABLE_SECTION_ID);
    }
  } finally {
    projectedItemQueues.delete(host);
  }
}

function readParameterItemIds(host: WorkspaceHost): Array<string> {
  return readCallableParameterItems(host.getSnapshot()).map((item) => item.id);
}

function updateParameterItem(
  host: WorkspaceHost,
  parameterID: string,
  next: (data: ParameterItemData) => ParameterItemData | null,
): void {
  const current = readCallableParameterItems(host.getSnapshot()).find(
    (item) => item.id === parameterID,
  );
  if (current === undefined) {
    return;
  }
  const data = next(current.data);
  if (data === null) {
    return;
  }
  setItemData(host, CALLABLE_SECTION_ID, parameterID, data);
}

function sameOrder(left: Array<string>, right: Array<string>): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function projectCallableSectionData(
  snapshot: ProjectSnapshotV1,
): CallableSectionData {
  const callable = getCallable(snapshot);
  const parameterIds = new Set(
    getCallableParameters(snapshot).map((parameter) => parameter.id),
  );
  const parameterDiagnostics: CallableSectionData["parameterDiagnostics"] = {};
  for (const diagnostic of snapshot.diagnostics) {
    if (!parameterIds.has(diagnostic.targetId)) {
      continue;
    }
    const projected = projectParameterDiagnostic(diagnostic);
    parameterDiagnostics[diagnostic.targetId] = [
      ...(parameterDiagnostics[diagnostic.targetId] ?? []),
      projected,
    ];
  }
  return {
    callable: {
      authoredExpression: callable.authoredExpression,
      id: callable.id,
      name: callable.name,
    },
    parameterDiagnostics,
    providerStatus: {
      provider: snapshot.providerStatus.provider,
      status: snapshot.providerStatus.status,
      state: snapshot.providerStatus.state,
    },
  };
}

function projectParameterItems(
  snapshot: ProjectSnapshotV1,
): Record<string, WorkspaceItem> {
  const parameters = getCallableParameters(snapshot);
  const items: Record<string, WorkspaceItem> = {
    [PARAMETER_ITEM_ROOT_ID]: {
      id: PARAMETER_ITEM_ROOT_ID,
      children: parameters.map((parameter) => parameter.id),
    },
  };
  for (const parameter of parameters) {
    items[parameter.id] = {
      id: parameter.id,
      children: [],
      data: projectParameterItemData(parameter),
    };
  }
  return items;
}

function projectParameterItemData(parameter: ParameterV1): ParameterItemData {
  // The row is main's ordinary text parameter, so it is projected the name, whether that name is
  // the app's to write, the authored value, and the real default. The canonical passing style and
  // type annotation stay where code generation and diagnostics read them rather than becoming
  // permanent row copy.
  return {
    authoredExpression: parameter.authoredExpression,
    default: parameter.default,
    disabled: false,
    name: parameter.name,
    nameEditable: parameter.nameEditable,
  };
}

// The Go response already separates the target's prefix and suffix from the generated body, so the
// reader shows the same authority boundary the backend owns: only the body is generated. This
// asserts the combined bytes rather than trusting the parts, and then declares the range from the
// end of the prefix to the start of the suffix, which is the donor's own separator-bounded range.
// It is a frontend projection over an already canonical response, not a second code-generation
// model.
function projectGeneratedCodeData(snapshot: ProjectSnapshotV1) {
  const { prefix, suffix } = snapshot.pythonTarget;
  const { body, code } = snapshot.generatedCode;
  if (`${prefix}\n\n${body}\n\n${suffix}` !== code) {
    throw new Error(
      "Generated Python does not compose its canonical prefix, body, and suffix.",
    );
  }
  return createWorkspaceCodeSectionData({
    code,
    generatedRegion: { from: prefix.length, to: code.length - suffix.length },
    language: "python",
    wrapLines: true,
    lineNumbers: true,
    indentWidth: 4,
    // The section is a reader over Go-owned Python, so it selects the package's generic
    // generated-document presentation instead of an ordinary editor nobody can author.
    mode: "generated-document",
  });
}

function getCallable(snapshot: ProjectSnapshotV1) {
  const callable = snapshot.callables[0];
  if (callable === undefined) {
    throw new Error("Project snapshot is missing its callable.");
  }
  return callable;
}

// The callable's ordered parameter list, resolved against the snapshot's own records so a
// malformed response fails here rather than rendering a row with no meaning behind it.
function getCallableParameters(
  snapshot: ProjectSnapshotV1,
): Array<ParameterV1> {
  const callable = getCallable(snapshot);
  if (callable.parameterIds.length !== snapshot.parameters.length) {
    throw new Error(
      "Project snapshot has parameters its callable does not carry.",
    );
  }
  return callable.parameterIds.map((parameterId) => {
    const parameter = snapshot.parameters.find(
      (candidate) => candidate.id === parameterId,
    );
    if (parameter === undefined) {
      throw new Error(
        `Project snapshot callable parameter ${parameterId} has no parameter record.`,
      );
    }
    return parameter;
  });
}

function projectParameterDiagnostic(diagnostic: DiagnosticV1) {
  return {
    message: diagnostic.message,
    severity:
      diagnostic.severity === DIAGNOSTIC_SEVERITY_INFORMATION_V1
        ? ("info" as const)
        : diagnostic.severity,
  };
}
