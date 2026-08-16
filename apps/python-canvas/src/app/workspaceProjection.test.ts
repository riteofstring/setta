import { readFileSync } from "node:fs";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceHost,
} from "@setta/workspace";
import { describe, expect, it } from "vitest";

import { registerPythonCanvasSectionKinds } from "./PythonCanvasApp";
import {
  CALLABLE_SECTION_ID,
  CALLABLE_SECTION_KIND,
  GENERATED_PYTHON_SECTION_ID,
  projectWorkspaceDocument,
} from "./workspaceProjection";
import { parseProjectSnapshotV1 } from "../backend/runtimeContract";

describe("projectWorkspaceDocument", () => {
  it("creates the deterministic two-section read-only workspace document", () => {
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
      data: {
        callable: {
          id: snapshot.callables[0].id,
          name: snapshot.callables[0].name,
          authoredExpression: snapshot.callables[0].authoredExpression,
        },
      },
    });
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

    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    expect(() => host.loadDocument(document)).not.toThrow();
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
