import {
  WORKSPACE_CODE_SECTION_KIND,
  commitWorkspaceDocument,
  createWorkspaceCodeSectionData,
  getWorkspaceCodeSectionData,
  setItemData,
  type WorkspaceCodeSectionDiagnostic,
  type WorkspaceDocument,
  type WorkspaceHost,
  type WorkspaceItem,
  type WorkspaceItemDiagnostic,
  type WorkspaceSection,
  type WorkspaceSectionItemTree,
} from "@setta/workspace";

import {
  DIAGNOSTIC_SEVERITY_INFORMATION_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
  type CallableV2,
  type DiagnosticV2,
  type ParameterV2,
  type ProjectSnapshotV2,
} from "../backend/generatedContract";
import {
  type CallableSectionData,
  type ParameterItemData,
  readParameterItemData,
} from "../sections/CallableSection";

export const CALLABLE_SECTION_KIND = "python-canvas.callable" as const;
export const GENERATED_PYTHON_SECTION_ID =
  "python-canvas:generated-python" as const;

export const CALLABLE_SECTION_SIZE = { width: 360, height: 300 } as const;
export const GENERATED_PYTHON_SECTION_SIZE = {
  width: 640,
  height: 420,
} as const;

const generatedCodeSeparator = "\n\n";

export function callableSectionID(callableId: string): string {
  return `python-canvas:callable:${callableId}`;
}

function parameterItemRootID(callableId: string): string {
  return `${callableSectionID(callableId)}:parameter-root`;
}

export type ProjectSnapshotProjectionOptions = Readonly<{
  keepAuthoredPython: boolean;
  keepParameterLists: ReadonlySet<string>;
  reenableRetainedParameterLists: ReadonlySet<string>;
}>;

export function projectWorkspaceDocument(
  snapshot: ProjectSnapshotV2,
): WorkspaceDocument {
  const sections: WorkspaceDocument["sections"] = {
    [GENERATED_PYTHON_SECTION_ID]: projectGeneratedPythonSection(snapshot),
  };
  const topLevelSections: WorkspaceDocument["topLevelSections"] = {
    [GENERATED_PYTHON_SECTION_ID]: generatedPythonLayout(
      snapshot.callables.length,
    ),
  };

  for (const [index, callable] of snapshot.callables.entries()) {
    const sectionId = callableSectionID(callable.id);
    sections[sectionId] = projectCallableSection(snapshot, callable);
    topLevelSections[sectionId] = callableLayout(index);
  }

  return {
    sections,
    topLevelSections,
    viewport: null,
    activeIds: [],
  };
}

// Applies a complete canonical snapshot in one workspace transaction. Section
// and item identities come from the current callable IDs, while canvas geometry
// remains a transient workspace concern and is retained when that exact section
// survives a response.
export function applyProjectSnapshotToWorkspace(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV2,
  options: ProjectSnapshotProjectionOptions,
): void {
  const current = host.getSnapshot();
  const projected = projectWorkspaceDocument(snapshot);
  const projectedCallables = projectCallableSections(
    current,
    projected,
    snapshot,
    options,
  );
  const projectedGenerated = projectGeneratedSection(
    current,
    projected,
    snapshot,
    options,
    host,
  );
  const sections: WorkspaceDocument["sections"] = {
    ...projectedCallables.sections,
    [GENERATED_PYTHON_SECTION_ID]: projectedGenerated.section,
  };
  const topLevelSections: WorkspaceDocument["topLevelSections"] = {
    ...projectedCallables.topLevelSections,
    [GENERATED_PYTHON_SECTION_ID]: projectedGenerated.layout,
  };

  commitWorkspaceDocument(host, {
    ...current,
    sections,
    topLevelSections,
    activeIds: current.activeIds.filter((id) => sections[id] !== undefined),
  });
}

function projectCallableSections(
  current: WorkspaceDocument,
  projected: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
  options: ProjectSnapshotProjectionOptions,
): Pick<WorkspaceDocument, "sections" | "topLevelSections"> {
  const sections: WorkspaceDocument["sections"] = {};
  const topLevelSections: WorkspaceDocument["topLevelSections"] = {};
  for (const [index, callable] of snapshot.callables.entries()) {
    const sectionId = callableSectionID(callable.id);
    const next = requireProjectedSection(projected, sectionId);
    sections[sectionId] = projectCallableResponseSection(
      current.sections[sectionId],
      next,
      callable,
      options,
    );
    topLevelSections[sectionId] =
      current.topLevelSections[sectionId] ??
      projected.topLevelSections[sectionId] ??
      callableLayout(index);
  }
  return { sections, topLevelSections };
}

function requireProjectedSection(
  projected: WorkspaceDocument,
  sectionId: string,
): WorkspaceSection {
  const section = projected.sections[sectionId];
  if (section === undefined) {
    throw new Error(`Python Canvas projection is missing ${sectionId}.`);
  }
  return section;
}

function projectCallableResponseSection(
  previous: WorkspaceSection | undefined,
  next: WorkspaceSection,
  callable: CallableV2,
  options: ProjectSnapshotProjectionOptions,
): WorkspaceSection {
  if (previous === undefined) {
    return next;
  }
  return {
    ...next,
    itemTree: projectCallableItemTree(previous.itemTree, callable, options),
  };
}

function projectCallableItemTree(
  previous: WorkspaceSectionItemTree | undefined,
  callable: CallableV2,
  options: ProjectSnapshotProjectionOptions,
): WorkspaceSectionItemTree {
  if (previous !== undefined && options.keepParameterLists.has(callable.id)) {
    return projectRetainedParameterItems(
      previous,
      options.reenableRetainedParameterLists.has(callable.id),
    );
  }
  return projectCanonicalParameterItems(previous, callable);
}

function projectGeneratedSection(
  current: WorkspaceDocument,
  projected: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
  options: ProjectSnapshotProjectionOptions,
  host: WorkspaceHost,
): {
  layout: WorkspaceDocument["topLevelSections"][string];
  section: WorkspaceSection;
} {
  const next = requireProjectedSection(projected, GENERATED_PYTHON_SECTION_ID);
  const previous = current.sections[GENERATED_PYTHON_SECTION_ID];
  const section =
    previous === undefined
      ? next
      : {
          ...next,
          data: options.keepAuthoredPython
            ? retainedGeneratedCodeData(host, snapshot)
            : next.data,
        };
  return {
    layout:
      current.topLevelSections[GENERATED_PYTHON_SECTION_ID] ??
      projected.topLevelSections[GENERATED_PYTHON_SECTION_ID] ??
      generatedPythonLayout(snapshot.callables.length),
    section,
  };
}

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
  const beforeBody = data.code.slice(0, from);
  const afterBody = data.code.slice(to);
  if (
    !beforeBody.endsWith(generatedCodeSeparator) ||
    !afterBody.startsWith(generatedCodeSeparator)
  ) {
    throw new Error("Generated Python separators are not canonical.");
  }
  return {
    generated: data.code.slice(from, to),
    prefix: beforeBody.slice(0, -generatedCodeSeparator.length),
    suffix: afterBody.slice(generatedCodeSeparator.length),
  };
}

export function setParameterItemsDisabled(
  host: WorkspaceHost,
  callableId: string,
  disabled: boolean,
): void {
  const sectionId = callableSectionID(callableId);
  for (const item of readCallableParameterItems(
    host.getSnapshot(),
    callableId,
  )) {
    if (item.data.disabled !== disabled) {
      setItemData(host, sectionId, item.id, { ...item.data, disabled });
    }
  }
}

export function setParameterItemExpression(
  host: WorkspaceHost,
  callableId: string,
  parameterId: string,
  authoredExpression: string,
): void {
  updateParameterItem(host, callableId, parameterId, (data) =>
    data.authoredExpression === authoredExpression
      ? null
      : { ...data, authoredExpression },
  );
}

export function setParameterItemName(
  host: WorkspaceHost,
  callableId: string,
  parameterId: string,
  name: string,
): void {
  updateParameterItem(host, callableId, parameterId, (data) =>
    data.name === name ? null : { ...data, name },
  );
}

export function createCallableParameterItem(): WorkspaceItem {
  return {
    id: `parameter:authored:${crypto.randomUUID()}`,
    children: [],
    data: {
      authoredExpression: "",
      default: null,
      disabled: false,
      name: "",
      nameEditable: true,
      passingStyle: PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
      providerOrdinal: null,
      typeAnnotation: null,
    } satisfies ParameterItemData,
  };
}

export function readCallableParameterRows(
  section: WorkspaceSection,
): Array<{ data: ParameterItemData; id: string }> {
  const itemTree = section.itemTree;
  if (itemTree === undefined) {
    throw new Error("The Python Canvas callable section has no item tree.");
  }
  const root = itemTree.items[itemTree.rootId];
  if (root === undefined) {
    throw new Error("The Python Canvas callable parameter root is missing.");
  }
  return root.children.map((itemId) => {
    const item = itemTree.items[itemId];
    if (item === undefined) {
      throw new Error(`Python Canvas parameter item ${itemId} is missing.`);
    }
    return { data: readParameterItemData(item.data), id: itemId };
  });
}

export function readCallableParameterItems(
  document: WorkspaceDocument,
  callableId: string,
): Array<{ data: ParameterItemData; id: string }> {
  const section = document.sections[callableSectionID(callableId)];
  if (section === undefined) {
    throw new Error(`Python Canvas callable ${callableId} is missing.`);
  }
  return readCallableParameterRows(section);
}

function projectCallableSection(
  snapshot: ProjectSnapshotV2,
  callable: CallableV2,
): WorkspaceSection {
  const sectionId = callableSectionID(callable.id);
  return {
    id: sectionId,
    kind: CALLABLE_SECTION_KIND,
    name: callable.name,
    size: CALLABLE_SECTION_SIZE,
    overflowMode: false,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    data: projectCallableSectionData(snapshot, callable),
    itemTree: projectCanonicalParameterItems(undefined, callable),
  };
}

function projectGeneratedPythonSection(
  snapshot: ProjectSnapshotV2,
): WorkspaceSection {
  return {
    id: GENERATED_PYTHON_SECTION_ID,
    kind: WORKSPACE_CODE_SECTION_KIND,
    name: "Generated Python",
    size: GENERATED_PYTHON_SECTION_SIZE,
    overflowMode: false,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    data: projectGeneratedCodeData(snapshot),
  };
}

function projectRetainedParameterItems(
  itemTree: WorkspaceSectionItemTree,
  reenable: boolean,
): WorkspaceSectionItemTree {
  // A retained list is a local whole-list proposal, not a partial merge. A
  // response for another mutation must not replace a name, expression, order,
  // selection, or app-authored row while this callable still has a draft.
  if (!reenable) {
    return itemTree;
  }
  const root = itemTree.items[itemTree.rootId];
  if (root === undefined) {
    return itemTree;
  }
  const parameterIDs = new Set(root.children);
  const items: Record<string, WorkspaceItem> = {};
  for (const [itemID, item] of Object.entries(itemTree.items)) {
    if (!parameterIDs.has(itemID)) {
      items[itemID] = item;
      continue;
    }
    items[itemID] = {
      ...item,
      data: { ...readParameterItemData(item.data), disabled: false },
    };
  }
  return { ...itemTree, items };
}

function projectCanonicalParameterItems(
  previous: WorkspaceSectionItemTree | undefined,
  callable: CallableV2,
): WorkspaceSectionItemTree {
  const rootId = parameterItemRootID(callable.id);
  const ids = callable.parameters.map((parameter) => parameter.id);
  const items: Record<string, WorkspaceItem> = {
    [rootId]: { id: rootId, children: ids },
  };
  for (const parameter of callable.parameters) {
    items[parameter.id] = {
      id: parameter.id,
      children: [],
      data: projectParameterItemData(parameter),
    };
  }
  return {
    rootId,
    items,
    selectedItemIds:
      previous?.selectedItemIds.filter((id) => ids.includes(id)) ?? [],
  };
}

function updateParameterItem(
  host: WorkspaceHost,
  callableId: string,
  parameterId: string,
  next: (data: ParameterItemData) => ParameterItemData | null,
): void {
  const current = readCallableParameterItems(
    host.getSnapshot(),
    callableId,
  ).find((item) => item.id === parameterId);
  if (current === undefined) {
    return;
  }
  const data = next(current.data);
  if (data !== null) {
    setItemData(host, callableSectionID(callableId), parameterId, data);
  }
}

function projectCallableSectionData(
  snapshot: ProjectSnapshotV2,
  callable: CallableV2,
): CallableSectionData {
  const parameterIds = new Set(
    callable.parameters.map((parameter) => parameter.id),
  );
  const callableMessages: string[] = [];
  const parameterDiagnostics: CallableSectionData["parameterDiagnostics"] = {};
  for (const diagnostic of snapshot.diagnostics) {
    if (diagnostic.targetId === callable.id) {
      callableMessages.push(diagnostic.message);
    } else if (
      diagnostic.targetId !== null &&
      parameterIds.has(diagnostic.targetId)
    ) {
      parameterDiagnostics[diagnostic.targetId] = [
        ...(parameterDiagnostics[diagnostic.targetId] ?? []),
        projectParameterDiagnostic(diagnostic),
      ];
    }
  }
  return {
    callable: {
      authoredExpression: callable.authoredExpression,
      id: callable.id,
      name: callable.name,
    },
    callableDiagnosticMessage:
      callableMessages.length === 0 ? null : callableMessages.join("\n"),
    parameterDiagnostics,
    providerStatus: snapshot.providerStatus,
  };
}

function projectParameterItemData(parameter: ParameterV2): ParameterItemData {
  return {
    authoredExpression: parameter.authoredExpression,
    default: parameter.default,
    disabled: false,
    name: parameter.name,
    nameEditable: parameter.nameEditable,
    passingStyle: parameter.passingStyle,
    providerOrdinal: parameter.providerOrdinal,
    typeAnnotation: parameter.typeAnnotation,
  };
}

function projectGeneratedCodeData(snapshot: ProjectSnapshotV2) {
  const { prefix, suffix } = snapshot.pythonTarget;
  const { body, code, generatedBodyRange } = snapshot.generatedCode;
  const expected = `${prefix}${generatedCodeSeparator}${body}${generatedCodeSeparator}${suffix}`;
  if (code !== expected) {
    throw new Error(
      "Generated Python does not compose its canonical target and body.",
    );
  }
  return generatedCodeSectionData({
    body,
    diagnostics: projectDocumentDiagnostics(snapshot),
    generatedBodyRange,
    prefix,
    suffix,
  });
}

function retainedGeneratedCodeData(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV2,
) {
  const { prefix, suffix } = readGeneratedPythonTarget(host);
  return generatedCodeSectionData({
    body: snapshot.generatedCode.body,
    diagnostics: [],
    prefix,
    suffix,
  });
}

function generatedCodeSectionData({
  body,
  diagnostics,
  generatedBodyRange,
  prefix,
  suffix,
}: {
  body: string;
  diagnostics: ReadonlyArray<WorkspaceCodeSectionDiagnostic>;
  generatedBodyRange?: { end: number; start: number };
  prefix: string;
  suffix: string;
}) {
  const bodyStartBytes =
    generatedBodyRange?.start ??
    utf8ByteLength(prefix) + generatedCodeSeparator.length;
  const bodyEndBytes =
    generatedBodyRange?.end ?? bodyStartBytes + utf8ByteLength(body);
  const code = `${prefix}${generatedCodeSeparator}${body}${generatedCodeSeparator}${suffix}`;
  return createWorkspaceCodeSectionData({
    code,
    diagnostics: [...diagnostics],
    generatedRegion: {
      from: utf8ByteOffsetToUtf16Offset(code, bodyStartBytes),
      to: utf8ByteOffsetToUtf16Offset(code, bodyEndBytes),
    },
    indentWidth: 4,
    language: "python",
    lineNumbers: true,
    mode: "generated-document",
    wrapLines: true,
  });
}

function projectDocumentDiagnostics(
  snapshot: ProjectSnapshotV2,
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
        severity:
          diagnostic.severity === DIAGNOSTIC_SEVERITY_INFORMATION_V2
            ? "info"
            : diagnostic.severity,
      },
    ];
  });
}

function projectParameterDiagnostic(
  diagnostic: DiagnosticV2,
): WorkspaceItemDiagnostic {
  return {
    message: diagnostic.message,
    severity:
      diagnostic.severity === DIAGNOSTIC_SEVERITY_INFORMATION_V2
        ? "info"
        : diagnostic.severity,
  };
}

function callableLayout(index: number) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: column * (CALLABLE_SECTION_SIZE.width + 32),
    y: row * (CALLABLE_SECTION_SIZE.height + 32),
    w: CALLABLE_SECTION_SIZE.width,
    h: CALLABLE_SECTION_SIZE.height,
    zIndex: index,
  };
}

function generatedPythonLayout(callableCount: number) {
  const rows = Math.max(1, Math.ceil(callableCount / 2));
  return {
    x: 0,
    y: rows * (CALLABLE_SECTION_SIZE.height + 48),
    w: GENERATED_PYTHON_SECTION_SIZE.width,
    h: GENERATED_PYTHON_SECTION_SIZE.height,
    zIndex: callableCount,
  };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
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
      throw new Error("Document offset is not a UTF-8 boundary.");
    }
    utf8Offset = nextUtf8Offset;
    utf16Offset += character.length;
    if (byteOffset === utf8Offset) {
      return utf16Offset;
    }
  }
  throw new Error("Document offset exceeds generated Python.");
}
