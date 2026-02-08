import {
  CapabilityModeEnum,
  CapabilityPolicy,
  createCapabilityPolicy,
} from "utils/generatedTypes";

type CapabilityMode =
  (typeof CapabilityModeEnum)[keyof typeof CapabilityModeEnum];

export function setCapabilityPolicyMode(
  policy: CapabilityPolicy,
  mode: CapabilityMode,
): CapabilityPolicy {
  return {
    mode,
    enabledSkillIds: [...policy.enabledSkillIds],
    enabledMcpServerIds: [...policy.enabledMcpServerIds],
  };
}

export function toggleCapabilitySkillId(
  policy: CapabilityPolicy,
  skillId: string,
  selected: boolean,
): CapabilityPolicy {
  const nextIds = new Set(policy.enabledSkillIds);
  if (selected) {
    nextIds.add(skillId);
  } else {
    nextIds.delete(skillId);
  }
  return {
    mode: CapabilityModeEnum.custom,
    enabledSkillIds: Array.from(nextIds),
    enabledMcpServerIds: [...policy.enabledMcpServerIds],
  };
}

export function toggleCapabilityMcpServerId(
  policy: CapabilityPolicy,
  serverId: string,
  selected: boolean,
): CapabilityPolicy {
  const nextIds = new Set(policy.enabledMcpServerIds);
  if (selected) {
    nextIds.add(serverId);
  } else {
    nextIds.delete(serverId);
  }
  return {
    mode: policy.mode,
    enabledSkillIds: [...policy.enabledSkillIds],
    enabledMcpServerIds: Array.from(nextIds),
  };
}

export function getUnavailableCapabilityIds(
  selectedIds: string[],
  availableIds: Set<string>,
): string[] {
  return selectedIds.filter((id) => !availableIds.has(id));
}

export function getCapabilityModeLabel(policy: CapabilityPolicy): string {
  if (policy.mode === CapabilityModeEnum.disabled) {
    return "Disabled";
  }
  if (policy.mode === CapabilityModeEnum.inherit) {
    return "Inherit global defaults";
  }
  return "Custom";
}

export function createDefaultCapabilityPolicy(): CapabilityPolicy {
  return createCapabilityPolicy();
}
