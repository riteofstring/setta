import { describe, expect, it } from "vitest";
import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceHost,
  type WorkspaceCodeSectionData,
} from "@setta/workspace";

import type {
  Project,
  RuntimeSourceDocument,
} from "../backend/generatedContract";
import { makeProject } from "../testProject";
import {
  createRealtimeSectionKinds,
  registerRealtimeSectionKinds,
} from "./realtimeSectionKinds";
import {
  projectWorkspaceDocument,
  replaceSectionDataOperation,
  workspaceDocumentOperations,
} from "./projectProjection";

function withCodeSection(project: Project): Project {
  return {
    ...project,
    layout: {
      ...project.layout,
      topLevelSections: {
        ...project.layout.topLevelSections,
        "code-main": { height: 420, width: 560, x: 940, y: 24, zIndex: 3 },
      },
    },
    sections: {
      ...project.sections,
      "code-main": {
        children: [],
        data: { source: "entrypoint" },
        height: 420,
        id: "code-main",
        isHorizontalOrientation: false,
        kind: "code",
        name: "main.py",
        overflowMode: false,
        positionAndSizeLocked: false,
        styleColor: null,
        tagColor: null,
        width: 560,
      },
    },
  };
}

function makeRuntimeSource(source = "value = 1\n"): RuntimeSourceDocument {
  return {
    entrypoint: "main.py",
    projectId: "project-main",
    source,
    version: "a".repeat(64),
  };
}

describe("project workspace projection", () => {
  it("projects one complete canonical project without local fragments", () => {
    const project = makeProject();
    const document = projectWorkspaceDocument(project);

    expect(Object.keys(document.sections)).toEqual(
      Object.keys(project.sections),
    );
    expect(document.sections["input-main"]?.data).toEqual(
      project.sections["input-main"]?.data,
    );
    expect(document.topLevelSections["drawing-main"]).toEqual({
      h: 360,
      w: 520,
      x: 24,
      y: 168,
      zIndex: 2,
    });
    expect(workspaceDocumentOperations(project, document)).toEqual([]);

    const host = createWorkspaceHost();
    registerRealtimeSectionKinds(host, createRealtimeSectionKinds());
    host.loadDocument(document);
    expect(host.getSnapshot()).toEqual(document);
    host.dispose();
  });

  it("converts an authored workspace change into one optimistic operation", () => {
    const project = makeProject();
    const document = projectWorkspaceDocument(project);
    document.sections["input-main"]!.name = "Request";
    document.topLevelSections["input-main"]!.x = 360;

    expect(workspaceDocumentOperations(project, document)).toEqual([
      {
        layout: { height: 128, width: 300, x: 360, y: 24, zIndex: 1 },
        op: "upsertSection",
        section: {
          ...project.sections["input-main"],
          name: "Request",
        },
      },
    ]);
  });

  it("persists the authored viewport", () => {
    const project = makeProject();
    const document = projectWorkspaceDocument(project);
    document.viewport = { x: 120, y: 80, zoom: 1.5 };

    expect(workspaceDocumentOperations(project, document)).toEqual([
      { op: "setViewport", viewport: { x: 120, y: 80, zoom: 1.5 } },
    ]);
  });

  it("retains Workspace-owned selection and minimization across snapshots", () => {
    const project = makeProject();
    const previous = projectWorkspaceDocument(project);
    previous.activeIds = ["drawing-main", "removed-section"];
    previous.sections["drawing-main"]!.isMinimized = true;

    const next = projectWorkspaceDocument(
      {
        ...project,
        revision: project.revision + 1,
      },
      previous,
    );

    expect(next.activeIds).toEqual(["drawing-main"]);
    expect(next.sections["drawing-main"]?.isMinimized).toBe(true);
    expect(workspaceDocumentOperations(project, next)).toEqual([]);
  });

  it("projects entrypoint source into the native editable Python section", () => {
    const project = withCodeSection(makeProject());
    const document = projectWorkspaceDocument(
      project,
      undefined,
      makeRuntimeSource(),
      false,
    );
    const code = document.sections["code-main"];

    expect(code?.kind).toBe(WORKSPACE_CODE_SECTION_KIND);
    expect(code?.data).toMatchObject({
      code: "value = 1\n",
      language: "python",
      mode: "editable",
    });
    expect(workspaceDocumentOperations(project, document)).toEqual([]);
  });

  it("keeps a dirty source draft across project snapshots", () => {
    const project = withCodeSection(makeProject());
    const source = makeRuntimeSource();
    const previous = projectWorkspaceDocument(
      project,
      undefined,
      source,
      false,
    );
    (previous.sections["code-main"]!.data as WorkspaceCodeSectionData).code =
      "value = 2\n";

    const next = projectWorkspaceDocument(
      { ...project, revision: project.revision + 1 },
      previous,
      source,
    );

    expect(
      (next.sections["code-main"]!.data as WorkspaceCodeSectionData).code,
    ).toBe("value = 2\n");
    expect(workspaceDocumentOperations(project, next)).toEqual([]);
  });

  it("replaces a disposable draft when a source target is projected", () => {
    const project = withCodeSection(makeProject());
    const previous = projectWorkspaceDocument(
      project,
      undefined,
      makeRuntimeSource("old\n"),
      false,
    );
    (previous.sections["code-main"]!.data as WorkspaceCodeSectionData).code =
      "draft\n";

    const next = projectWorkspaceDocument(
      project,
      previous,
      makeRuntimeSource("new\n"),
      false,
    );
    expect(
      (next.sections["code-main"]!.data as WorkspaceCodeSectionData).code,
    ).toBe("new\n");
  });

  it("persists code layout without putting draft bytes in the project", () => {
    const project = withCodeSection(makeProject());
    const document = projectWorkspaceDocument(
      project,
      undefined,
      makeRuntimeSource(),
      false,
    );
    const section = document.sections["code-main"]!;
    (section.data as WorkspaceCodeSectionData).code = "secret draft\n";
    section.name = "entrypoint.py";
    document.topLevelSections["code-main"]!.x = 1_020;

    expect(workspaceDocumentOperations(project, document)).toEqual([
      {
        layout: { height: 420, width: 560, x: 1_020, y: 24, zIndex: 3 },
        op: "upsertSection",
        section: {
          ...project.sections["code-main"],
          data: { source: "entrypoint" },
          name: "entrypoint.py",
        },
      },
    ]);
  });

  it("rejects generic project-data replacement for entrypoint source", () => {
    expect(() =>
      replaceSectionDataOperation(withCodeSection(makeProject()), "code-main", {
        code: "draft bytes",
      }),
    ).toThrow(/must use the runtime source boundary/u);
  });
});
