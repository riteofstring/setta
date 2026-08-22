import { readFileSync } from "node:fs";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceHost,
} from "@setta/workspace";
import { describe, expect, it, vi } from "vitest";

import { registerPythonCanvasSectionKinds } from "./PythonCanvasApp";
import {
  CALLABLE_SECTION_ID,
  CALLABLE_SECTION_KIND,
  GENERATED_PYTHON_SECTION_ID,
  applyProjectSnapshotToWorkspace,
  projectWorkspaceDocument,
} from "./workspaceProjection";
import {
  PARAMETER_ITEM_ID,
  readCallableSectionData,
  readParameterItemData,
} from "../sections/CallableSection";
import { parseProjectSnapshotV1 } from "../backend/runtimeContract";

describe("Python Canvas workspace projection", () => {
  it("creates the deterministic initial two-section document", () => {
    const snapshot = parseProjectSnapshotV1(projectSnapshotFixture);
    const document = projectWorkspaceDocument(snapshot);
    const callable = document.sections[CALLABLE_SECTION_ID];
    const generatedPython = document.sections[GENERATED_PYTHON_SECTION_ID];

    expect(Object.keys(document.sections)).toEqual([
      CALLABLE_SECTION_ID,
      GENERATED_PYTHON_SECTION_ID,
    ]);
    expect(callable).toMatchObject({
      id: CALLABLE_SECTION_ID,
      kind: CALLABLE_SECTION_KIND,
      name: snapshot.callables[0].name,
      positionAndSizeLocked: true,
    });
    expect(readCallableSectionData(callable?.data)).toMatchObject({
      callable: {
        authoredExpression: snapshot.callables[0].authoredExpression,
        id: snapshot.callables[0].id,
        name: snapshot.callables[0].name,
      },
      hasParameter: false,
      parameterDiagnostics: [],
    });
    expect(
      readParameterItemData(
        callable?.itemTree?.items[PARAMETER_ITEM_ID]?.data,
      ),
    ).toEqual({ kind: "empty" });
    expect(generatedPython).toMatchObject({
      id: GENERATED_PYTHON_SECTION_ID,
      kind: WORKSPACE_CODE_SECTION_KIND,
      name: "Generated Python",
      positionAndSizeLocked: true,
      data: {
        code: snapshot.generatedCode.code,
        language: "python",
        readOnly: true,
      },
    });
    expect(projectWorkspaceDocument(snapshot)).toEqual(document);
  });

  it("reconciles a canonical response through public mutations without reloading the host", () => {
    const initial = parseProjectSnapshotV1(projectSnapshotFixture);
    const next = snapshotWithMappedDiagnostic();
    const host = createWorkspaceHost();
    const loadDocument = vi.spyOn(host, "loadDocument");
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(initial));

    applyProjectSnapshotToWorkspace(host, next);

    expect(loadDocument).toHaveBeenCalledTimes(1);
    const callable = host.getSnapshot().sections[CALLABLE_SECTION_ID];
    expect(readCallableSectionData(callable?.data)).toMatchObject({
      callable: {
        authoredExpression: "math.sqrt",
        id: "callable:square-root",
      },
      hasParameter: true,
      parameterDiagnostics: [
        { message: 'Name "missing_value" is not defined', severity: "error" },
      ],
      providerStatus: { state: "ready", status: "available" },
    });
    expect(
      readParameterItemData(
        callable?.itemTree?.items[PARAMETER_ITEM_ID]?.data,
      ),
    ).toMatchObject({
      authoredExpression: "missing_value",
      kind: "parameter",
      name: "x",
      parameterId: "parameter:square-root:1",
      passingStyle: "positional_only",
    });
    expect(
      host.getSnapshot().sections[GENERATED_PYTHON_SECTION_ID]?.data,
    ).toMatchObject({ code: next.generatedCode.code, readOnly: true });

    host.dispose();
  });

  it("uses only public workspace package entries", () => {
    const sourcePaths = [
      "src/app/workspaceProjection.ts",
      "src/app/PythonCanvasApp.tsx",
      "src/sections/CallableSection.tsx",
      "src/main.tsx",
    ];

    for (const sourcePath of sourcePaths) {
      const source = readFileSync(sourcePath, "utf8");
      const workspaceImports = [
        ...source.matchAll(
          /(?:from\s+|import\s*)["'](@setta\/workspace[^"']*)["']/g,
        ),
      ].map((match) => match[1]);

      expect(
        workspaceImports.every(
          (specifier) =>
            specifier === "@setta/workspace" ||
            specifier === "@setta/workspace/styles.css",
        ),
      ).toBe(true);
    }
  });
});

function snapshotWithMappedDiagnostic() {
  const code = `import math

class SettaState:
    def __init__(state):
        state.Square_Root__x = missing_value
        state.Square_Root = math.sqrt(state.Square_Root__x)

state = SettaState()`;
  const parameterStart = code.indexOf("missing_value");
  return parseProjectSnapshotV1({
    version: "v1",
    project: { id: "project:python-canvas", revision: 3 },
    pythonTarget: {
      prefix: "import math",
      suffix: "state = SettaState()",
    },
    callables: [
      {
        authoredExpression: "math.sqrt",
        id: "callable:square-root",
        name: "Square Root",
        parameterIds: ["parameter:square-root:1"],
      },
    ],
    parameters: [
      {
        authoredExpression: "missing_value",
        default: null,
        id: "parameter:square-root:1",
        name: "x",
        passingStyle: "positional_only",
        typeAnnotation: "float",
      },
    ],
    generatedCode: {
      body: code.slice("import math\n\n".length, -"\n\nstate = SettaState()".length),
      code,
      sourceRanges: [
        {
          end: parameterStart + "missing_value".length,
          start: parameterStart,
          targetId: "parameter:square-root:1",
        },
      ],
    },
    diagnostics: [
      {
        id: "diagnostic:parameter:square-root:1:1",
        message: 'Name "missing_value" is not defined',
        severity: "error",
        targetId: "parameter:square-root:1",
      },
    ],
    providerStatus: {
      provider: "basedpyright",
      state: "ready",
      status: "available",
    },
  });
}
