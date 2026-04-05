package frontendbindings

import (
	"reflect"
	"strings"
	"unicode"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/launcher"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/stringenumvalues"
)

type frontendEnumNamingMode int

const (
	frontendEnumNamingDiscovered frontendEnumNamingMode = iota
	frontendEnumNamingPascalValue
	frontendEnumNamingUpperSnakeValue
)

var frontendBindingSyntheticEnumProviders = map[reflect.Type]func() []EnumValue{
	reflect.TypeOf(projectstate.CodeLanguage("")): frontendBindingFixedEnumValues(
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
}

var frontendBindingEnumNamingModes = map[reflect.Type]frontendEnumNamingMode{
	reflect.TypeOf(config.Mode("")):                              frontendEnumNamingPascalValue,
	reflect.TypeOf(httpapi.LaunchSettaFilesLocation("")):         frontendEnumNamingPascalValue,
	reflect.TypeOf(httpapi.LaunchResolvedSettaFilesLocation("")): frontendEnumNamingPascalValue,
	reflect.TypeOf(launcher.LauncherOpenMode("")):                frontendEnumNamingPascalValue,
	reflect.TypeOf(launcher.LauncherWorkspaceBehavior("")):       frontendEnumNamingPascalValue,
	reflect.TypeOf(launcher.LauncherInstallSource("")):           frontendEnumNamingPascalValue,
	reflect.TypeOf(launcher.LauncherUpdateCapability("")):        frontendEnumNamingPascalValue,
	reflect.TypeOf(plugins.PluginScope("")):                      frontendEnumNamingPascalValue,
	reflect.TypeOf(plugins.PluginEnablementSource("")):           frontendEnumNamingPascalValue,
	reflect.TypeOf(plugins.PluginSourceManager("")):              frontendEnumNamingPascalValue,
	reflect.TypeOf(plugins.PluginInstallerBackend("")):           frontendEnumNamingPascalValue,
	reflect.TypeOf(plugins.PluginSourceTrustStatus("")):          frontendEnumNamingPascalValue,
	reflect.TypeOf(plugins.PluginBlockedCapabilityReason("")):    frontendEnumNamingPascalValue,
	reflect.TypeOf(plugins.PluginRestartCapabilityMode("")):      frontendEnumNamingPascalValue,
	reflect.TypeOf(realtime.StreamingEventType("")):              frontendEnumNamingUpperSnakeValue,
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

	return frontendBindingAdjustedDiscoveredEnumValues(t, discovered), true, nil
}

func frontendBindingAdjustedDiscoveredEnumValues(
	t reflect.Type,
	discovered []stringenumvalues.EnumValue,
) []EnumValue {
	values := frontendBindingEnumValuesFromDiscovered(
		discovered,
		frontendBindingEnumNamingModes[t],
	)
	switch t {
	case reflect.TypeOf(projectstate.FrontendSectionType("")):
		return frontendBindingMoveEnumValueBefore(values, "TextBlock", "Prompt")
	default:
		return values
	}
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
