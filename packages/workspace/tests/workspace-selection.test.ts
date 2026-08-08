import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import { workspaceMarqueeRect } from "../src/internal/workspace-canvas-selection.js";
import {
  applyWorkspaceSectionSelectionRequest,
  reconcileWorkspaceSelection,
  resolveWorkspaceRootSelection,
  resolveWorkspaceSelection,
  translateWorkspaceRootSelection,
} from "../src/internal/workspace-selection.js";
import { createWorkspaceTestDocument, WorkspaceInMemoryHost } from "../src/testing.js";

function rootSelectionDocument(): WorkspaceDocument {
  const base = createWorkspaceTestDocument([
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
    { id: "gamma", title: "Gamma" },
  ]);
  return {
    ...base,
    rootSections: [
      { position: { x: 120, y: 80 }, sectionId: "alpha" },
      { position: { x: -40, y: 20 }, sectionId: "beta" },
      { position: { x: 320, y: 20 }, sectionId: "gamma" },
    ],
  };
}

describe("workspace selection", () => {
  it("keeps selection canonical while supporting replacement, additive toggles, and drag preservation", () => {
    const document = rootSelectionDocument();

    expect(resolveWorkspaceSelection(document, ["gamma", "alpha", "gamma"])).toEqual([
      "alpha",
      "gamma",
    ]);
    expect(
      applyWorkspaceSectionSelectionRequest(document, ["alpha", "beta"], "alpha", {
        additive: false,
        preserveSelected: true,
      }),
    ).toEqual(["alpha", "beta"]);
    expect(
      applyWorkspaceSectionSelectionRequest(document, ["alpha", "beta"], "alpha", {
        additive: false,
        preserveSelected: false,
      }),
    ).toEqual(["alpha"]);
    expect(
      applyWorkspaceSectionSelectionRequest(document, ["alpha", "beta"], "beta", {
        additive: true,
        preserveSelected: false,
      }),
    ).toEqual(["alpha"]);
    expect(
      applyWorkspaceSectionSelectionRequest(document, ["alpha"], "gamma", {
        additive: true,
        preserveSelected: false,
      }),
    ).toEqual(["alpha", "gamma"]);
  });

  it("reconciles removed sections and rejects unknown imperative selections", () => {
    const document = rootSelectionDocument();
    const withoutBeta: WorkspaceDocument = {
      ...document,
      rootSections: document.rootSections.filter(({ sectionId }) => sectionId !== "beta"),
      sections: Object.fromEntries(
        Object.entries(document.sections).filter(([sectionId]) => sectionId !== "beta"),
      ),
    };

    expect(reconcileWorkspaceSelection(withoutBeta, ["beta", "gamma"])).toEqual(["gamma"]);
    expect(() => resolveWorkspaceSelection(document, ["missing"])).toThrow(
      'unknown section "missing"',
    );
  });

  it("normalizes and spatially orders a top-level block before preserving its offsets", () => {
    const document = rootSelectionDocument();
    const result = resolveWorkspaceRootSelection(document, ["alpha", "gamma", "beta"], "alpha");

    expect(result).toEqual({
      allowed: true,
      block: { sectionIds: ["beta", "gamma", "alpha"], sourceParentId: null },
    });
    if (!result.allowed) {
      throw new Error(result.reason);
    }
    expect(
      translateWorkspaceRootSelection(document, result.block, "alpha", { x: 168, y: 104 }),
    ).toEqual({
      alpha: { x: 168, y: 104 },
      beta: { x: 8, y: 44 },
      gamma: { x: 368, y: 44 },
    });
  });

  it("rejects a selected block containing a locked section without partial movement", () => {
    const base = rootSelectionDocument();
    const beta = base.sections.beta as WorkspaceSection;
    const document: WorkspaceDocument = {
      ...base,
      sections: {
        ...base.sections,
        beta: { ...beta, positionAndSizeLocked: true },
      },
    };

    expect(resolveWorkspaceRootSelection(document, ["alpha", "beta"], "alpha")).toEqual({
      allowed: false,
      reason: "The selection contains a locked section and cannot move.",
    });
  });

  it("retains prototype-mutator IDs while normalizing selected descendants", () => {
    const base = createWorkspaceTestDocument([
      { id: "__proto__", title: "Container" },
      { id: "constructor", title: "Child" },
    ]);
    const parent = base.sections["__proto__"] as WorkspaceSection;
    const document: WorkspaceDocument = {
      ...base,
      rootSections: [{ position: { x: 0, y: 0 }, sectionId: "__proto__" }],
      sections: Object.fromEntries(
        Object.entries(base.sections).map(([sectionId, section]) => [
          sectionId,
          sectionId === "__proto__"
            ? {
                ...parent,
                childLayout: {
                  orientation: "vertical" as const,
                  overflow: "grow" as const,
                  sectionIds: ["constructor"],
                },
              }
            : section,
        ]),
      ),
    };

    expect(
      resolveWorkspaceRootSelection(document, ["constructor", "__proto__"], "__proto__"),
    ).toEqual({
      allowed: true,
      block: { sectionIds: ["__proto__"], sourceParentId: null },
    });
  });

  it("keeps selection transient in the in-memory host controller", () => {
    const host = new WorkspaceInMemoryHost(rootSelectionDocument());

    expect(host.controller.selectSections(["gamma", "alpha", "gamma"])).toEqual({
      status: "applied",
    });
    expect(host.controller.getSelectedSectionIds()).toEqual(["alpha", "gamma"]);
    expect(host.controller.clearSelection()).toEqual({ status: "applied" });
    expect(host.controller.getSelectedSectionIds()).toEqual([]);
    expect(host.changes()).toEqual([]);
  });

  it("normalizes marquee rectangles in every drag direction", () => {
    expect(workspaceMarqueeRect({ x: 40, y: -20 }, { x: -10, y: 30 })).toEqual({
      height: 50,
      width: 50,
      x: -10,
      y: -20,
    });
  });
});
