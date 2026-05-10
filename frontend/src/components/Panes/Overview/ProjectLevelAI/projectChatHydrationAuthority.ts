import { ChatRunType } from "state/actions/chatHistory";
import { EngineConfig, EngineTypeEnum } from "utils/generatedTypes";

type SelectedScopedChatProvenance =
  | {
      status: "ready";
      provenance: {
        runType: ChatRunType;
        engineConfigId: string | null;
      };
    }
  | {
      status: "missing" | "ambiguous";
    };

type ResolveProjectChatThreadBlockedErrorCodeForSelectedChatInput = {
  chatId: string | null | undefined;
  selectedScopedChatProvenance: SelectedScopedChatProvenance;
  chatProvenanceAuthoritative: boolean;
  engineConfigById: Map<string, EngineConfig>;
  engineConfigsAuthoritative: boolean;
};

type ReadySelectedScopedChatProvenance = Extract<
  SelectedScopedChatProvenance,
  { status: "ready" }
>;

export type ProjectChatThreadBlockedErrorCode =
  | "chat_provenance_missing"
  | "engine_config_missing"
  | "engine_type_mismatch";

type ProjectChatThreadCompatibilityResult =
  | {
      status: "compatible";
    }
  | {
      status: "unknown";
    }
  | {
      status: "warning";
      errorCode: ProjectChatThreadBlockedErrorCode;
    };

export type ProjectChatHydrationAuthority =
  | {
      status: "ready";
      hydrationRunType: ChatRunType | null;
      blockedErrorCode: ProjectChatThreadBlockedErrorCode | null;
    }
  | {
      status: "unknown";
      hydrationRunType: null;
      blockedErrorCode: null;
    };

type SelectedChatRequirement =
  | {
      status: "ready";
      provenance: ReadySelectedScopedChatProvenance["provenance"];
      requiredEngineConfigId: string;
    }
  | {
      status: "resolved";
      compatibility: ProjectChatThreadCompatibilityResult;
    };

function isSelectedChatRunTypeCompatibleWithEngineType({
  runType,
  engineType,
}: {
  runType: ChatRunType;
  engineType: EngineTypeEnum;
}): boolean {
  if (runType === "llm_chat") {
    return engineType === EngineTypeEnum.setta_llm;
  }
  if (runType === "external_agent") {
    return engineType === EngineTypeEnum.external_agent;
  }
  return false;
}

function resolveCompatibilityFromAuthoritativeState(
  authoritative: boolean,
  errorCode: ProjectChatThreadBlockedErrorCode,
): ProjectChatThreadCompatibilityResult {
  return authoritative
    ? {
        status: "warning",
        errorCode,
      }
    : {
        status: "unknown",
      };
}

function resolveSelectedChatRequirement({
  selectedScopedChatProvenance,
  chatProvenanceAuthoritative,
}: Pick<
  ResolveProjectChatThreadBlockedErrorCodeForSelectedChatInput,
  "selectedScopedChatProvenance" | "chatProvenanceAuthoritative"
>): SelectedChatRequirement {
  if (selectedScopedChatProvenance.status !== "ready") {
    return {
      status: "resolved",
      compatibility: resolveCompatibilityFromAuthoritativeState(
        chatProvenanceAuthoritative,
        "chat_provenance_missing",
      ),
    };
  }
  const { provenance } = selectedScopedChatProvenance;
  if (!provenance.engineConfigId) {
    return {
      status: "resolved",
      compatibility: resolveCompatibilityFromAuthoritativeState(
        chatProvenanceAuthoritative,
        "chat_provenance_missing",
      ),
    };
  }
  return {
    status: "ready",
    provenance,
    requiredEngineConfigId: provenance.engineConfigId,
  };
}

function resolveProjectChatThreadBlockedErrorCodeForSelectedChat({
  chatId,
  selectedScopedChatProvenance,
  chatProvenanceAuthoritative,
  engineConfigById,
  engineConfigsAuthoritative,
}: ResolveProjectChatThreadBlockedErrorCodeForSelectedChatInput): ProjectChatThreadCompatibilityResult {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return { status: "compatible" };
  }
  const selectedChatRequirement = resolveSelectedChatRequirement({
    selectedScopedChatProvenance,
    chatProvenanceAuthoritative,
  });
  if (selectedChatRequirement.status !== "ready") {
    return selectedChatRequirement.compatibility;
  }
  const { provenance, requiredEngineConfigId } = selectedChatRequirement;
  const requiredEngine = engineConfigById.get(requiredEngineConfigId);
  if (!requiredEngine) {
    return resolveCompatibilityFromAuthoritativeState(
      engineConfigsAuthoritative,
      "engine_config_missing",
    );
  }
  if (
    !isSelectedChatRunTypeCompatibleWithEngineType({
      runType: provenance.runType,
      engineType: requiredEngine.engineType,
    })
  ) {
    return {
      status: "warning",
      errorCode: "engine_type_mismatch",
    };
  }
  return { status: "compatible" };
}

export function resolveProjectChatRunTypeForEngine(
  engineType: EngineTypeEnum | null,
): ChatRunType | null {
  if (engineType === EngineTypeEnum.external_agent) {
    return "external_agent";
  }
  if (engineType === EngineTypeEnum.setta_llm) {
    return "llm_chat";
  }
  return null;
}

export function resolveProjectChatHydrationAuthority({
  chatId,
  selectedScopedChatProvenance,
  chatProvenanceAuthoritative,
  engineConfigById,
  engineConfigsAuthoritative,
  engineType,
}: ResolveProjectChatThreadBlockedErrorCodeForSelectedChatInput & {
  engineType: EngineTypeEnum | null;
}): ProjectChatHydrationAuthority {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return {
      status: "ready",
      hydrationRunType: resolveProjectChatRunTypeForEngine(engineType),
      blockedErrorCode: null,
    };
  }
  const compatibility = resolveProjectChatThreadBlockedErrorCodeForSelectedChat(
    {
      chatId: resolvedChatId,
      selectedScopedChatProvenance,
      chatProvenanceAuthoritative,
      engineConfigById,
      engineConfigsAuthoritative,
    },
  );
  if (compatibility.status === "unknown") {
    return {
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    };
  }
  if (compatibility.status === "warning") {
    return {
      status: "ready",
      hydrationRunType:
        selectedScopedChatProvenance.status === "ready"
          ? selectedScopedChatProvenance.provenance.runType
          : null,
      blockedErrorCode: compatibility.errorCode,
    };
  }
  if (selectedScopedChatProvenance.status !== "ready") {
    throw new Error(
      "Expected ready chat provenance when compatibility status is 'compatible'.",
    );
  }
  return {
    status: "ready",
    hydrationRunType: selectedScopedChatProvenance.provenance.runType,
    blockedErrorCode: null,
  };
}
