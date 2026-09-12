import { describe, expect, it } from "vitest";
import { assertWorkspaceItemControlPresentation } from "../document/itemPresentation";
import {
  createWorkspaceInspectorItemControl,
  isWorkspaceInspectorItemControlKind,
  WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS,
} from "./workspaceInspectorItemDefaults";

describe("workspace Inspector item defaults", () => {
  it("creates a complete valid control for every ordinary UI type", () => {
    for (const kind of WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS) {
      const control = createWorkspaceInspectorItemControl(
        kind,
        "previous value",
      );
      expect(() =>
        assertWorkspaceItemControlPresentation(
          control,
          `Inspector ${kind} default`,
        ),
      ).not.toThrow();
      expect(control.kind).toBe(kind);
    }
  });

  it("uses explicit safe values for controls with constrained value syntax", () => {
    expect(
      createWorkspaceInspectorItemControl("color", "not-a-color").value,
    ).toBe("#000000");
    expect(
      createWorkspaceInspectorItemControl("switch", "not-a-switch").value,
    ).toBe("false");
    expect(
      createWorkspaceInspectorItemControl("slider", "not-a-number").value,
    ).toBe("0");
  });

  it("accepts only the advertised ordinary UI types", () => {
    expect(isWorkspaceInspectorItemControlKind("text")).toBe(true);
    expect(isWorkspaceInspectorItemControlKind("group")).toBe(false);
    expect(isWorkspaceInspectorItemControlKind("unknown")).toBe(false);
  });
});
