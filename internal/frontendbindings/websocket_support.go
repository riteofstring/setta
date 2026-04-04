package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"

	"setta/internal/realtime"
)

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
	ProjectConfigID string                            `json:"projectConfigId"`
	DependencyKey   realtime.BaseDependencyKeyUnion   `json:"dependencyKey"`
	Value           realtime.BaseDependencyValueUnion `json:"value"`
}

type WebsocketMsgRealtimeUIChange struct {
	ID          *string                             `json:"id,omitempty"`
	MessageType WebsocketMsgTypeForBackend          `json:"messageType"`
	Content     WebsocketMsgRealtimeUIChangeContent `json:"content"`
}

type WebsocketMsgRealtimeDependencyEventContent struct {
	ProjectConfigID string                   `json:"projectConfigId"`
	DependencyEvent realtime.DependencyEvent `json:"dependencyEvent"`
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

type websocketJSONFieldSpec struct {
	PropertyName string
	Optional     bool
	Type         reflect.Type
}

var (
	realtimeUISettingRevealActivationStepType = reflect.TypeOf(realtime.UISettingRevealActivationStep{})
	realtimeUISettingRevealTargetType         = reflect.TypeOf(realtime.UISettingRevealTarget{})
)

func websocketIndexedFieldPathExpr(baseExpr string, propertyName string) string {
	return baseExpr + ` + "].` + propertyName + `"`
}

func mustWebsocketJSONFieldSpecs(structType reflect.Type) []websocketJSONFieldSpec {
	if structType.Kind() != reflect.Struct {
		panic(fmt.Sprintf("websocket schema support requires a struct type, got %s", structType))
	}
	fields := make([]websocketJSONFieldSpec, 0, structType.NumField())
	for index := 0; index < structType.NumField(); index++ {
		field := structType.Field(index)
		if !field.IsExported() {
			continue
		}
		propertyName, optional, include := websocketJSONFieldInfo(field)
		if !include {
			continue
		}
		fields = append(fields, websocketJSONFieldSpec{
			PropertyName: propertyName,
			Optional:     optional,
			Type:         field.Type,
		})
	}
	return fields
}

func websocketJSONFieldInfo(field reflect.StructField) (string, bool, bool) {
	tag := strings.TrimSpace(field.Tag.Get("json"))
	if tag == "" {
		panic(fmt.Sprintf("websocket schema support requires json tag on %s", field.Name))
	}
	parts := strings.Split(tag, ",")
	name := strings.TrimSpace(parts[0])
	if name == "" {
		panic(fmt.Sprintf("websocket schema support requires a json field name on %s", field.Name))
	}
	if name == "-" {
		return "", false, false
	}
	optional := false
	for _, option := range parts[1:] {
		if strings.TrimSpace(option) == "omitempty" {
			optional = true
		}
	}
	return name, optional, true
}

func websocketFieldSupportsStringReader(field websocketJSONFieldSpec) bool {
	return field.Type.Kind() == reflect.String ||
		(field.Type.Kind() == reflect.Pointer && field.Type.Elem().Kind() == reflect.String)
}

func writeWebsocketStringFieldAssignment(
	builder *strings.Builder,
	indent string,
	valueExpr string,
	fieldPathExpr string,
	field websocketJSONFieldSpec,
) {
	readerName := "websocketSupportReadRequiredString"
	if field.Optional {
		readerName = "websocketSupportReadOptionalString"
	}
	builder.WriteString(indent)
	builder.WriteString(field.PropertyName)
	builder.WriteString(": ")
	builder.WriteString(readerName)
	builder.WriteString("(\n")
	builder.WriteString(indent)
	builder.WriteString("  ")
	builder.WriteString(valueExpr)
	builder.WriteString(",\n")
	builder.WriteString(indent)
	builder.WriteString("  ")
	builder.WriteString(fieldPathExpr)
	builder.WriteString(",\n")
	builder.WriteString(indent)
	builder.WriteString("  issues,\n")
	builder.WriteString(indent)
	builder.WriteString("),\n")
}

func websocketRootFieldPathExpr(propertyName string) string {
	return tsStringLiteralExpr(propertyName)
}

func websocketReadActivationStepsFieldSpecs() []websocketJSONFieldSpec {
	fields := mustWebsocketJSONFieldSpecs(reflect.TypeOf(UISettingRevealActivationStep{}))
	for _, field := range fields {
		if !websocketFieldSupportsStringReader(field) {
			panic(fmt.Sprintf(
				"websocket schema support: %s.%s must be a string field",
				reflect.TypeOf(UISettingRevealActivationStep{}).Name(),
				field.PropertyName,
			))
		}
	}
	return fields
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
	fields := websocketReadActivationStepsFieldSpecs()
	var builder strings.Builder
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
	for _, field := range fields {
		writeWebsocketStringFieldAssignment(
			&builder,
			"      ",
			"entry."+field.PropertyName,
			websocketIndexedFieldPathExpr(`fieldName + "[" + index`, field.PropertyName),
			field,
		)
	}
	builder.WriteString("    });\n")
	builder.WriteString("  });\n")
	builder.WriteString("  return steps;\n")
	return builder.String()
}

func buildWebsocketReadRevealTargetsBodyTS() string {
	fields := mustWebsocketJSONFieldSpecs(reflect.TypeOf(UISettingRevealTarget{}))
	var builder strings.Builder
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
	for _, field := range fields {
		switch {
		case websocketFieldSupportsStringReader(field):
			writeWebsocketStringFieldAssignment(
				&builder,
				"      ",
				"entry."+field.PropertyName,
				websocketIndexedFieldPathExpr(`"reveals[" + index`, field.PropertyName),
				field,
			)
		case field.Type.Kind() == reflect.Slice && field.Type.Elem() == realtimeUISettingRevealActivationStepType:
			builder.WriteString("      ")
			builder.WriteString(field.PropertyName)
			builder.WriteString(": websocketSupportReadActivationSteps(\n")
			builder.WriteString("        entry.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(",\n")
			builder.WriteString("        ")
			builder.WriteString(websocketIndexedFieldPathExpr(`"reveals[" + index`, field.PropertyName))
			builder.WriteString(",\n")
			builder.WriteString("        issues,\n")
			builder.WriteString("      ),\n")
		default:
			panic(fmt.Sprintf(
				"websocket schema support: unsupported %s.%s field type %s",
				reflect.TypeOf(UISettingRevealTarget{}).Name(),
				field.PropertyName,
				field.Type,
			))
		}
	}
	builder.WriteString("    });\n")
	builder.WriteString("  });\n")
	builder.WriteString("  return targets;\n")
	return builder.String()
}

func buildUISettingRevealContentSchemaExprTS() string {
	fields := mustWebsocketJSONFieldSpecs(reflect.TypeOf(UISettingRevealContent{}))
	var builder strings.Builder
	builder.WriteString("{\n")
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
	for _, field := range fields {
		switch {
		case websocketFieldSupportsStringReader(field):
			writeWebsocketStringFieldAssignment(
				&builder,
				"      ",
				"value."+field.PropertyName,
				websocketRootFieldPathExpr(field.PropertyName),
				field,
			)
		case field.Type.Kind() == reflect.Slice && field.Type.Elem() == realtimeUISettingRevealTargetType:
			builder.WriteString("      ")
			builder.WriteString(field.PropertyName)
			builder.WriteString(": websocketSupportReadRevealTargets(value.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(", issues),\n")
		case field.Type.Kind() == reflect.Int && field.PropertyName == "durationMs":
			builder.WriteString("      durationMs: websocketSupportReadDurationMs(value.durationMs, issues),\n")
		default:
			panic(fmt.Sprintf(
				"websocket schema support: unsupported %s.%s field type %s",
				reflect.TypeOf(UISettingRevealContent{}).Name(),
				field.PropertyName,
				field.Type,
			))
		}
	}
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
	builder.WriteString("}")
	return builder.String()
}

func buildDependencyEventSchemaExprTS() string {
	fields := mustWebsocketJSONFieldSpecs(reflect.TypeOf(realtime.DependencyEvent{}))
	var builder strings.Builder
	builder.WriteString("{\n")
	builder.WriteString("  shape: {\n")
	for _, field := range fields {
		builder.WriteString("    ")
		builder.WriteString(field.PropertyName)
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
	for _, field := range fields {
		switch {
		case field.Type == reflect.TypeOf(realtime.BaseDependencyKeyUnion{}):
			builder.WriteString("    if (!(\"")
			builder.WriteString(field.PropertyName)
			builder.WriteString("\" in value)) {\n")
			builder.WriteString("      issues.push(\"")
			builder.WriteString(field.PropertyName)
			builder.WriteString(" is required.\");\n")
			builder.WriteString("    }\n")
		case field.Type.Kind() == reflect.Pointer && field.Type.Elem() == reflect.TypeOf(realtime.BaseDependencyValueUnion{}):
			continue
		case field.Type.Kind() == reflect.Int64:
			builder.WriteString("    if (\n")
			builder.WriteString("      !(\"")
			builder.WriteString(field.PropertyName)
			builder.WriteString("\" in value) ||\n")
			builder.WriteString("      typeof value.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(" !== \"number\" ||\n")
			builder.WriteString("      !Number.isFinite(value.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(")\n")
			builder.WriteString("    ) {\n")
			builder.WriteString("      issues.push(\"")
			builder.WriteString(field.PropertyName)
			builder.WriteString(" must be a finite number.\");\n")
			builder.WriteString("    }\n")
		default:
			panic(fmt.Sprintf(
				"websocket schema support: unsupported %s.%s field type %s",
				reflect.TypeOf(realtime.DependencyEvent{}).Name(),
				field.PropertyName,
				field.Type,
			))
		}
	}
	builder.WriteString("\n")
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
	for _, field := range fields {
		switch {
		case field.Type == reflect.TypeOf(realtime.BaseDependencyKeyUnion{}):
			builder.WriteString("        ")
			builder.WriteString(field.PropertyName)
			builder.WriteString(": value.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(" as BaseDependencyKeyUnion,\n")
		case field.Type.Kind() == reflect.Pointer && field.Type.Elem() == reflect.TypeOf(realtime.BaseDependencyValueUnion{}):
			builder.WriteString("        ")
			builder.WriteString(field.PropertyName)
			builder.WriteString(":\n")
			builder.WriteString("          value.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(" === undefined || value.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(" === null\n")
			builder.WriteString("            ? null\n")
			builder.WriteString("            : (value.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(" as BaseDependencyValueUnion),\n")
		case field.Type.Kind() == reflect.Int64:
			builder.WriteString("        ")
			builder.WriteString(field.PropertyName)
			builder.WriteString(": value.")
			builder.WriteString(field.PropertyName)
			builder.WriteString(" as number,\n")
		}
	}
	builder.WriteString("      },\n")
	builder.WriteString("    };\n")
	builder.WriteString("  },\n")
	builder.WriteString("}")
	return builder.String()
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
