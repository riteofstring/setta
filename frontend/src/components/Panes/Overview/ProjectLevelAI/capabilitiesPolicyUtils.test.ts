import {
  CapabilityModeEnum,
  createCapabilityPolicy,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getCapabilityModeLabel,
  getUnavailableCapabilityIds,
  setCapabilityPolicyMode,
  toggleCapabilityMcpServerId,
  toggleCapabilitySkillId,
} from "./capabilitiesPolicyUtils";

describe("capabilitiesPolicyUtils", () => {
  it("preserves selections when switching modes", () => {
    // Skills mode should not wipe previously selected skills/MCP servers.
    const policy = createCapabilityPolicy({
      mode: CapabilityModeEnum.custom,
      enabledSkillIds: ["a", "b"],
      enabledMcpServerIds: ["m1"],
    });

    const next = setCapabilityPolicyMode(policy, CapabilityModeEnum.disabled);

    expect(next.mode).toBe(CapabilityModeEnum.disabled);
    expect(next.enabledSkillIds).toEqual(["a", "b"]);
    expect(next.enabledMcpServerIds).toEqual(["m1"]);
  });

  it("preserves current custom selections when mode stays custom", () => {
    // Custom mode should keep the explicit chat-scoped selections.
    const policy = createCapabilityPolicy({
      mode: CapabilityModeEnum.custom,
      enabledSkillIds: ["s1"],
      enabledMcpServerIds: ["m1", "m2"],
    });

    const next = setCapabilityPolicyMode(policy, CapabilityModeEnum.custom);

    expect(next.mode).toBe(CapabilityModeEnum.custom);
    expect(next.enabledSkillIds).toEqual(["s1"]);
    expect(next.enabledMcpServerIds).toEqual(["m1", "m2"]);
  });

  it("adds and removes skill ids while forcing custom mode", () => {
    // Toggling a skill should update only the skills list and keep MCP ids.
    const base = createCapabilityPolicy({
      mode: CapabilityModeEnum.inherit,
      enabledMcpServerIds: ["m1"],
    });

    const withSkill = toggleCapabilitySkillId(base, "skill-a", true);
    const withoutSkill = toggleCapabilitySkillId(withSkill, "skill-a", false);

    expect(withSkill.mode).toBe(CapabilityModeEnum.custom);
    expect(withSkill.enabledSkillIds).toEqual(["skill-a"]);
    expect(withSkill.enabledMcpServerIds).toEqual(["m1"]);
    expect(withoutSkill.enabledSkillIds).toEqual([]);
  });

  it("deduplicates MCP ids without changing skills mode", () => {
    // MCP toggles are independent from the skills mode control.
    const base = createCapabilityPolicy({
      mode: CapabilityModeEnum.inherit,
      enabledSkillIds: ["skill-a"],
      enabledMcpServerIds: ["m1"],
    });

    const withDuplicate = toggleCapabilityMcpServerId(base, "m1", true);

    expect(withDuplicate.mode).toBe(CapabilityModeEnum.inherit);
    expect(withDuplicate.enabledMcpServerIds).toEqual(["m1"]);
  });

  it("computes unavailable ids against a catalog set", () => {
    // The UI should explicitly surface selected ids missing from the latest catalog.
    const unavailable = getUnavailableCapabilityIds(
      ["a", "b", "c"],
      new Set(["a", "c"]),
    );

    expect(unavailable).toEqual(["b"]);
  });

  it("returns user-facing labels for each mode", () => {
    // Labels are displayed in section + project capability panels.
    expect(
      getCapabilityModeLabel(
        createCapabilityPolicy({ mode: CapabilityModeEnum.disabled }),
      ),
    ).toBe("Disabled");
    expect(
      getCapabilityModeLabel(
        createCapabilityPolicy({ mode: CapabilityModeEnum.inherit }),
      ),
    ).toBe("Inherit global defaults");
    expect(
      getCapabilityModeLabel(
        createCapabilityPolicy({ mode: CapabilityModeEnum.custom }),
      ),
    ).toBe("Custom");
  });
});
