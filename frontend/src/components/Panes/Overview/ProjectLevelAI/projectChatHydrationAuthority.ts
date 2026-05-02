import { ChatRunType } from "state/actions/chatHistory";
import { type EngineConfig, EngineTypeEnum } from "utils/generatedTypes";

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

type ProjectChatThreadValidationResult =
  | {
      status: "valid";
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
      result: ProjectChatThreadValidationResult;
    };

function isSelectedChatRunTypeCompatibleWithEngineType({
  runType,
  engineType,
}: {
  runType: ChatRunType;
  engineType: EngineConfig["engineType"];
}): boolean {
  if (runType === "llm_chat") {
    return engineType === EngineTypeEnum.setta_llm;
  }
  if (runType === "external_agent") {
    return engineType === EngineTypeEnum.external_agent;
  }
  return false;
}

function resolveValidationFromAuthoritativeState(
  authoritative: boolean,
  errorCode: ProjectChatThreadBlockedErrorCode,
): ProjectChatThreadValidationResult {
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
      result: resolveValidationFromAuthoritativeState(
        chatProvenanceAuthoritative,
        "chat_provenance_missing",
      ),
    };
  }
  const { provenance } = selectedScopedChatProvenance;
  if (!provenance.engineConfigId) {
    return {
      status: "resolved",
      result: resolveValidationFromAuthoritativeState(
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
}: ResolveProjectChatThreadBlockedErrorCodeForSelectedChatInput): ProjectChatThreadValidationResult {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return { status: "valid" };
  }
  const selectedChatRequirement = resolveSelectedChatRequirement({
    selectedScopedChatProvenance,
    chatProvenanceAuthoritative,
  });
  if (selectedChatRequirement.status !== "ready") {
    return selectedChatRequirement.result;
  }
  const { provenance, requiredEngineConfigId } = selectedChatRequirement;
  const requiredEngine = engineConfigById.get(requiredEngineConfigId);
  if (!requiredEngine) {
    return resolveValidationFromAuthoritativeState(
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
  return { status: "valid" };
}

export function resolveProjectChatRunTypeForEngine(
  engineType: EngineConfig["engineType"] | null,
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
  engineType: EngineConfig["engineType"] | null;
}): ProjectChatHydrationAuthority {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return {
      status: "ready",
      hydrationRunType: resolveProjectChatRunTypeForEngine(engineType),
      blockedErrorCode: null,
    };
  }
  const validation = resolveProjectChatThreadBlockedErrorCodeForSelectedChat({
    chatId: resolvedChatId,
    selectedScopedChatProvenance,
    chatProvenanceAuthoritative,
    engineConfigById,
    engineConfigsAuthoritative,
  });
  if (validation.status === "unknown") {
    return {
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    };
  }
  if (validation.status === "warning") {
    return {
      status: "ready",
      hydrationRunType:
        selectedScopedChatProvenance.status === "ready"
          ? selectedScopedChatProvenance.provenance.runType
          : null,
      blockedErrorCode: validation.errorCode,
    };
  }
  if (selectedScopedChatProvenance.status !== "ready") {
    throw new Error(
      "Expected ready chat provenance when selected chat validation is valid.",
    );
  }
  return {
    status: "ready",
    hydrationRunType: selectedScopedChatProvenance.provenance.runType,
    blockedErrorCode: null,
  };
}
