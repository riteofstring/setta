import { pickDefaultConfigId } from "components/Chat/llmConfigUtils";
import { EngineTypeEnum, SectionTypeEnum } from "utils/generatedTypes";

export type SectionOption = {
  id: string;
  name: string;
  type: SectionTypeEnum;
};

type LinkedChatTargetFilterArgs = {
  sectionOptions: Array<SectionOption>;
  sectionVariantMap: Record<string, string>;
  sectionVariants: Record<
    string,
    {
      impl: string;
    }
  >;
  sectionImpls: Record<
    string,
    {
      type: SectionTypeEnum;
      managed?: boolean;
      engineConfigId?: string | null;
      agentProfileId?: string | null;
    }
  >;
  agentProfiles: Array<{
    id: string;
    engineConfigId: string | null;
  }>;
  engineConfigs: Array<{
    id: string;
    engineType: EngineTypeEnum;
    settaLlmConfigId?: string | null;
    externalAgentConfigId?: string | null;
  }>;
  externalAgentConfigs: Array<{
    id: string;
  }>;
  allLLMConfigs: {
    configs: Record<string, unknown>;
    default_config_id?: string | null;
  };
};

type LinkedChatTargetLookup = Omit<
  LinkedChatTargetFilterArgs,
  "sectionOptions"
> & {
  externalAgentConfigIds: Set<string>;
};

function resolveExecutableLinkedChatEngineConfig(
  impl: {
    engineConfigId?: string | null;
    agentProfileId?: string | null;
  },
  lookup: LinkedChatTargetLookup,
) {
  let effectiveEngineConfigId = impl.engineConfigId ?? null;
  if (effectiveEngineConfigId == null && impl.agentProfileId != null) {
    const selectedProfile =
      lookup.agentProfiles.find(
        (profile) => profile.id === impl.agentProfileId,
      ) ?? null;
    effectiveEngineConfigId = selectedProfile?.engineConfigId ?? null;
  }
  if (effectiveEngineConfigId == null) {
    return null;
  }
  return (
    lookup.engineConfigs.find(
      (config) => config.id === effectiveEngineConfigId,
    ) ?? null
  );
}

function isExecutableLinkedChatEngineConfigReady(
  engineConfig: {
    engineType: EngineTypeEnum;
    settaLlmConfigId?: string | null;
    externalAgentConfigId?: string | null;
  },
  lookup: LinkedChatTargetLookup,
): boolean {
  if (engineConfig.engineType === EngineTypeEnum.external_agent) {
    if (!engineConfig.externalAgentConfigId) {
      return false;
    }
    return lookup.externalAgentConfigIds.has(
      engineConfig.externalAgentConfigId,
    );
  }
  if (engineConfig.engineType === EngineTypeEnum.setta_llm) {
    return Boolean(
      engineConfig.settaLlmConfigId ??
        pickDefaultConfigId(lookup.allLLMConfigs),
    );
  }
  return true;
}

function isExecutableLinkedChatTarget(
  entry: SectionOption,
  lookup: LinkedChatTargetLookup,
): boolean {
  if (entry.type !== SectionTypeEnum.Chat) {
    return false;
  }
  const variantId = lookup.sectionVariantMap[entry.id];
  if (!variantId) {
    return false;
  }
  const variant = lookup.sectionVariants[variantId];
  if (!variant) {
    return false;
  }
  const impl = lookup.sectionImpls[variant.impl];
  if (!impl) {
    return false;
  }
  if (impl.type !== SectionTypeEnum.Chat) {
    return false;
  }
  if (impl.managed !== true) {
    return false;
  }
  const engineConfig = resolveExecutableLinkedChatEngineConfig(impl, lookup);
  if (!engineConfig) {
    return false;
  }
  return isExecutableLinkedChatEngineConfigReady(engineConfig, lookup);
}

export function filterExecutableLinkedChatTargets({
  sectionOptions,
  sectionVariantMap,
  sectionVariants,
  sectionImpls,
  agentProfiles,
  engineConfigs,
  externalAgentConfigs,
  allLLMConfigs,
}: LinkedChatTargetFilterArgs): Array<SectionOption> {
  const externalAgentConfigIds = new Set(
    externalAgentConfigs.map((config) => config.id),
  );
  return sectionOptions.filter((entry) =>
    isExecutableLinkedChatTarget(entry, {
      sectionVariantMap,
      sectionVariants,
      sectionImpls,
      agentProfiles,
      engineConfigs,
      externalAgentConfigs,
      allLLMConfigs,
      externalAgentConfigIds,
    }),
  );
}
