package frontendbindings

type WebsocketFrontendSupport struct{}

type WebsocketConnectionInfo struct {
	ID             string  `json:"id"`
	ConnectionType string  `json:"connectionType"`
	CurrentAddress *string `json:"currentAddress"`
	ShareSessionID *string `json:"shareSessionId"`
}

type WebsocketMsgCurrentAddressUpdate struct {
	ID          *string `json:"id,omitempty"`
	MessageType string  `json:"messageType"`
	Content     string  `json:"content"`
}

const websocketFrontendSupportRawTS = `
export const WebsocketConnectionTypeEnum = {
  CLI: "CLI",
  SERVER: "SERVER",
  PYTHON_LOGGER: "PYTHON_LOGGER",
  PYTHON_SCRIPT: "PYTHON_SCRIPT",
  FRONTEND: "FRONTEND",
} as const;
export type WebsocketConnectionType = ObjectValues<typeof WebsocketConnectionTypeEnum>;

export const WebsocketMsgTypeForFrontendEnum = {
  AllConnections: "AllConnections",
  FrontendIdentity: "FrontendIdentity",
  Notification: "Notification",
  LLMStreamingResponse: "LLMStreamingResponse",
  LSPDiagnostics: "LSPDiagnostics",
  NameValidationErrors: "NameValidationErrors",
  ReturnRenameRefactorResults: "ReturnRenameRefactorResults",
  TerminalMetadata: "TerminalMetadata",
  UpdateFrontendProjectState: "UpdateFrontendProjectState",
  UpdateSettings: "UpdateSettings",
  AllProjectMetadata: "AllProjectMetadata",
  UpdateArtifacts: "UpdateArtifacts",
  ListenerCoverageSnapshot: "ListenerCoverageSnapshot",
  LLMConfigUpdated: "LLMConfigUpdated",
  LLMApiKeysUpdated: "LLMApiKeysUpdated",
  BackendLogEvent: "BackendLogEvent",
  AIFollowToolArgumentsUpdate: "AIFollowToolArgumentsUpdate",
  AIFollowToolResultUpdate: "AIFollowToolResultUpdate",
  UISettingReveal: "UISettingReveal",
  AgentProfilesUpdated: "AgentProfilesUpdated",
  PromptTemplatesUpdated: "PromptTemplatesUpdated",
  ExternalAgentConfigsUpdated: "ExternalAgentConfigsUpdated",
  EngineConfigsUpdated: "EngineConfigsUpdated",
  TranscriptionProfilesUpdated: "TranscriptionProfilesUpdated",
} as const;
export type WebsocketMsgTypeForFrontend = ObjectValues<typeof WebsocketMsgTypeForFrontendEnum>;

export const WebsocketMsgTypeForBackendEnum = {
  CurrentAddressUpdate: "CurrentAddressUpdate",
  UISettingRevealResult: "UISettingRevealResult",
  RealtimeUIChange: "RealtimeUIChange",
  RealtimeDependencyEvent: "RealtimeDependencyEvent",
} as const;
export type WebsocketMsgTypeForBackend = ObjectValues<typeof WebsocketMsgTypeForBackendEnum>;

export type UISettingRevealActivationStep = {
  type: string;
  itemValue: string;
};

export type UISettingRevealTarget = {
  settingId: string;
  side: string;
  overviewTabKey?: string | null;
  uiEditorTabName?: string | null;
  pluginId?: string | null;
  paneId?: string | null;
  strategy: string;
  anchorId?: string | null;
  pluginRevealKey?: string | null;
  revealActivationSteps: Array<UISettingRevealActivationStep>;
};

export type UISettingRevealContent = {
  projectConfigId: string;
  chatId?: string | null;
  activeSectionId?: string | null;
  reveals: Array<UISettingRevealTarget>;
  durationMs: number;
  requestId: string;
};

export type UISettingRevealResultStatus = {
  settingId: string;
  status: "revealed" | "failed";
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type UISettingRevealResultContent = {
  projectConfigId: string;
  requestId: string;
  statuses: Array<UISettingRevealResultStatus>;
};

export type WebsocketMsgRealtimeUIChange = {
  id?: string | null;
  messageType: typeof WebsocketMsgTypeForBackendEnum.RealtimeUIChange;
  content: {
    projectConfigId: string;
    dependencyKey: BaseDependencyKeyUnion;
    value: BaseDependencyValueUnion;
  };
};

export type WebsocketMsgRealtimeDependencyEvent = {
  id?: string | null;
  messageType: typeof WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent;
  content: {
    projectConfigId: string;
    dependencyEvent: DependencyEvent;
  };
};

export type WebsocketMsgUISettingRevealResult = {
  id?: string | null;
  messageType: typeof WebsocketMsgTypeForBackendEnum.UISettingRevealResult;
  content: UISettingRevealResultContent;
};

export type WebsocketMsg =
  | WebsocketMsgCurrentAddressUpdate
  | WebsocketMsgRealtimeUIChange
  | WebsocketMsgRealtimeDependencyEvent
  | WebsocketMsgUISettingRevealResult;

export type FrontendWebsocketMsgUnion = {
  id?: string | null;
  messageType: WebsocketMsgTypeForFrontend;
  content: any;
};

type SafeParseSuccess<T> = {
  success: true;
  data: T;
};

type SafeParseFailure = {
  success: false;
  error: {
    issues: Array<string>;
  };
};

type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

function websocketSupportIsRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function websocketSupportReadRequiredString(
  value: unknown,
  fieldName: string,
  issues: Array<string>,
): string {
  if (typeof value === "string") {
    return value;
  }
  issues.push(fieldName + " must be a string.");
  return "";
}

function websocketSupportReadOptionalString(
  value: unknown,
  fieldName: string,
  issues: Array<string>,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  issues.push(fieldName + " must be a string or null.");
  return null;
}

function websocketSupportReadDurationMs(
  value: unknown,
  issues: Array<string>,
): number {
  if (value === undefined) {
    return 3000;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  issues.push("durationMs must be a finite number.");
  return 3000;
}

function websocketSupportReadActivationSteps(
  value: unknown,
  fieldName: string,
  issues: Array<string>,
): Array<UISettingRevealActivationStep> {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push(fieldName + " must be an array.");
    return [];
  }
  const steps: Array<UISettingRevealActivationStep> = [];
  value.forEach((entry, index) => {
    if (!websocketSupportIsRecord(entry)) {
      issues.push(fieldName + "[" + index + "] must be an object.");
      return;
    }
    steps.push({
      type: websocketSupportReadRequiredString(
        entry.type,
        fieldName + "[" + index + "].type",
        issues,
      ),
      itemValue: websocketSupportReadRequiredString(
        entry.itemValue,
        fieldName + "[" + index + "].itemValue",
        issues,
      ),
    });
  });
  return steps;
}

function websocketSupportReadRevealTargets(
  value: unknown,
  issues: Array<string>,
): Array<UISettingRevealTarget> {
  if (!Array.isArray(value)) {
    issues.push("reveals must be an array.");
    return [];
  }
  const targets: Array<UISettingRevealTarget> = [];
  value.forEach((entry, index) => {
    if (!websocketSupportIsRecord(entry)) {
      issues.push("reveals[" + index + "] must be an object.");
      return;
    }
    targets.push({
      settingId: websocketSupportReadRequiredString(
        entry.settingId,
        "reveals[" + index + "].settingId",
        issues,
      ),
      side: websocketSupportReadRequiredString(
        entry.side,
        "reveals[" + index + "].side",
        issues,
      ),
      overviewTabKey: websocketSupportReadOptionalString(
        entry.overviewTabKey,
        "reveals[" + index + "].overviewTabKey",
        issues,
      ),
      uiEditorTabName: websocketSupportReadOptionalString(
        entry.uiEditorTabName,
        "reveals[" + index + "].uiEditorTabName",
        issues,
      ),
      pluginId: websocketSupportReadOptionalString(
        entry.pluginId,
        "reveals[" + index + "].pluginId",
        issues,
      ),
      paneId: websocketSupportReadOptionalString(
        entry.paneId,
        "reveals[" + index + "].paneId",
        issues,
      ),
      strategy: websocketSupportReadRequiredString(
        entry.strategy,
        "reveals[" + index + "].strategy",
        issues,
      ),
      anchorId: websocketSupportReadOptionalString(
        entry.anchorId,
        "reveals[" + index + "].anchorId",
        issues,
      ),
      pluginRevealKey: websocketSupportReadOptionalString(
        entry.pluginRevealKey,
        "reveals[" + index + "].pluginRevealKey",
        issues,
      ),
      revealActivationSteps: websocketSupportReadActivationSteps(
        entry.revealActivationSteps,
        "reveals[" + index + "].revealActivationSteps",
        issues,
      ),
    });
  });
  return targets;
}

export const UISettingRevealContentSchema = {
  safeParse(value: unknown): SafeParseResult<UISettingRevealContent> {
    if (!websocketSupportIsRecord(value)) {
      return {
        success: false,
        error: {
          issues: ["Expected UISettingRevealContent object."],
        },
      };
    }

    const issues: Array<string> = [];
    const parsed: UISettingRevealContent = {
      projectConfigId: websocketSupportReadRequiredString(
        value.projectConfigId,
        "projectConfigId",
        issues,
      ),
      chatId: websocketSupportReadOptionalString(value.chatId, "chatId", issues),
      activeSectionId: websocketSupportReadOptionalString(
        value.activeSectionId,
        "activeSectionId",
        issues,
      ),
      reveals: websocketSupportReadRevealTargets(value.reveals, issues),
      durationMs: websocketSupportReadDurationMs(value.durationMs, issues),
      requestId: websocketSupportReadRequiredString(
        value.requestId,
        "requestId",
        issues,
      ),
    };

    if (issues.length > 0) {
      return {
        success: false,
        error: {
          issues,
        },
      };
    }

    return {
      success: true,
      data: parsed,
    };
  },
};

export const DependencyEventSchema = {
  shape: {
    dependencyKey: true,
    payload: true,
    timestampMs: true,
  },
  safeParse(value: unknown): SafeParseResult<DependencyEvent> {
    if (!websocketSupportIsRecord(value)) {
      return {
        success: false,
        error: {
          issues: ["Expected DependencyEvent object."],
        },
      };
    }

    const issues: Array<string> = [];
    if (!("dependencyKey" in value)) {
      issues.push("dependencyKey is required.");
    }
    if (
      !("timestampMs" in value) ||
      typeof value.timestampMs !== "number" ||
      !Number.isFinite(value.timestampMs)
    ) {
      issues.push("timestampMs must be a finite number.");
    }

    if (issues.length > 0) {
      return {
        success: false,
        error: {
          issues,
        },
      };
    }

    return {
      success: true,
      data: {
        dependencyKey: value.dependencyKey as BaseDependencyKeyUnion,
        payload:
          value.payload === undefined || value.payload === null
            ? null
            : (value.payload as BaseDependencyValueUnion),
        timestampMs: value.timestampMs as number,
      },
    };
  },
};
`
