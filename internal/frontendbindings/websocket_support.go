package frontendbindings

import "strings"

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

type websocketStringFieldSpec struct {
	PropertyName string
	Optional     bool
}

var uiSettingRevealActivationStepFieldSpecs = []websocketStringFieldSpec{
	{PropertyName: "type"},
	{PropertyName: "itemValue"},
}

var uiSettingRevealTargetFieldSpecs = []websocketStringFieldSpec{
	{PropertyName: "settingId"},
	{PropertyName: "side"},
	{PropertyName: "overviewTabKey", Optional: true},
	{PropertyName: "uiEditorTabName", Optional: true},
	{PropertyName: "pluginId", Optional: true},
	{PropertyName: "paneId", Optional: true},
	{PropertyName: "strategy"},
	{PropertyName: "anchorId", Optional: true},
	{PropertyName: "pluginRevealKey", Optional: true},
}

func websocketLiteralStringExpr(value string) string {
	return `"` + value + `"`
}

func websocketIndexedFieldPathExpr(baseExpr string, propertyName string) string {
	return baseExpr + ` + "].` + propertyName + `"`
}

func writeWebsocketStringFieldReadTS(
	builder *strings.Builder,
	indent string,
	propertyName string,
	valueExpr string,
	fieldPathExpr string,
	optional bool,
) {
	builder.WriteString(indent)
	builder.WriteString(propertyName)
	builder.WriteString(": ")
	if optional {
		builder.WriteString("websocketSupportReadOptionalString(\n")
	} else {
		builder.WriteString("websocketSupportReadRequiredString(\n")
	}
	innerIndent := indent + "  "
	builder.WriteString(innerIndent)
	builder.WriteString(valueExpr)
	builder.WriteString(",\n")
	builder.WriteString(innerIndent)
	builder.WriteString(fieldPathExpr)
	builder.WriteString(",\n")
	builder.WriteString(innerIndent)
	builder.WriteString("issues,\n")
	builder.WriteString(indent)
	builder.WriteString("),\n")
}

func buildWebsocketSafeParseTypesTS() string {
	var builder strings.Builder
	builder.WriteString("type SafeParseSuccess<T> = {\n")
	builder.WriteString("  success: true;\n")
	builder.WriteString("  data: T;\n")
	builder.WriteString("};\n\n")
	builder.WriteString("type SafeParseFailure = {\n")
	builder.WriteString("  success: false;\n")
	builder.WriteString("  error: {\n")
	builder.WriteString("    issues: Array<string>;\n")
	builder.WriteString("  };\n")
	builder.WriteString("};\n\n")
	builder.WriteString("type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;")
	return builder.String()
}

func buildWebsocketSchemaHelperFunctionsTS() string {
	var builder strings.Builder
	builder.WriteString("function websocketSupportIsRecord(\n")
	builder.WriteString("  value: unknown,\n")
	builder.WriteString("): value is Record<string, unknown> {\n")
	builder.WriteString("  return value !== null && typeof value === \"object\" && !Array.isArray(value);\n")
	builder.WriteString("}\n\n")
	builder.WriteString("function websocketSupportReadRequiredString(\n")
	builder.WriteString("  value: unknown,\n")
	builder.WriteString("  fieldName: string,\n")
	builder.WriteString("  issues: Array<string>,\n")
	builder.WriteString("): string {\n")
	builder.WriteString("  if (typeof value === \"string\") {\n")
	builder.WriteString("    return value;\n")
	builder.WriteString("  }\n")
	builder.WriteString("  issues.push(fieldName + \" must be a string.\");\n")
	builder.WriteString("  return \"\";\n")
	builder.WriteString("}\n\n")
	builder.WriteString("function websocketSupportReadOptionalString(\n")
	builder.WriteString("  value: unknown,\n")
	builder.WriteString("  fieldName: string,\n")
	builder.WriteString("  issues: Array<string>,\n")
	builder.WriteString("): string | null {\n")
	builder.WriteString("  if (value === undefined || value === null) {\n")
	builder.WriteString("    return null;\n")
	builder.WriteString("  }\n")
	builder.WriteString("  if (typeof value === \"string\") {\n")
	builder.WriteString("    return value;\n")
	builder.WriteString("  }\n")
	builder.WriteString("  issues.push(fieldName + \" must be a string or null.\");\n")
	builder.WriteString("  return null;\n")
	builder.WriteString("}\n\n")
	builder.WriteString("function websocketSupportReadDurationMs(\n")
	builder.WriteString("  value: unknown,\n")
	builder.WriteString("  issues: Array<string>,\n")
	builder.WriteString("): number {\n")
	builder.WriteString("  if (value === undefined) {\n")
	builder.WriteString("    return 3000;\n")
	builder.WriteString("  }\n")
	builder.WriteString("  if (typeof value === \"number\" && Number.isFinite(value)) {\n")
	builder.WriteString("    return value;\n")
	builder.WriteString("  }\n")
	builder.WriteString("  issues.push(\"durationMs must be a finite number.\");\n")
	builder.WriteString("  return 3000;\n")
	builder.WriteString("}")
	return builder.String()
}

func buildWebsocketReadActivationStepsTS() string {
	var builder strings.Builder
	builder.WriteString("function websocketSupportReadActivationSteps(\n")
	builder.WriteString("  value: unknown,\n")
	builder.WriteString("  fieldName: string,\n")
	builder.WriteString("  issues: Array<string>,\n")
	builder.WriteString("): Array<UISettingRevealActivationStep> {\n")
	builder.WriteString("  if (value === undefined) {\n")
	builder.WriteString("    return [];\n")
	builder.WriteString("  }\n")
	builder.WriteString("  if (!Array.isArray(value)) {\n")
	builder.WriteString("    issues.push(fieldName + \" must be an array.\");\n")
	builder.WriteString("    return [];\n")
	builder.WriteString("  }\n")
	builder.WriteString("  const steps: Array<UISettingRevealActivationStep> = [];\n")
	builder.WriteString("  value.forEach((entry, index) => {\n")
	builder.WriteString("    if (!websocketSupportIsRecord(entry)) {\n")
	builder.WriteString("      issues.push(fieldName + \"[\" + index + \"] must be an object.\");\n")
	builder.WriteString("      return;\n")
	builder.WriteString("    }\n")
	builder.WriteString("    steps.push({\n")
	for _, spec := range uiSettingRevealActivationStepFieldSpecs {
		writeWebsocketStringFieldReadTS(
			&builder,
			"      ",
			spec.PropertyName,
			"entry."+spec.PropertyName,
			websocketIndexedFieldPathExpr(`fieldName + "[" + index`, spec.PropertyName),
			spec.Optional,
		)
	}
	builder.WriteString("    });\n")
	builder.WriteString("  });\n")
	builder.WriteString("  return steps;\n")
	builder.WriteString("}")
	return builder.String()
}

func buildWebsocketReadRevealTargetsTS() string {
	var builder strings.Builder
	builder.WriteString("function websocketSupportReadRevealTargets(\n")
	builder.WriteString("  value: unknown,\n")
	builder.WriteString("  issues: Array<string>,\n")
	builder.WriteString("): Array<UISettingRevealTarget> {\n")
	builder.WriteString("  if (!Array.isArray(value)) {\n")
	builder.WriteString("    issues.push(\"reveals must be an array.\");\n")
	builder.WriteString("    return [];\n")
	builder.WriteString("  }\n")
	builder.WriteString("  const targets: Array<UISettingRevealTarget> = [];\n")
	builder.WriteString("  value.forEach((entry, index) => {\n")
	builder.WriteString("    if (!websocketSupportIsRecord(entry)) {\n")
	builder.WriteString("      issues.push(\"reveals[\" + index + \"] must be an object.\");\n")
	builder.WriteString("      return;\n")
	builder.WriteString("    }\n")
	builder.WriteString("    targets.push({\n")
	for _, spec := range uiSettingRevealTargetFieldSpecs {
		writeWebsocketStringFieldReadTS(
			&builder,
			"      ",
			spec.PropertyName,
			"entry."+spec.PropertyName,
			websocketIndexedFieldPathExpr(`"reveals[" + index`, spec.PropertyName),
			spec.Optional,
		)
	}
	builder.WriteString("      revealActivationSteps: websocketSupportReadActivationSteps(\n")
	builder.WriteString("        entry.revealActivationSteps,\n")
	builder.WriteString("        ")
	builder.WriteString(websocketIndexedFieldPathExpr(`"reveals[" + index`, "revealActivationSteps"))
	builder.WriteString(",\n")
	builder.WriteString("        issues,\n")
	builder.WriteString("      ),\n")
	builder.WriteString("    });\n")
	builder.WriteString("  });\n")
	builder.WriteString("  return targets;\n")
	builder.WriteString("}")
	return builder.String()
}

func buildUISettingRevealContentSchemaTS() string {
	var builder strings.Builder
	builder.WriteString("export const UISettingRevealContentSchema = {\n")
	builder.WriteString("  safeParse(value: unknown): SafeParseResult<UISettingRevealContent> {\n")
	builder.WriteString("    if (!websocketSupportIsRecord(value)) {\n")
	builder.WriteString("      return {\n")
	builder.WriteString("        success: false,\n")
	builder.WriteString("        error: {\n")
	builder.WriteString("          issues: [\"Expected UISettingRevealContent object.\"],\n")
	builder.WriteString("        },\n")
	builder.WriteString("      };\n")
	builder.WriteString("    }\n\n")
	builder.WriteString("    const issues: Array<string> = [];\n")
	builder.WriteString("    const parsed: UISettingRevealContent = {\n")
	writeWebsocketStringFieldReadTS(&builder, "      ", "projectConfigId", "value.projectConfigId", websocketLiteralStringExpr("projectConfigId"), false)
	writeWebsocketStringFieldReadTS(&builder, "      ", "chatId", "value.chatId", websocketLiteralStringExpr("chatId"), true)
	writeWebsocketStringFieldReadTS(&builder, "      ", "activeSectionId", "value.activeSectionId", websocketLiteralStringExpr("activeSectionId"), true)
	builder.WriteString("      reveals: websocketSupportReadRevealTargets(value.reveals, issues),\n")
	builder.WriteString("      durationMs: websocketSupportReadDurationMs(value.durationMs, issues),\n")
	writeWebsocketStringFieldReadTS(&builder, "      ", "requestId", "value.requestId", websocketLiteralStringExpr("requestId"), false)
	builder.WriteString("    };\n\n")
	builder.WriteString("    if (issues.length > 0) {\n")
	builder.WriteString("      return {\n")
	builder.WriteString("        success: false,\n")
	builder.WriteString("        error: {\n")
	builder.WriteString("          issues,\n")
	builder.WriteString("        },\n")
	builder.WriteString("      };\n")
	builder.WriteString("    }\n\n")
	builder.WriteString("    return {\n")
	builder.WriteString("      success: true,\n")
	builder.WriteString("      data: parsed,\n")
	builder.WriteString("    };\n")
	builder.WriteString("  },\n")
	builder.WriteString("};")
	return builder.String()
}

func buildDependencyEventSchemaTS() string {
	var builder strings.Builder
	builder.WriteString("export const DependencyEventSchema = {\n")
	builder.WriteString("  shape: {\n")
	for _, fieldName := range []string{"dependencyKey", "payload", "timestampMs"} {
		builder.WriteString("    ")
		builder.WriteString(fieldName)
		builder.WriteString(": true,\n")
	}
	builder.WriteString("  },\n")
	builder.WriteString("  safeParse(value: unknown): SafeParseResult<DependencyEvent> {\n")
	builder.WriteString("    if (!websocketSupportIsRecord(value)) {\n")
	builder.WriteString("      return {\n")
	builder.WriteString("        success: false,\n")
	builder.WriteString("        error: {\n")
	builder.WriteString("          issues: [\"Expected DependencyEvent object.\"],\n")
	builder.WriteString("        },\n")
	builder.WriteString("      };\n")
	builder.WriteString("    }\n\n")
	builder.WriteString("    const issues: Array<string> = [];\n")
	builder.WriteString("    if (!(\"dependencyKey\" in value)) {\n")
	builder.WriteString("      issues.push(\"dependencyKey is required.\");\n")
	builder.WriteString("    }\n")
	builder.WriteString("    if (\n")
	builder.WriteString("      !(\"timestampMs\" in value) ||\n")
	builder.WriteString("      typeof value.timestampMs !== \"number\" ||\n")
	builder.WriteString("      !Number.isFinite(value.timestampMs)\n")
	builder.WriteString("    ) {\n")
	builder.WriteString("      issues.push(\"timestampMs must be a finite number.\");\n")
	builder.WriteString("    }\n\n")
	builder.WriteString("    if (issues.length > 0) {\n")
	builder.WriteString("      return {\n")
	builder.WriteString("        success: false,\n")
	builder.WriteString("        error: {\n")
	builder.WriteString("          issues,\n")
	builder.WriteString("        },\n")
	builder.WriteString("      };\n")
	builder.WriteString("    }\n\n")
	builder.WriteString("    return {\n")
	builder.WriteString("      success: true,\n")
	builder.WriteString("      data: {\n")
	builder.WriteString("        dependencyKey: value.dependencyKey as BaseDependencyKeyUnion,\n")
	builder.WriteString("        payload:\n")
	builder.WriteString("          value.payload === undefined || value.payload === null\n")
	builder.WriteString("            ? null\n")
	builder.WriteString("            : (value.payload as BaseDependencyValueUnion),\n")
	builder.WriteString("        timestampMs: value.timestampMs as number,\n")
	builder.WriteString("      },\n")
	builder.WriteString("    };\n")
	builder.WriteString("  },\n")
	builder.WriteString("};")
	return builder.String()
}

func websocketSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		rawDeclaration("WebsocketSafeParseTypes", buildWebsocketSafeParseTypesTS()),
		rawDeclaration("WebsocketSchemaHelpers", buildWebsocketSchemaHelperFunctionsTS()),
		rawDeclaration("WebsocketActivationStepSchemaHelper", buildWebsocketReadActivationStepsTS()),
		rawDeclaration("WebsocketRevealTargetSchemaHelper", buildWebsocketReadRevealTargetsTS()),
		rawDeclaration("UISettingRevealContentSchemaSupport", buildUISettingRevealContentSchemaTS()),
		rawDeclaration("DependencyEventSchemaSupport", buildDependencyEventSchemaTS()),
	}
}
