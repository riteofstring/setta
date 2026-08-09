import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import {
  planWorkspaceRootStacking,
  resolveWorkspaceTopLevelAncestors,
} from "../src/internal/workspace-root-stacking.js";
import { createWorkspaceTestDocument, WorkspaceInMemoryHost } from "../src/testing.js";

function rootIds(document: WorkspaceDocument): readonly string[] {
  return document.rootSections.map(({ sectionId }) => sectionId);
}

function stackingDocument(): WorkspaceDocument {
  return createWorkspaceTestDocument([
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
    { id: "gamma", title: "Gamma" },
    { id: "delta", title: "Delta" },
  ]);
}

describe("workspace root stacking", () => {
  it("moves distinct selected roots as stable blocks at edges and by one layer", () => {
    const document = stackingDocument();

    expect(
      rootIds({
        ...document,
        rootSections: planWorkspaceRootStacking(document, ["beta", "delta"], "bring-to-front"),
      }),
    ).toEqual(["alpha", "gamma", "beta", "delta"]);
    expect(
      rootIds({
        ...document,
        rootSections: planWorkspaceRootStacking(document, ["beta", "delta"], "send-to-back"),
      }),
    ).toEqual(["beta", "delta", "alpha", "gamma"]);
    expect(
      rootIds({
        ...document,
        rootSections: planWorkspaceRootStacking(document, ["beta", "delta"], "bring-forward"),
      }),
    ).toEqual(["alpha", "gamma", "beta", "delta"]);
    expect(
      rootIds({
        ...document,
        rootSections: planWorkspaceRootStacking(document, ["beta", "delta"], "send-backward"),
      }),
    ).toEqual(["beta", "alpha", "delta", "gamma"]);
  });

  it("maps descendants to distinct top-level ancestors before stacking", () => {
    const flat = stackingDocument();
    const beta = flat.sections.beta as WorkspaceSection;
    const gamma = flat.sections.gamma as WorkspaceSection;
    const document: WorkspaceDocument = {
      ...flat,
      rootSections: flat.rootSections.filter(({ sectionId }) => sectionId !== "gamma"),
      sections: {
        ...flat.sections,
        beta: {
          ...beta,
          childLayout: {
            orientation: "vertical",
            overflow: "grow",
            positioning: "ordered",
            sectionIds: ["gamma"],
          },
        },
        gamma,
      },
    };

    expect(resolveWorkspaceTopLevelAncestors(document, ["gamma", "beta", "gamma"])).toEqual([
      "beta",
    ]);
    expect(
      rootIds({
        ...document,
        rootSections: planWorkspaceRootStacking(document, ["gamma"], "bring-to-front"),
      }),
    ).toEqual(["alpha", "delta", "beta"]);
  });

  it("publishes one explicit stack change and suppresses edge no-ops", () => {
    const host = new WorkspaceInMemoryHost(stackingDocument());

    expect(host.controller.bringToFront(["beta", "gamma"])).toEqual({ status: "applied" });
    expect(rootIds(host.document())).toEqual(["alpha", "delta", "beta", "gamma"]);
    expect(host.controller.bringToFront(["beta", "gamma"])).toEqual({ status: "unchanged" });
    expect(host.changes().map(({ change }) => change.reason)).toEqual(["section-stack"]);
  });

  it("gates stacking with live layout capability and validates section lists", () => {
    const host = new WorkspaceInMemoryHost(stackingDocument(), {
      capabilities: { editLayout: false },
    });
    const sparse = ["alpha"];
    delete sparse[0];

    expect(host.controller.sendToBack(["delta"])).toEqual({
      reason: "layout-edit-disabled",
      status: "rejected",
    });
    expect(() => host.controller.bringForward(sparse)).toThrow(
      "Workspace section IDs must be a dense array without extra fields",
    );
    expect(host.changes()).toEqual([]);

    host.setPolicy({ capabilities: { editLayout: true } });
    expect(host.controller.sendBackward(["delta"])).toEqual({ status: "applied" });
    expect(rootIds(host.document())).toEqual(["alpha", "beta", "delta", "gamma"]);
  });
});
