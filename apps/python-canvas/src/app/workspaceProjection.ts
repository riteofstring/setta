import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSectionData,
  deleteWorkspaceItems,
  getWorkspaceCodeSectionData,
  insertWorkspaceItem,
  setItemData,
  setSectionData,
  setWorkspaceCodeSectionData,
  type WorkspaceDocument,
  type WorkspaceDocumentInput,
  type WorkspaceHost,
  type WorkspaceItem,
  type WorkspaceCodeSectionDiagnostic,
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
        // The prefix and suffix are authored here, and the package refuses every edit
        // on a locked section, so this card is an ordinary movable one too.
        positionAndSizeLocked: false,
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

// What a canonical response may not write back, because the person has already moved past it. A
// structural edit lands the moment the package's own action runs, and a keystroke in the generated
// document lands the same way, so a response can arrive for a list or a target the document no
// longer holds. What they last asked for stays, and the controller proposes it in turn. The
// generated body is never theirs to keep: `keepAuthoredPython` holds the prefix and suffix they
// typed, and the response's own body still lands between them.
export type ProjectSnapshotProjectionOptions = Readonly<{
  keepAuthoredPython: boolean;
  keepParameterList: boolean;
}>;

// Applies one canonical Go response through the workspace public mutation seams. The item tree is
// the canonical parameter list: same IDs, same order. Ordinary edits leave the structure alone, so
// only item data is written; a response that reshapes the list — a fresh signature, or a restore
// after a rejected proposal — is rebuilt through the package's own insertion and deletion funnels.
export function applyProjectSnapshotToWorkspace(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV1,
  options: ProjectSnapshotProjectionOptions,
): void {
  setSectionData(
    host,
    CALLABLE_SECTION_ID,
    projectCallableSectionData(snapshot),
  );
  if (options.keepParameterList) {
    updateRetainedParameterItems(host, snapshot);
  } else {
    reconcileParameterItems(host, snapshot);
  }
  setWorkspaceCodeSectionData(
    host,
    GENERATED_PYTHON_SECTION_ID,
    options.keepAuthoredPython
      ? retainedGeneratedCodeData(host, snapshot)
      : projectGeneratedCodeData(snapshot),
  );
}

// The response's own generated body between the prefix and suffix the person is still authoring.
// The body is the project's either way: keeping the whole document instead would leave a module
// the store has already replaced sitting in the one place it is supposed to be read from.
function retainedGeneratedCodeData(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV1,
) {
  const { prefix, suffix } = readGeneratedPythonTarget(host);
  return generatedCodeSectionData(
    prefix,
    generatedPythonRegionText(snapshot),
    suffix,
    [],
  );
}

// The project's own data lands on the rows that survived whatever the person did while the
// response was away; the list itself is left exactly as they left it.
function updateRetainedParameterItems(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV1,
): void {
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
}

// The authored Python the generated document currently holds, split at the package's own mapped
// protected range rather than by searching the text for the generated body.
export function readGeneratedPythonTarget(host: WorkspaceHost): {
  generated: string;
  prefix: string;
  suffix: string;
} {
  const data = getWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID);
  if (data.mode !== "generated-document") {
    throw new Error("Generated Python is not a generated document.");
  }
  const { from, to } = data.generatedRegion;
  return {
    generated: data.code.slice(from, to),
    prefix: data.code.slice(0, from),
    suffix: data.code.slice(to),
  };
}

// The bytes the package protected have to be the canonical ones this proposal was split around,
// or the offsets it was split at mean something else entirely.
export function generatedPythonRegionText(snapshot: ProjectSnapshotV1): string {
  return `\n\n${snapshot.generatedCode.body}\n\n`;
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

// The record the package's Add parameter action inserts: one blank app-authored parameter whose ID
// is the parameter ID the store will adopt, proposed once here. While a reprojection is running,
// the factory is instead handing back the exact canonical records that reprojection queued, and
// being asked for one it did not queue is a projection defect rather than a new parameter.
export function createCallableParameterItem(
  host: WorkspaceHost,
): WorkspaceItem {
  const reprojection = reprojectedItems.get(host);
  if (reprojection === undefined) {
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
  const queued = reprojection.shift();
  if (queued === undefined) {
    throw new Error(
      "Python Canvas reprojection was asked for a parameter item it never queued.",
    );
  }
  return queued;
}

// The callable's rows in document order, which is what its section renders.
export function readCallableParameterRows(
  section: WorkspaceSection,
): Array<{ data: ParameterItemData; id: string }> {
  const itemTree = section.itemTree;
  if (itemTree === undefined) {
    throw new Error("The Python Canvas callable section has no item tree.");
  }
  return [...(itemTree.items[itemTree.rootId]?.children ?? [])].map(
    (itemId) => {
      const item = itemTree.items[itemId];
      if (item === undefined) {
        throw new Error(`Python Canvas parameter item ${itemId} is missing.`);
      }
      return { data: readParameterItemData(item.data), id: itemId };
    },
  );
}

// The same rows read from a whole document, which is what a proposal to the store is made of.
export function readCallableParameterItems(
  document: WorkspaceDocument,
): Array<{ data: ParameterItemData; id: string }> {
  const section = document.sections[CALLABLE_SECTION_ID];
  if (section === undefined) {
    throw new Error(
      "Python Canvas projection is missing its callable section.",
    );
  }
  return readCallableParameterRows(section);
}

// A reprojection hands the factory the exact records it wants back, because the workspace item ID
// is the canonical parameter ID and only the registered factory may propose one. An entry exists
// for exactly as long as one reprojection is inserting.
const reprojectedItems = new WeakMap<WorkspaceHost, Array<WorkspaceItem>>();

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
  reprojectedItems.set(
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
    reprojectedItems.delete(host);
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
  const callableDiagnosticMessages: Array<string> = [];
  const parameterDiagnostics: CallableSectionData["parameterDiagnostics"] = {};
  for (const diagnostic of snapshot.diagnostics) {
    if (diagnostic.targetId === callable.id) {
      callableDiagnosticMessages.push(diagnostic.message);
      continue;
    }
    if (
      diagnostic.targetId === null ||
      !parameterIds.has(diagnostic.targetId)
    ) {
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
    callableDiagnosticMessage:
      callableDiagnosticMessages.length === 0
        ? null
        : callableDiagnosticMessages.join("\n"),
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
  const generated = generatedPythonRegionText(snapshot);
  if (`${prefix}${generated}${suffix}` !== snapshot.generatedCode.code) {
    throw new Error(
      "Generated Python does not compose its canonical prefix, body, and suffix.",
    );
  }
  return generatedCodeSectionData(
    prefix,
    generated,
    suffix,
    projectDocumentDiagnostics(snapshot),
  );
}

// One place declares the range, so the authored regions and the range that separates them can
// never disagree about where the generated body starts and ends.
function generatedCodeSectionData(
  prefix: string,
  generated: string,
  suffix: string,
  diagnostics: ReadonlyArray<WorkspaceCodeSectionDiagnostic>,
) {
  const code = `${prefix}${generated}${suffix}`;
  return createWorkspaceCodeSectionData({
    code,
    diagnostics: [...diagnostics],
    generatedRegion: { from: prefix.length, to: code.length - suffix.length },
    language: "python",
    wrapLines: true,
    lineNumbers: true,
    indentWidth: 4,
    // The section is authored Python around a Go-owned body, so it selects the package's generic
    // generated-document presentation: an ordinary editor whose declared range refuses edits.
    mode: "generated-document",
  });
}

// The canonical contract carries UTF-8 byte offsets because Go and the provider
// own the generated document. CodeMirror indexes its JavaScript string in UTF-16
// code units, so targetless diagnostics cross that representation boundary once,
// as the snapshot is projected into package-owned code-section data.
function projectDocumentDiagnostics(
  snapshot: ProjectSnapshotV1,
): Array<WorkspaceCodeSectionDiagnostic> {
  return snapshot.diagnostics.flatMap((diagnostic) => {
    if (diagnostic.targetId !== null) {
      return [];
    }
    return [
      {
        from: utf8ByteOffsetToUtf16Offset(
          snapshot.generatedCode.code,
          diagnostic.start,
        ),
        to: utf8ByteOffsetToUtf16Offset(
          snapshot.generatedCode.code,
          diagnostic.end,
        ),
        message: diagnostic.message,
        severity: projectDiagnosticSeverity(diagnostic),
      },
    ];
  });
}

function utf8ByteOffsetToUtf16Offset(code: string, byteOffset: number): number {
  const encoder = new TextEncoder();
  let utf8Offset = 0;
  let utf16Offset = 0;
  if (byteOffset === 0) {
    return 0;
  }
  for (const character of code) {
    const nextUtf8Offset = utf8Offset + encoder.encode(character).length;
    if (byteOffset < nextUtf8Offset) {
      throw new Error("Document diagnostic offset is not a UTF-8 boundary.");
    }
    utf8Offset = nextUtf8Offset;
    utf16Offset += character.length;
    if (byteOffset === utf8Offset) {
      return utf16Offset;
    }
  }
  throw new Error("Document diagnostic offset exceeds generated Python.");
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
    severity: projectDiagnosticSeverity(diagnostic),
  };
}

function projectDiagnosticSeverity(
  diagnostic: DiagnosticV1,
): "error" | "warning" | "info" {
  return diagnostic.severity === DIAGNOSTIC_SEVERITY_INFORMATION_V1
    ? "info"
    : diagnostic.severity;
}
