package frontendbindings

import (
	_ "embed"

	"setta/internal/realtime"
)

//go:embed templates/websocket_support_read_activation_steps.ts.tmpl
var websocketSupportReadActivationStepsTemplate string

//go:embed templates/websocket_support_read_reveal_targets.ts.tmpl
var websocketSupportReadRevealTargetsTemplate string

//go:embed templates/websocket_support_ui_setting_reveal_content_schema.ts.tmpl
var websocketSupportUISettingRevealContentSchemaTemplate string

//go:embed templates/websocket_support_dependency_event_schema.ts.tmpl
var websocketSupportDependencyEventSchemaTemplate string

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
	WebsocketMsgTypeForFrontendAgentRunUpdated              WebsocketMsgTypeForFrontend = "AgentRunUpdated"
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

type UISettingRevealActivationStep realtime.UISettingRevealActivationStep

type UISettingRevealTarget realtime.UISettingRevealTarget

type UISettingRevealContent realtime.UISettingRevealContent

type UISettingRevealResultStatus realtime.UISettingRevealResultStatus

type UISettingRevealResultContent realtime.UISettingRevealResultContent

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

type websocketStringFieldRenderData struct {
	PropertyName  string
	ValueExpr     string
	FieldPathExpr string
	Optional      bool
}

type websocketUISettingRevealContentSchemaTemplateData struct {
	LeadingStringFields  []websocketStringFieldRenderData
	TrailingStringFields []websocketStringFieldRenderData
}

type websocketDependencyEventSchemaTemplateData struct {
	FieldNames []string
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

func buildWebsocketStringFieldRenderData(
	valueExprBase string,
	fieldPathBase string,
	specs []websocketStringFieldSpec,
) []websocketStringFieldRenderData {
	fields := make([]websocketStringFieldRenderData, 0, len(specs))
	for _, spec := range specs {
		fields = append(fields, websocketStringFieldRenderData{
			PropertyName: spec.PropertyName,
			ValueExpr:    valueExprBase + "." + spec.PropertyName,
			FieldPathExpr: websocketIndexedFieldPathExpr(
				fieldPathBase,
				spec.PropertyName,
			),
			Optional: spec.Optional,
		})
	}
	return fields
}

func buildWebsocketRootStringFieldRenderData(
	propertyName string,
	optional bool,
) websocketStringFieldRenderData {
	return websocketStringFieldRenderData{
		PropertyName:  propertyName,
		ValueExpr:     "value." + propertyName,
		FieldPathExpr: websocketLiteralStringExpr(propertyName),
		Optional:      optional,
	}
}

func websocketSafeParseDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		localAliasDeclaration("SafeParseSuccess", "<T>", `{
  success: true;
  data: T;
}`),
		localAliasDeclaration("SafeParseFailure", "", `{
  success: false;
  error: {
    issues: Array<string>;
  };
}`),
		localAliasDeclaration("SafeParseResult", "<T>", "SafeParseSuccess<T> | SafeParseFailure"),
	}
}

func buildWebsocketSupportIsRecordBodyTS() string {
	return "  return generatedBindingRuntime.websocketSupportIsRecord(value);"
}

func buildWebsocketSupportReadRequiredStringBodyTS() string {
	return "  return generatedBindingRuntime.websocketSupportReadRequiredString(value, fieldName, issues);"
}

func buildWebsocketSupportReadOptionalStringBodyTS() string {
	return "  return generatedBindingRuntime.websocketSupportReadOptionalString(value, fieldName, issues);"
}

func buildWebsocketSupportReadDurationMsBodyTS() string {
	return "  return generatedBindingRuntime.websocketSupportReadDurationMs(value, issues);"
}

func buildWebsocketReadActivationStepsBodyTS() string {
	return mustRenderFrontendBindingTemplate(
		"websocketSupportReadActivationSteps",
		websocketSupportReadActivationStepsTemplate,
		struct {
			Fields []websocketStringFieldRenderData
		}{
			Fields: buildWebsocketStringFieldRenderData(
				"entry",
				`fieldName + "[" + index`,
				uiSettingRevealActivationStepFieldSpecs,
			),
		},
	)
}

func buildWebsocketReadRevealTargetsBodyTS() string {
	return mustRenderFrontendBindingTemplate(
		"websocketSupportReadRevealTargets",
		websocketSupportReadRevealTargetsTemplate,
		struct {
			Fields                             []websocketStringFieldRenderData
			RevealActivationStepsFieldPathExpr string
		}{
			Fields: buildWebsocketStringFieldRenderData(
				"entry",
				`"reveals[" + index`,
				uiSettingRevealTargetFieldSpecs,
			),
			RevealActivationStepsFieldPathExpr: websocketIndexedFieldPathExpr(
				`"reveals[" + index`,
				"revealActivationSteps",
			),
		},
	)
}

func buildUISettingRevealContentSchemaExprTS() string {
	return mustRenderFrontendBindingTemplate(
		"UISettingRevealContentSchema",
		websocketSupportUISettingRevealContentSchemaTemplate,
		websocketUISettingRevealContentSchemaTemplateData{
			LeadingStringFields: []websocketStringFieldRenderData{
				buildWebsocketRootStringFieldRenderData("projectConfigId", false),
				buildWebsocketRootStringFieldRenderData("chatId", true),
				buildWebsocketRootStringFieldRenderData("activeSectionId", true),
			},
			TrailingStringFields: []websocketStringFieldRenderData{
				buildWebsocketRootStringFieldRenderData("requestId", false),
			},
		},
	)
}

func buildDependencyEventSchemaExprTS() string {
	return mustRenderFrontendBindingTemplate(
		"DependencyEventSchema",
		websocketSupportDependencyEventSchemaTemplate,
		websocketDependencyEventSchemaTemplateData{
			FieldNames: []string{"dependencyKey", "payload", "timestampMs"},
		},
	)
}

func websocketSupportDeclarations() []TypeDeclaration {
	declarations := append([]TypeDeclaration{}, websocketSafeParseDeclarations()...)
	declarations = append(
		declarations,
		functionDeclaration(
			"websocketSupportIsRecord",
			false,
			"value is Record<string, unknown>",
			buildWebsocketSupportIsRecordBodyTS(),
			TypeProperty{Name: "value", TypeExpr: "unknown"},
		),
		functionDeclaration(
			"websocketSupportReadRequiredString",
			false,
			"string",
			buildWebsocketSupportReadRequiredStringBodyTS(),
			TypeProperty{Name: "value", TypeExpr: "unknown"},
			TypeProperty{Name: "fieldName", TypeExpr: "string"},
			TypeProperty{Name: "issues", TypeExpr: "Array<string>"},
		),
		functionDeclaration(
			"websocketSupportReadOptionalString",
			false,
			"string | null",
			buildWebsocketSupportReadOptionalStringBodyTS(),
			TypeProperty{Name: "value", TypeExpr: "unknown"},
			TypeProperty{Name: "fieldName", TypeExpr: "string"},
			TypeProperty{Name: "issues", TypeExpr: "Array<string>"},
		),
		functionDeclaration(
			"websocketSupportReadDurationMs",
			false,
			"number",
			buildWebsocketSupportReadDurationMsBodyTS(),
			TypeProperty{Name: "value", TypeExpr: "unknown"},
			TypeProperty{Name: "issues", TypeExpr: "Array<string>"},
		),
		functionDeclaration(
			"websocketSupportReadActivationSteps",
			false,
			"Array<UISettingRevealActivationStep>",
			buildWebsocketReadActivationStepsBodyTS(),
			TypeProperty{Name: "value", TypeExpr: "unknown"},
			TypeProperty{Name: "fieldName", TypeExpr: "string"},
			TypeProperty{Name: "issues", TypeExpr: "Array<string>"},
		),
		functionDeclaration(
			"websocketSupportReadRevealTargets",
			false,
			"Array<UISettingRevealTarget>",
			buildWebsocketReadRevealTargetsBodyTS(),
			TypeProperty{Name: "value", TypeExpr: "unknown"},
			TypeProperty{Name: "issues", TypeExpr: "Array<string>"},
		),
		constDeclaration("UISettingRevealContentSchema", true, buildUISettingRevealContentSchemaExprTS()),
		constDeclaration("DependencyEventSchema", true, buildDependencyEventSchemaExprTS()),
	)
	return declarations
}
