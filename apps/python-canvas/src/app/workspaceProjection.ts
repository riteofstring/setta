import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSectionData,
  setItemData,
  setSectionData,
  setWorkspaceCodeSectionData,
  type WorkspaceDocumentInput,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  DIAGNOSTIC_SEVERITY_INFORMATION_V1,
  type DiagnosticV1,
  type ParameterV1,
  type ProjectSnapshotV1,
} from "../backend/generatedContract";
import {
  CALLABLE_SECTION_ID,
  PARAMETER_ITEM_ID,
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
        positionAndSizeLocked: true,
        isHorizontalOrientation: false,
        styleColor: null,
        tagColor: null,
        children: [],
        data: projectCallableSectionData(snapshot),
        itemTree: {
          rootId: PARAMETER_ITEM_ROOT_ID,
          items: {
            [PARAMETER_ITEM_ROOT_ID]: {
              id: PARAMETER_ITEM_ROOT_ID,
              children: [PARAMETER_ITEM_ID],
            },
            [PARAMETER_ITEM_ID]: {
              id: PARAMETER_ITEM_ID,
              children: [],
              data: projectParameterItemData(snapshot),
            },
          },
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

// Applies one canonical Go response through the workspace public mutation
// seams. The stable parameter slot is only a rendering vessel for this fixed
// one-parameter slice; its application-owned data carries the backend ID and
// never becomes a second semantic project model.
export function applyProjectSnapshotToWorkspace(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV1,
): void {
  setSectionData(
    host,
    CALLABLE_SECTION_ID,
    projectCallableSectionData(snapshot),
  );
  setItemData(
    host,
    CALLABLE_SECTION_ID,
    PARAMETER_ITEM_ID,
    projectParameterItemData(snapshot),
  );
  setWorkspaceCodeSectionData(
    host,
    GENERATED_PYTHON_SECTION_ID,
    projectGeneratedCodeData(snapshot),
  );
}

export function setParameterItemDisabled(
  host: WorkspaceHost,
  disabled: boolean,
): void {
  const data = readCurrentParameterItemData(host);
  if (data.kind === "empty" || data.disabled === disabled) {
    return;
  }
  setItemData(host, CALLABLE_SECTION_ID, PARAMETER_ITEM_ID, {
    ...data,
    disabled,
  });
}

export function setParameterItemExpression(
  host: WorkspaceHost,
  parameterID: string,
  authoredExpression: string,
): void {
  const data = readCurrentParameterItemData(host);
  if (data.kind === "empty" || data.parameterId !== parameterID) {
    return;
  }
  if (data.authoredExpression === authoredExpression) {
    return;
  }
  setItemData(host, CALLABLE_SECTION_ID, PARAMETER_ITEM_ID, {
    ...data,
    authoredExpression,
  });
}

function projectCallableSectionData(
  snapshot: ProjectSnapshotV1,
): CallableSectionData {
  const callable = getCallable(snapshot);
  const parameter = getCallableParameter(snapshot);
  return {
    callable: {
      authoredExpression: callable.authoredExpression,
      id: callable.id,
      name: callable.name,
    },
    hasParameter: parameter !== null,
    parameterDiagnostics:
      parameter === null
        ? []
        : snapshot.diagnostics
            .filter((diagnostic) => diagnostic.targetId === parameter.id)
            .map(projectParameterDiagnostic),
    providerStatus: {
      provider: snapshot.providerStatus.provider,
      status: snapshot.providerStatus.status,
      state: snapshot.providerStatus.state,
    },
  };
}

function readCurrentParameterItemData(host: WorkspaceHost): ParameterItemData {
  const item =
    host.getSnapshot().sections[CALLABLE_SECTION_ID]?.itemTree?.items[
      PARAMETER_ITEM_ID
    ];
  if (item === undefined) {
    throw new Error("Python Canvas projection is missing its parameter item.");
  }
  return readParameterItemData(item.data);
}

function projectParameterItemData(
  snapshot: ProjectSnapshotV1,
): ParameterItemData {
  const parameter = getCallableParameter(snapshot);
  if (parameter === null) {
    return { kind: "empty" };
  }
  // The row is main's ordinary text parameter, so it is projected the name, the authored value, and
  // the real default. The canonical passing style and type annotation stay where code generation
  // and diagnostics read them rather than becoming permanent row copy.
  return {
    authoredExpression: parameter.authoredExpression,
    default: parameter.default,
    disabled: false,
    kind: "parameter",
    name: parameter.name,
    parameterId: parameter.id,
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

function getCallableParameter(snapshot: ProjectSnapshotV1): ParameterV1 | null {
  const callable = getCallable(snapshot);
  if (callable.parameterIds.length === 0) {
    if (snapshot.parameters.length !== 0) {
      throw new Error(
        "Project snapshot has parameters without a callable dependency.",
      );
    }
    return null;
  }
  if (callable.parameterIds.length !== 1 || snapshot.parameters.length !== 1) {
    throw new Error(
      "Project snapshot exceeds the one-parameter Python Canvas boundary.",
    );
  }
  const parameter = snapshot.parameters[0];
  if (parameter === undefined || parameter.id !== callable.parameterIds[0]) {
    throw new Error(
      "Project snapshot callable parameter does not match its parameter record.",
    );
  }
  return parameter;
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
