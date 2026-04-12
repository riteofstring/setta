import { describe, expect, it } from "vitest";
import {
  getKwargsControlsActionState,
  getKwargsControlsThemeState,
} from "./kwargsControlsState";

describe("getKwargsControlsActionState", () => {
  it("describes unlinking selected edge args when layout edits are allowed", () => {
    const state = getKwargsControlsActionState({
      selectedParams: ["param-1", "param-2"],
      edgeInputParams: ["param-1", "param-2"],
      pinnedParams: ["param-1", "param-2"],
      deletableSelectedParamIds: ["param-1"],
      canEditLayout: true,
      canEditStructure: true,
      variantIsFrozen: false,
    });

    expect(state.selectedAreAllEdgeInputs).toBe(true);
    expect(state.selectedHasAnyEdgeInputs).toBe(true);
    expect(state.shouldUnpinSelected).toBe(true);
    expect(state.pinParamsDisabled).toBe(false);
    expect(state.convertToEdgeDisabled).toBe(false);
    expect(state.convertToEdgeAriaLabel).toBe(
      "Convert selected edge args back to params",
    );
    expect(state.convertToEdgeIconClassName).toBe("gg-unlink");
    expect(state.convertToEdgeTooltip).toBe(
      "Move selected edge args back to unpinned",
    );
    expect(state.deleteSelectedDisabled).toBe(false);
  });

  it("disables all selection actions when nothing is selected", () => {
    const state = getKwargsControlsActionState({
      selectedParams: [],
      edgeInputParams: [],
      pinnedParams: [],
      deletableSelectedParamIds: [],
      canEditLayout: true,
      canEditStructure: true,
      variantIsFrozen: false,
    });

    expect(state.pinParamsDisabled).toBe(true);
    expect(state.convertToEdgeDisabled).toBe(true);
    expect(state.deleteSelectedDisabled).toBe(true);
    expect(state.convertToEdgeAriaLabel).toBe("Convert to edge connectors");
    expect(state.convertToEdgeIconClassName).toBe("gg-link");
    expect(state.convertToEdgeTooltip).toBe(
      "Convert selected args to edge connectors",
    );
  });
});

describe("getKwargsControlsThemeState", () => {
  it("keeps default muted colors when no section style theme is active", () => {
    const state = getKwargsControlsThemeState({
      resolvedStyleColor: null,
      darkMode: false,
      isCallableSection: false,
    });

    expect(state.hasSectionStyleTheme).toBe(false);
    expect(state.argsLabelColorClassName).toContain("text-setta-600/70");
    expect(state.argsIconButtonColorClassName).toContain("text-setta-500");
  });
});
