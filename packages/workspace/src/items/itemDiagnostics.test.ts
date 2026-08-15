import { describe, expect, it } from "vitest";
import type { WorkspaceSectionItemTree } from "../document/types";
import {
  getHighestWorkspaceItemDiagnosticSeverity,
  getWorkspaceItemDiagnosticCountSummary,
  getWorkspaceItemDiagnosticRowClassName,
  normalizeWorkspaceItemDiagnosticRegistry,
  type WorkspaceItemDiagnosticRegistry,
} from "./itemDiagnostics";

function makeItemTree(): WorkspaceSectionItemTree {
  return {
    rootId: "item-root",
    items: {
      "item-root": { id: "item-root", children: ["item-a"] },
      "item-a": { id: "item-a", children: [], data: { label: "A" } },
    },
    selectedItemIds: [],
  };
}

function normalize(candidate: unknown) {
  return normalizeWorkspaceItemDiagnosticRegistry(
    candidate as WorkspaceItemDiagnosticRegistry,
    "panel",
    new Set(Object.keys(makeItemTree().items).filter((itemId) => itemId !== "item-root")),
  );
}

describe("workspace item diagnostics", () => {
  it("validates, trims, and freezes one complete ephemeral registry", () => {
    const normalized = normalize({
      "item-a": [
        { severity: "info", message: "  First note.  " },
        { severity: "warning", message: "Review this value." },
        { severity: "error", message: "Choose a smaller value." },
      ],
    });

    expect(normalized["item-a"]).toEqual([
      { severity: "info", message: "First note." },
      { severity: "warning", message: "Review this value." },
      { severity: "error", message: "Choose a smaller value." },
    ]);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized["item-a"])).toBe(true);
    expect(Object.isFrozen(normalized["item-a"]?.[0])).toBe(true);
    expect(getHighestWorkspaceItemDiagnosticSeverity(normalized["item-a"] ?? [])).toBe("error");
    expect(getWorkspaceItemDiagnosticCountSummary(normalized["item-a"] ?? [])).toBe(
      "1 error, 1 warning, and 1 information message",
    );
    expect(getWorkspaceItemDiagnosticRowClassName("error")).toContain("ring-red-600/50");
    expect(getWorkspaceItemDiagnosticRowClassName("warning")).toContain("ring-amber-600/50");
    expect(getWorkspaceItemDiagnosticRowClassName("info")).toContain("ring-sky-600/50");
  });

  it("accepts a still-supplied diagnostic for a previously known deleted item", () => {
    const normalized = normalizeWorkspaceItemDiagnosticRegistry(
      {
        "item-deleted": [{ severity: "warning", message: "The host is clearing this." }],
      },
      "panel",
      new Set(["item-deleted"]),
    );

    expect(normalized["item-deleted"]).toEqual([
      { severity: "warning", message: "The host is clearing this." },
    ]);
  });

  it.each([
    [null, "Item diagnostic registry for section panel must be an object."],
    [{ "": [] }, "contains a blank item id"],
    [{ "item-root": [] }, "names unknown item item-root"],
    [{ missing: [] }, "names unknown item missing"],
    [{ "item-a": {} }, "Diagnostics for panel/item-a must be an array."],
    [{ "item-a": [{ severity: "fatal", message: "No." }] }, "unknown severity fatal"],
    [{ "item-a": [{ severity: "error", message: "  " }] }, "requires a non-empty message"],
    [
      { "item-a": [{ severity: "error", message: "No.", code: "E1" }] },
      "contains the unknown field code",
    ],
  ])("rejects malformed registry input atomically", (candidate, message) => {
    expect(() => normalize(candidate)).toThrowError(message);
  });
});
