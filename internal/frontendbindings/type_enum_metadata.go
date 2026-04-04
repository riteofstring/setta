package frontendbindings

import (
	"reflect"
	"strings"
	"unicode"

	"setta/internal/projectstate"
	"setta/internal/stringenumvalues"
)

type frontendEnumNamingMode int

const (
	frontendEnumNamingDiscovered frontendEnumNamingMode = iota
	frontendEnumNamingPascalValue
	frontendEnumNamingUpperSnakeValue
)

var frontendBindingSyntheticEnumProviders = map[reflect.Type]func() []EnumValue{
	reflect.TypeOf(SectionType("")): func() []EnumValue {
		values := frontendBindingStructFieldEnumValues(
			reflect.TypeOf(projectstate.FrontendSectionSizingPolicyByType{}),
		)
		return frontendBindingMoveEnumValueBefore(values, "TextBlock", "Prompt")
	},
	reflect.TypeOf(CodeObjType("")): func() []EnumValue {
		return frontendBindingStructFieldEnumValues(
			reflect.TypeOf(projectstate.FrontendMetaControlSizingPolicyByType{}),
		)
	},
	reflect.TypeOf(CodeLanguage("")): frontendBindingFixedEnumValues(
		"python",
		"bash",
		"javascript",
		"typescript",
		"json",
		"yaml",
		"toml",
		"markdown",
		"plaintext",
	),
	reflect.TypeOf(ConfigLanguage("")): frontendBindingFixedEnumValues("python", "json"),
	reflect.TypeOf(ParameterPassingStyle("")): frontendBindingFixedEnumValues(
		"DEFAULT",
		"ARGS",
		"KWARGS",
		"POSITIONAL_ONLY",
		"KEYWORD_ONLY",
	),
	reflect.TypeOf(ParamNameType("")): frontendBindingFixedEnumValues("CODE", "TEXT"),
	reflect.TypeOf(ButtonActionMode("")): frontendBindingFixedEnumValues(
		"WEBSOCKET_LISTENER",
		"HTTP_REQUEST",
		"SETTA_API",
	),
	reflect.TypeOf(HttpRequestMethod("")): frontendBindingFixedEnumValues(
		"GET",
		"POST",
		"PUT",
		"PATCH",
		"DELETE",
		"HEAD",
		"OPTIONS",
	),
	reflect.TypeOf(DropzoneMode("")):         frontendBindingFixedEnumValues("STATEFUL", "STATELESS"),
	reflect.TypeOf(TextParamInputUIType("")): frontendBindingFixedEnumValues("plain", "time", "date"),
	reflect.TypeOf(TimeDisplayFormat("")): frontendBindingFixedEnumValues(
		"twenty_four_hour",
		"twelve_hour",
	),
	reflect.TypeOf(TimeControlMode("")):       frontendBindingFixedEnumValues("input", "display"),
	reflect.TypeOf(TimeDisplayFont("")):       frontendBindingFixedEnumValues("clock", "monospace", "system"),
	reflect.TypeOf(DateDisplayFormat("")):     frontendBindingFixedEnumValues("iso", "us", "eu", "long"),
	reflect.TypeOf(DateControlMode("")):       frontendBindingFixedEnumValues("input", "calendar"),
	reflect.TypeOf(DateSelectionMode("")):     frontendBindingFixedEnumValues("single", "multiple"),
	reflect.TypeOf(DateCalendarWeekStart("")): frontendBindingFixedEnumValues("sunday", "monday"),
	reflect.TypeOf(BackgroundVariant("")):     frontendBindingFixedEnumValues("lines", "dots", "cross"),
	reflect.TypeOf(SelectionMode("")):         frontendBindingFixedEnumValues("partial", "full"),
	reflect.TypeOf(PanOnScrollMode("")):       frontendBindingFixedEnumValues("free", "vertical", "horizontal"),
	reflect.TypeOf(MetaControlSizeMode("")): frontendBindingFixedEnumValues(
		"any",
		"auto_only",
		"manual_only",
	),
	reflect.TypeOf(SectionSizeMode("")): frontendBindingFixedEnumValues("auto"),
	reflect.TypeOf(TaskBoardTaskRecurrence("")): frontendBindingFixedEnumValues(
		"none",
		"hourly",
		"daily",
		"specified_days",
		"specified_months",
		"specified_years",
	),
	reflect.TypeOf(TaskBoardRecurringWeekday("")): frontendBindingFixedEnumValues(
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
		"sunday",
	),
	reflect.TypeOf(TaskBoardRecurringMonth("")): frontendBindingFixedEnumValues(
		"january",
		"february",
		"march",
		"april",
		"may",
		"june",
		"july",
		"august",
		"september",
		"october",
		"november",
		"december",
	),
	reflect.TypeOf(AgenticEdgeKind("")): frontendBindingFixedEnumValues(
		"chat_chat",
		"section_chat",
		"chat_section",
	),
	reflect.TypeOf(AgenticEdgeContextMode("")): frontendBindingFixedEnumValues(
		"reference_only",
		"inline_text",
		"summary",
	),
}

var frontendBindingEnumNamingModes = map[reflect.Type]frontendEnumNamingMode{
	reflect.TypeOf(ServerMode("")):                       frontendEnumNamingPascalValue,
	reflect.TypeOf(LaunchSettaFilesLocation("")):         frontendEnumNamingPascalValue,
	reflect.TypeOf(LaunchResolvedSettaFilesLocation("")): frontendEnumNamingPascalValue,
	reflect.TypeOf(LauncherOpenMode("")):                 frontendEnumNamingPascalValue,
	reflect.TypeOf(LauncherWorkspaceBehavior("")):        frontendEnumNamingPascalValue,
	reflect.TypeOf(SetupLauncherWorkspaceBehavior("")):   frontendEnumNamingPascalValue,
	reflect.TypeOf(LauncherInstallSource("")):            frontendEnumNamingPascalValue,
	reflect.TypeOf(LauncherUpdateCapability("")):         frontendEnumNamingPascalValue,
	reflect.TypeOf(PluginScope("")):                      frontendEnumNamingPascalValue,
	reflect.TypeOf(PluginEnablementSource("")):           frontendEnumNamingPascalValue,
	reflect.TypeOf(PluginSourceManager("")):              frontendEnumNamingPascalValue,
	reflect.TypeOf(PluginInstallerBackend("")):           frontendEnumNamingPascalValue,
	reflect.TypeOf(PluginSourceTrustStatus("")):          frontendEnumNamingPascalValue,
	reflect.TypeOf(PluginBlockedCapabilityReason("")):    frontendEnumNamingPascalValue,
	reflect.TypeOf(PluginRestartCapabilityMode("")):      frontendEnumNamingPascalValue,
	reflect.TypeOf(StreamingEventType("")):               frontendEnumNamingUpperSnakeValue,
}

var frontendBindingEnumPascalAcronyms = map[string]string{
	"api":  "API",
	"http": "HTTP",
	"id":   "ID",
	"ide":  "IDE",
	"json": "JSON",
	"llm":  "LLM",
	"mcp":  "MCP",
	"ui":   "UI",
	"url":  "URL",
	"uv":   "UV",
}

func frontendBindingEnumValues(t reflect.Type) ([]EnumValue, bool, error) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return nil, false, nil
	}

	if provider, ok := frontendBindingSyntheticEnumProviders[t]; ok {
		return provider(), true, nil
	}

	discovered, ok, err := stringenumvalues.Default().Values(t)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}

	return frontendBindingEnumValuesFromDiscovered(
		discovered,
		frontendBindingEnumNamingModes[t],
	), true, nil
}

func frontendBindingFixedEnumValues(values ...string) func() []EnumValue {
	return func() []EnumValue {
		enumValues := make([]EnumValue, 0, len(values))
		for _, value := range values {
			enumValues = append(enumValues, EnumValue{
				Name:  value,
				Value: value,
			})
		}
		return enumValues
	}
}

func frontendBindingEnumValuesFromDiscovered(
	discovered []stringenumvalues.EnumValue,
	mode frontendEnumNamingMode,
) []EnumValue {
	values := make([]EnumValue, 0, len(discovered))
	seen := make(map[string]struct{}, len(discovered))
	for _, discoveredValue := range discovered {
		name := discoveredValue.Name
		switch mode {
		case frontendEnumNamingPascalValue:
			name = frontendBindingPascalEnumValueName(discoveredValue.Value)
		case frontendEnumNamingUpperSnakeValue:
			name = frontendBindingUpperSnakeEnumValueName(discoveredValue.Value)
		}
		key := name + "\x00" + discoveredValue.Value
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		values = append(values, EnumValue{
			Name:  name,
			Value: discoveredValue.Value,
		})
	}
	return values
}

func frontendBindingStructFieldEnumValues(structType reflect.Type) []EnumValue {
	values := make([]EnumValue, 0, structType.NumField())
	for index := 0; index < structType.NumField(); index++ {
		field := structType.Field(index)
		if !field.IsExported() {
			continue
		}
		name := frontendBindingStructFieldEnumName(field)
		if name == "" {
			continue
		}
		values = append(values, EnumValue{
			Name:  name,
			Value: name,
		})
	}
	return values
}

func frontendBindingMoveEnumValueBefore(
	values []EnumValue,
	name string,
	before string,
) []EnumValue {
	fromIndex := -1
	toIndex := -1
	for index, value := range values {
		switch value.Name {
		case name:
			fromIndex = index
		case before:
			toIndex = index
		}
	}
	if fromIndex == -1 || toIndex == -1 || fromIndex < toIndex {
		return values
	}

	ordered := append([]EnumValue(nil), values...)
	value := ordered[fromIndex]
	copy(ordered[toIndex+1:fromIndex+1], ordered[toIndex:fromIndex])
	ordered[toIndex] = value
	return ordered
}

func frontendBindingStructFieldEnumName(field reflect.StructField) string {
	jsonName := strings.TrimSpace(field.Tag.Get("json"))
	if jsonName == "" {
		return field.Name
	}
	name, _, _ := strings.Cut(jsonName, ",")
	name = strings.TrimSpace(name)
	if name == "" {
		return field.Name
	}
	if name == "-" {
		return ""
	}
	return name
}

func frontendBindingPascalEnumValueName(value string) string {
	parts := strings.FieldsFunc(strings.TrimSpace(value), func(char rune) bool {
		return char == '-' || char == '_' || !(unicode.IsLetter(char) || unicode.IsDigit(char))
	})
	if len(parts) == 0 {
		return value
	}

	var builder strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		lower := strings.ToLower(part)
		if acronym, ok := frontendBindingEnumPascalAcronyms[lower]; ok {
			builder.WriteString(acronym)
			continue
		}
		runes := []rune(lower)
		runes[0] = unicode.ToUpper(runes[0])
		builder.WriteString(string(runes))
	}
	return builder.String()
}

func frontendBindingUpperSnakeEnumValueName(value string) string {
	normalized := strings.ReplaceAll(strings.TrimSpace(value), "-", "_")
	return strings.ToUpper(normalized)
}
