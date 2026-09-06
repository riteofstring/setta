import { describe, expect, it } from "vitest";
import { createWorkspaceHost } from "@setta/workspace";

import { makeProject } from "../testProject";
import {
  createRealtimeSectionKinds,
  registerRealtimeSectionKinds,
} from "./realtimeSectionKinds";
import {
  projectWorkspaceDocument,
  workspaceDocumentOperations,
} from "./projectProjection";

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
});
