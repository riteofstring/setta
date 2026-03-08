package frontendbindings

type WebsocketConnectionType string

const (
	WebsocketConnectionTypeCLI          WebsocketConnectionType = "CLI"
	WebsocketConnectionTypeServer       WebsocketConnectionType = "SERVER"
	WebsocketConnectionTypePythonLogger WebsocketConnectionType = "PYTHON_LOGGER"
	WebsocketConnectionTypePythonScript WebsocketConnectionType = "PYTHON_SCRIPT"
	WebsocketConnectionTypeFrontend     WebsocketConnectionType = "FRONTEND"
)

type WebsocketMsgTypeForFrontend string

const (
	WebsocketMsgTypeForFrontendAllConnections               WebsocketMsgTypeForFrontend = "AllConnections"
	WebsocketMsgTypeForFrontendFrontendIdentity             WebsocketMsgTypeForFrontend = "FrontendIdentity"
	WebsocketMsgTypeForFrontendNotification                 WebsocketMsgTypeForFrontend = "Notification"
	WebsocketMsgTypeForFrontendLLMStreamingResponse         WebsocketMsgTypeForFrontend = "LLMStreamingResponse"
	WebsocketMsgTypeForFrontendLSPDiagnostics               WebsocketMsgTypeForFrontend = "LSPDiagnostics"
	WebsocketMsgTypeForFrontendNameValidationErrors         WebsocketMsgTypeForFrontend = "NameValidationErrors"
	WebsocketMsgTypeForFrontendReturnRenameRefactor         WebsocketMsgTypeForFrontend = "ReturnRenameRefactorResults"
	WebsocketMsgTypeForFrontendTerminalMetadata             WebsocketMsgTypeForFrontend = "TerminalMetadata"
	WebsocketMsgTypeForFrontendUpdateFrontendProjectState   WebsocketMsgTypeForFrontend = "UpdateFrontendProjectState"
	WebsocketMsgTypeForFrontendUpdateSettings               WebsocketMsgTypeForFrontend = "UpdateSettings"
	WebsocketMsgTypeForFrontendAllProjectMetadata           WebsocketMsgTypeForFrontend = "AllProjectMetadata"
	WebsocketMsgTypeForFrontendUpdateArtifacts              WebsocketMsgTypeForFrontend = "UpdateArtifacts"
	WebsocketMsgTypeForFrontendListenerCoverageSnapshot     WebsocketMsgTypeForFrontend = "ListenerCoverageSnapshot"
	WebsocketMsgTypeForFrontendLLMConfigUpdated             WebsocketMsgTypeForFrontend = "LLMConfigUpdated"
	WebsocketMsgTypeForFrontendLLMAPIKeysUpdated            WebsocketMsgTypeForFrontend = "LLMApiKeysUpdated"
	WebsocketMsgTypeForFrontendBackendLogEvent              WebsocketMsgTypeForFrontend = "BackendLogEvent"
	WebsocketMsgTypeForFrontendAIFollowToolArguments        WebsocketMsgTypeForFrontend = "AIFollowToolArgumentsUpdate"
	WebsocketMsgTypeForFrontendAIFollowToolResult           WebsocketMsgTypeForFrontend = "AIFollowToolResultUpdate"
	WebsocketMsgTypeForFrontendUISettingReveal              WebsocketMsgTypeForFrontend = "UISettingReveal"
	WebsocketMsgTypeForFrontendAgentProfilesUpdated         WebsocketMsgTypeForFrontend = "AgentProfilesUpdated"
	WebsocketMsgTypeForFrontendPromptTemplatesUpdated       WebsocketMsgTypeForFrontend = "PromptTemplatesUpdated"
	WebsocketMsgTypeForFrontendExternalAgentConfigsUpdated  WebsocketMsgTypeForFrontend = "ExternalAgentConfigsUpdated"
	WebsocketMsgTypeForFrontendEngineConfigsUpdated         WebsocketMsgTypeForFrontend = "EngineConfigsUpdated"
	WebsocketMsgTypeForFrontendTranscriptionProfilesUpdated WebsocketMsgTypeForFrontend = "TranscriptionProfilesUpdated"
)

type WebsocketMsgTypeForBackend string

const (
	WebsocketMsgTypeForBackendCurrentAddressUpdate    WebsocketMsgTypeForBackend = "CurrentAddressUpdate"
	WebsocketMsgTypeForBackendUISettingRevealResult   WebsocketMsgTypeForBackend = "UISettingRevealResult"
	WebsocketMsgTypeForBackendRealtimeUIChange        WebsocketMsgTypeForBackend = "RealtimeUIChange"
	WebsocketMsgTypeForBackendRealtimeDependencyEvent WebsocketMsgTypeForBackend = "RealtimeDependencyEvent"
)

type WebsocketConnectionInfo struct {
	ID             string                  `json:"id"`
	ConnectionType WebsocketConnectionType `json:"connectionType"`
	CurrentAddress *string                 `json:"currentAddress"`
	ShareSessionID *string                 `json:"shareSessionId"`
}

type WebsocketMsgCurrentAddressUpdate struct {
	ID          *string                    `json:"id,omitempty"`
	MessageType WebsocketMsgTypeForBackend `json:"messageType"`
	Content     string                     `json:"content"`
}

type UISettingRevealActivationStep struct {
	Type      string `json:"type"`
	ItemValue string `json:"itemValue"`
}

type UISettingRevealTarget struct {
	SettingID             string                          `json:"settingId"`
	Side                  string                          `json:"side"`
	OverviewTabKey        *string                         `json:"overviewTabKey,omitempty"`
	UIEditorTabName       *string                         `json:"uiEditorTabName,omitempty"`
	PluginID              *string                         `json:"pluginId,omitempty"`
	PaneID                *string                         `json:"paneId,omitempty"`
	Strategy              string                          `json:"strategy"`
	AnchorID              *string                         `json:"anchorId,omitempty"`
	PluginRevealKey       *string                         `json:"pluginRevealKey,omitempty"`
	RevealActivationSteps []UISettingRevealActivationStep `json:"revealActivationSteps"`
}

type UISettingRevealContent struct {
	ProjectConfigID string                  `json:"projectConfigId"`
	ChatID          *string                 `json:"chatId,omitempty"`
	ActiveSectionID *string                 `json:"activeSectionId,omitempty"`
	Reveals         []UISettingRevealTarget `json:"reveals"`
	DurationMS      int                     `json:"durationMs"`
	RequestID       string                  `json:"requestId"`
}

type UISettingRevealResultStatus struct {
	SettingID    string  `json:"settingId"`
	Status       string  `json:"status"`
	ErrorCode    *string `json:"errorCode,omitempty"`
	ErrorMessage *string `json:"errorMessage,omitempty"`
}

type UISettingRevealResultContent struct {
	ProjectConfigID string                        `json:"projectConfigId"`
	RequestID       string                        `json:"requestId"`
	Statuses        []UISettingRevealResultStatus `json:"statuses"`
}

type WebsocketMsgRealtimeUIChangeContent struct {
	ProjectConfigID string                   `json:"projectConfigId"`
	DependencyKey   BaseDependencyKeyUnion   `json:"dependencyKey"`
	Value           BaseDependencyValueUnion `json:"value"`
}

type WebsocketMsgRealtimeUIChange struct {
	ID          *string                             `json:"id,omitempty"`
	MessageType WebsocketMsgTypeForBackend          `json:"messageType"`
	Content     WebsocketMsgRealtimeUIChangeContent `json:"content"`
}

type WebsocketMsgRealtimeDependencyEventContent struct {
	ProjectConfigID string          `json:"projectConfigId"`
	DependencyEvent DependencyEvent `json:"dependencyEvent"`
}

type WebsocketMsgRealtimeDependencyEvent struct {
	ID          *string                                    `json:"id,omitempty"`
	MessageType WebsocketMsgTypeForBackend                 `json:"messageType"`
	Content     WebsocketMsgRealtimeDependencyEventContent `json:"content"`
}

type WebsocketMsgUISettingRevealResult struct {
	ID          *string                      `json:"id,omitempty"`
	MessageType WebsocketMsgTypeForBackend   `json:"messageType"`
	Content     UISettingRevealResultContent `json:"content"`
}

type WebsocketMsg struct{}

type FrontendWebsocketMsgUnion struct{}

const websocketFrontendSupportSchemaTS = `

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

func websocketSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		rawDeclaration("WebsocketSupportSchemas", websocketFrontendSupportSchemaTS),
	}
}
