import { readFileSync } from "node:fs";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceHost,
  deleteWorkspaceItems,
  getWorkspaceCodeSectionData,
  setWorkspaceCodeSectionData,
  type WorkspaceHost,
} from "@setta/workspace";
import { describe, expect, it, vi } from "vitest";

import { registerPythonCanvasSectionKinds } from "./PythonCanvasApp";
import { CALLABLE_SECTION_ID } from "../sections/CallableSection";
import {
  CALLABLE_SECTION_KIND,
  GENERATED_PYTHON_SECTION_ID,
  applyProjectSnapshotToWorkspace,
  generatedPythonRegionText,
  projectWorkspaceDocument,
  readCallableParameterItems,
  readGeneratedPythonTarget,
} from "./workspaceProjection";
import { readCallableSectionData } from "../sections/CallableSection";
import { parseProjectSnapshotV1 } from "../backend/runtimeContract";

// Every response this suite applies answers for the document it was proposed from unless the
// case says otherwise.
const KEEP_NOTHING = {
  keepAuthoredPython: false,
  keepParameterList: false,
} as const;

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
      // Parameter authoring is a structural item mutation the package refuses on a
      // locked section, so this card is an ordinary movable one.
      positionAndSizeLocked: false,
    });
    expect(readCallableSectionData(callable?.data)).toMatchObject({
      callable: {
        authoredExpression: snapshot.callables[0].authoredExpression,
        id: snapshot.callables[0].id,
        name: snapshot.callables[0].name,
      },
      callableDiagnosticMessage: null,
      parameterDiagnostics: {},
    });
    // An uncommitted callable has no parameters, so its list has no rows.
    expect(callable?.itemTree?.items).toEqual({
      "python-canvas:callable:parameter-root": {
        id: "python-canvas:callable:parameter-root",
        children: [],
      },
    });
    expect(generatedPython).toMatchObject({
      id: GENERATED_PYTHON_SECTION_ID,
      kind: WORKSPACE_CODE_SECTION_KIND,
      name: "Generated Python",
      // The prefix and suffix are authored here, and the package refuses every edit on a
      // locked section, so this card is an ordinary movable one too.
      positionAndSizeLocked: false,
      data: {
        code: snapshot.generatedCode.code,
        diagnostics: [],
        language: "python",
        mode: "generated-document",
        // Only the Go-owned body is generated: the region runs from the end of the target's
        // prefix to the start of its suffix, so `import math` and `state = SettaState()` stay on
        // the ordinary read-only surface.
        generatedRegion: {
          from: snapshot.pythonTarget.prefix.length,
          to:
            snapshot.generatedCode.code.length -
            snapshot.pythonTarget.suffix.length,
        },
      },
    });
    expect(projectWorkspaceDocument(snapshot)).toEqual(document);
  });

  it("projects the canonical parameter list as the item tree in canonical order", () => {
    const snapshot = snapshotWithParameters([
      providerParameter("missing_value"),
      authoredParameter("scale", "2"),
    ]);
    const callable =
      projectWorkspaceDocument(snapshot).sections[CALLABLE_SECTION_ID];

    // The item IDs are the canonical parameter IDs, in the canonical order.
    expect(
      callable?.itemTree?.items["python-canvas:callable:parameter-root"]
        ?.children,
    ).toEqual(["parameter:square-root:provider", "parameter:authored:scale"]);
    expect(callable?.itemTree?.items["parameter:authored:scale"]?.data).toEqual(
      {
        authoredExpression: "2",
        default: null,
        disabled: false,
        name: "scale",
        nameEditable: true,
      },
    );
    expect(
      readCallableSectionData(callable?.data).parameterDiagnostics,
    ).toEqual({
      "parameter:square-root:provider": [
        { message: 'Name "missing_value" is not defined', severity: "error" },
      ],
    });
  });

  it("partitions callable, parameter, and document diagnostics without duplicates", () => {
    const snapshot = snapshotWithAllDiagnosticPartitions();
    const document = projectWorkspaceDocument(snapshot);
    const callable = readCallableSectionData(
      document.sections[CALLABLE_SECTION_ID]?.data,
    );
    const generated = document.sections[GENERATED_PYTHON_SECTION_ID]?.data as {
      diagnostics: Array<unknown>;
    };
    const documentStart = snapshot.generatedCode.code.indexOf("math.sqrt");

    expect(callable.callableDiagnosticMessage).toBe(
      "Callable invocation is invalid.",
    );
    expect(callable.parameterDiagnostics).toEqual({
      "parameter:square-root:provider": [
        {
          message: "Parameter value is undefined.",
          severity: "warning",
        },
      ],
    });
    // The canonical bytes contain an astral character before this range. The
    // projected CodeMirror range is the matching UTF-16 position, and only the
    // targetless diagnostic reaches the document — neither semantic field copy
    // is also rendered inline.
    expect(generated.diagnostics).toEqual([
      {
        from: documentStart,
        message: "Generated document has an unresolved name.",
        severity: "error",
        to: documentStart + "math.sqrt".length,
      },
    ]);

    const host = createHostForTest(snapshot);
    applyProjectSnapshotToWorkspace(
      host,
      snapshotWithParameters([providerParameter("3")]),
      KEEP_NOTHING,
    );
    expect(
      readCallableSectionData(
        host.getSnapshot().sections[CALLABLE_SECTION_ID]?.data,
      ),
    ).toMatchObject({
      callableDiagnosticMessage: null,
      parameterDiagnostics: {},
    });
    expect(
      getWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID)
        .diagnostics,
    ).toEqual([]);
    host.dispose();
  });

  it("refuses generated Python that does not compose its canonical parts", () => {
    const snapshot = parseProjectSnapshotV1(projectSnapshotFixture);
    expect(() =>
      projectWorkspaceDocument({
        ...snapshot,
        pythonTarget: { ...snapshot.pythonTarget, suffix: "state = None" },
      }),
    ).toThrow(/does not compose its canonical prefix, body, and suffix/u);
  });

  it("refuses a response whose callable does not carry its own parameters", () => {
    const snapshot = snapshotWithParameters([providerParameter("3")]);
    expect(() =>
      projectWorkspaceDocument({
        ...snapshot,
        callables: [{ ...snapshot.callables[0], parameterIds: [] }],
      }),
    ).toThrow(/parameters its callable does not carry/u);
  });

  it("reconciles a canonical response through public mutations without reloading the host", () => {
    const initial = snapshotWithParameters([providerParameter("")]);
    const next = snapshotWithParameters([providerParameter("missing_value")]);
    const host = createHostForTest(initial);
    const loadDocument = vi.spyOn(host, "loadDocument");

    applyProjectSnapshotToWorkspace(host, next, KEEP_NOTHING);

    expect(loadDocument).not.toHaveBeenCalled();
    const callable = host.getSnapshot().sections[CALLABLE_SECTION_ID];
    expect(readCallableSectionData(callable?.data)).toMatchObject({
      callable: {
        authoredExpression: "math.sqrt",
        id: "callable:square-root",
      },
      parameterDiagnostics: {
        "parameter:square-root:provider": [
          { message: 'Name "missing_value" is not defined', severity: "error" },
        ],
      },
      providerStatus: { state: "ready", status: "available" },
    });
    expect(readCallableParameterItems(host.getSnapshot())).toEqual([
      {
        data: {
          authoredExpression: "missing_value",
          default: null,
          disabled: false,
          name: "x",
          nameEditable: false,
        },
        id: "parameter:square-root:provider",
      },
    ]);
    expect(
      host.getSnapshot().sections[GENERATED_PYTHON_SECTION_ID]?.data,
    ).toMatchObject({
      code: next.generatedCode.code,
      mode: "generated-document",
      generatedRegion: {
        from: next.pythonTarget.prefix.length,
        to: next.generatedCode.code.length - next.pythonTarget.suffix.length,
      },
    });

    host.dispose();
  });

  // A commit resolves a new signature, and a rejected proposal has to be put back: both arrive as
  // a canonical list this document does not hold, and both are rebuilt through the package's own
  // insertion and deletion funnels rather than by reloading the document.
  it("rebuilds the item tree when a canonical response reshapes the parameter list", () => {
    const initial = snapshotWithParameters([
      providerParameter(""),
      authoredParameter("scale", "2"),
    ]);
    const next = snapshotWithParameters([
      authoredParameter("offset", "1"),
      providerParameter("3"),
    ]);
    const host = createHostForTest(initial);
    const loadDocument = vi.spyOn(host, "loadDocument");

    applyProjectSnapshotToWorkspace(host, next, KEEP_NOTHING);

    expect(loadDocument).not.toHaveBeenCalled();
    expect(
      readCallableParameterItems(host.getSnapshot()).map((item) => [
        item.id,
        item.data.name,
      ]),
    ).toEqual([
      ["parameter:authored:offset", "offset"],
      ["parameter:square-root:provider", "x"],
    ]);

    host.dispose();
  });

  // A structural action runs in the package the moment it is clicked, so a response can arrive
  // for a list the document has already moved past. Rebuilding the canonical list over it would
  // throw away what the person last asked for, which is the defect the production walkthrough's
  // bulk deletion caught.
  it("leaves a document that moved past the response holding its own parameter list", () => {
    const initial = snapshotWithParameters([
      providerParameter(""),
      authoredParameter("scale", "2"),
    ]);
    const answered = snapshotWithParameters([
      providerParameter("3"),
      authoredParameter("scale", "2"),
    ]);
    const host = createHostForTest(initial);
    // The person deleted the authored row while the proposal above was in flight.
    deleteWorkspaceItems(host, CALLABLE_SECTION_ID, [
      "parameter:authored:scale",
    ]);

    applyProjectSnapshotToWorkspace(host, answered, {
      keepAuthoredPython: false,
      keepParameterList: true,
    });

    expect(
      readCallableParameterItems(host.getSnapshot()).map((item) => [
        item.id,
        item.data.authoredExpression,
      ]),
      // The deleted row stays deleted, and the surviving row still takes the project's own value.
    ).toEqual([["parameter:square-root:provider", "3"]]);

    host.dispose();
  });

  // The generated document is authored around its protected range, so the app reads the two outer
  // regions at the offsets the package mapped rather than by searching the text for the body.
  it("splits the authored Python at the package's own mapped range", () => {
    const snapshot = snapshotWithParameters([providerParameter("3")]);
    const host = createHostForTest(snapshot);

    expect(readGeneratedPythonTarget(host)).toEqual({
      generated: generatedPythonRegionText(snapshot),
      prefix: snapshot.pythonTarget.prefix,
      suffix: snapshot.pythonTarget.suffix,
    });

    // One accepted edit in the prefix, written the way the package writes it: the next text and
    // the range it mapped, together.
    const inserted = "\nimport os";
    const code =
      snapshot.pythonTarget.prefix +
      inserted +
      generatedPythonRegionText(snapshot) +
      snapshot.pythonTarget.suffix;
    setWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID, {
      ...getWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID),
      code,
      generatedRegion: {
        from: snapshot.pythonTarget.prefix.length + inserted.length,
        to: code.length - snapshot.pythonTarget.suffix.length,
      },
      mode: "generated-document",
    });

    expect(readGeneratedPythonTarget(host)).toEqual({
      generated: generatedPythonRegionText(snapshot),
      prefix: `${snapshot.pythonTarget.prefix}${inserted}`,
      suffix: snapshot.pythonTarget.suffix,
    });

    host.dispose();
  });

  // A keystroke in the generated document lands the moment it is typed, so a response can arrive
  // for authored Python the person has already moved past. Writing the canonical document over it
  // would take back what they just wrote — and leaving the whole document alone would keep a
  // generated body the store has already replaced.
  it("keeps the authored Python a document moved on to and still lands the response's body", () => {
    const held = snapshotWithAllDiagnosticPartitions();
    const host = createHostForTest(held);
    const typed = `${held.pythonTarget.prefix}\nimport os${generatedPythonRegionText(held)}${held.pythonTarget.suffix}`;
    setWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID, {
      ...getWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID),
      code: typed,
      generatedRegion: {
        from: held.pythonTarget.prefix.length + "\nimport os".length,
        to: typed.length - held.pythonTarget.suffix.length,
      },
      mode: "generated-document",
    });
    // The parameter mutation that was in flight while that line was typed.
    const answered = snapshotWithParameters([providerParameter("9")]);

    applyProjectSnapshotToWorkspace(host, answered, {
      keepAuthoredPython: true,
      keepParameterList: false,
    });

    expect(readGeneratedPythonTarget(host)).toEqual({
      generated: generatedPythonRegionText(answered),
      prefix: `${held.pythonTarget.prefix}\nimport os`,
      suffix: held.pythonTarget.suffix,
    });
    // The rest of the response still lands.
    expect(
      readCallableParameterItems(host.getSnapshot()).map(
        (item) => item.data.authoredExpression,
      ),
    ).toEqual(["9"]);
    // The retained prefix has shifted the snapshot's byte coordinates, so a
    // targetless diagnostic cannot be reused after this authoring race.
    expect(
      getWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID)
        .diagnostics,
    ).toEqual([]);

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

function createHostForTest(
  snapshot: ReturnType<typeof parseProjectSnapshotV1>,
): WorkspaceHost {
  const host = createWorkspaceHost();
  registerPythonCanvasSectionKinds(host);
  host.loadDocument(projectWorkspaceDocument(snapshot));
  return host;
}

function providerParameter(authoredExpression: string) {
  return {
    authoredExpression,
    default: null,
    id: "parameter:square-root:provider",
    name: "x",
    nameEditable: false,
    passingStyle: "positional_only",
    typeAnnotation: "float",
  };
}

function authoredParameter(name: string, authoredExpression: string) {
  return {
    authoredExpression,
    default: null,
    id: `parameter:authored:${name}`,
    name,
    nameEditable: true,
    passingStyle: "positional_or_keyword",
    typeAnnotation: "",
  };
}

// One committed `math.sqrt` project holding exactly the given ordered parameter list, with the
// generated document and diagnostic ranges the Go renderer would produce for it.
function snapshotWithParameters(
  parameters: Array<ReturnType<typeof providerParameter>>,
): ReturnType<typeof parseProjectSnapshotV1> {
  const assignments = parameters
    .filter((parameter) => parameter.authoredExpression !== "")
    .map(
      (parameter) =>
        `        state.Square_Root__${parameter.name} = ${parameter.authoredExpression}`,
    );
  const callArguments = parameters
    .filter((parameter) => parameter.authoredExpression !== "")
    .map((parameter) =>
      parameter.nameEditable
        ? `${parameter.name}=state.Square_Root__${parameter.name}`
        : `state.Square_Root__${parameter.name}`,
    );
  const body = [
    "class SettaState:",
    "    def __init__(state):",
    ...assignments,
    `        state.Square_Root = math.sqrt(${callArguments.join(", ")})`,
  ].join("\n");
  const code = `import math\n\n${body}\n\nstate = SettaState()`;
  const diagnosed = parameters.find(
    (parameter) => parameter.authoredExpression === "missing_value",
  );
  const diagnosedStart = code.indexOf("missing_value");

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
        parameterIds: parameters.map((parameter) => parameter.id),
      },
    ],
    parameters,
    generatedCode: {
      body,
      code,
      sourceRanges:
        diagnosed === undefined
          ? []
          : [
              {
                end: diagnosedStart + "missing_value".length,
                start: diagnosedStart,
                targetId: diagnosed.id,
              },
            ],
    },
    diagnostics:
      diagnosed === undefined
        ? []
        : [
            {
              end: diagnosedStart + "missing_value".length,
              id: `diagnostic:${diagnosed.id}:1`,
              message: 'Name "missing_value" is not defined',
              severity: "error",
              start: diagnosedStart,
              targetId: diagnosed.id,
            },
          ],
    providerStatus: {
      provider: "basedpyright",
      state: "ready",
      status: "available",
    },
  });
}

function snapshotWithAllDiagnosticPartitions(): ReturnType<
  typeof parseProjectSnapshotV1
> {
  const base = snapshotWithParameters([providerParameter("3")]);
  const unicodePrefix = "# 🐍\n";
  const code = `${unicodePrefix}${base.generatedCode.code}`;
  const callableStart = code.indexOf("math.sqrt");
  const parameterStart = code.indexOf("3");
  const toUtf8ByteOffset = (utf16Offset: number) =>
    new TextEncoder().encode(code.slice(0, utf16Offset)).length;

  return parseProjectSnapshotV1({
    ...base,
    pythonTarget: {
      ...base.pythonTarget,
      prefix: `${unicodePrefix}${base.pythonTarget.prefix}`,
    },
    generatedCode: {
      ...base.generatedCode,
      code,
    },
    diagnostics: [
      {
        end: toUtf8ByteOffset(callableStart + "math.sqrt".length),
        id: "diagnostic:callable",
        message: "Callable invocation is invalid.",
        severity: "error",
        start: toUtf8ByteOffset(callableStart),
        targetId: "callable:square-root",
      },
      {
        end: toUtf8ByteOffset(parameterStart + 1),
        id: "diagnostic:parameter",
        message: "Parameter value is undefined.",
        severity: "warning",
        start: toUtf8ByteOffset(parameterStart),
        targetId: "parameter:square-root:provider",
      },
      {
        end: toUtf8ByteOffset(callableStart + "math.sqrt".length),
        id: "diagnostic:document",
        message: "Generated document has an unresolved name.",
        severity: "error",
        start: toUtf8ByteOffset(callableStart),
        targetId: null,
      },
    ],
  });
}
