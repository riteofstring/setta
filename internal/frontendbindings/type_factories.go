package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
)

func metaControlSizingPolicyByTypeProperties() []TypeProperty {
	return []TypeProperty{
		{Name: "CodeCallable", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "CodeParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "TextParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "DateParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "TimeParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "ButtonParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "SliderParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "RotaryParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "SwitchParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "ColorPickerParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "DropdownParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "PasswordParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "TextAreaParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "DropzoneParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "NestedParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
	}
}

func sectionSizingPolicyByTypeProperties() []TypeProperty {
	return []TypeProperty{
		{Name: "Callable", TypeExpr: "SectionSizingPolicyCallableTypeEntry"},
		{Name: "Dict", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "ListRoot", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Group", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "StateMachineStart", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "StateMachineGate", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "StateMachineEnd", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Image", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Chart", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Draw", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Prompt", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "TextBlock", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "MetaControl", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Social", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "GlobalVariables", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Code", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "GenPythonCode", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "GenPythonMetadata", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Terminal", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "IFrame", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Chat", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Browser", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Plugin", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "TaskBoard", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Spreadsheet", TypeExpr: "SectionSizingPolicyTypeEntry"},
	}
}

func buildTSNestedObjectMergeCreateBodyTS(
	rootGeneric string,
	nestedGeneric string,
	defaults map[string]any,
	orderedKeys []string,
	nestedFieldOrders map[string][]string,
) string {
	if len(orderedKeys) == 0 {
		orderedKeys = sortedTSLiteralObjectKeys(defaults)
	}
	var builder strings.Builder
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions")
	if rootGeneric != "" {
		builder.WriteString("<")
		builder.WriteString(rootGeneric)
		builder.WriteString(">")
	}
	builder.WriteString("(\n")
	builder.WriteString("      ")
	writeTSObjectLiteral(&builder, "      ", defaults, orderedKeys)
	builder.WriteString(",\n")
	builder.WriteString("      options,\n")
	builder.WriteString("    ),\n")
	for _, key := range orderedKeys {
		rawEntry, ok := defaults[key]
		if !ok {
			panic("missing nested TypeScript default entry: " + key)
		}
		entryObject, ok := rawEntry.(map[string]any)
		if !ok {
			panic("nested TypeScript default entry is not an object: " + key)
		}
		builder.WriteString("    ")
		builder.WriteString(key)
		builder.WriteString(": mergeGeneratedOptions")
		if nestedGeneric != "" {
			builder.WriteString("<")
			builder.WriteString(nestedGeneric)
			builder.WriteString(">")
		}
		builder.WriteString("(\n")
		builder.WriteString("      ")
		writeTSObjectLiteral(&builder, "      ", entryObject, nestedFieldOrders[key])
		builder.WriteString(",\n")
		builder.WriteString("      options.")
		builder.WriteString(key)
		builder.WriteString(" ?? {},\n")
		builder.WriteString("    ),\n")
	}
	builder.WriteString("  };")
	return builder.String()
}

func buildMetaControlSizingPolicyByTypeCreateBodyTS() string {
	defaults := projectstate.FrontendDefaultMetaControlSizingPolicyByType()
	return buildTSNestedObjectMergeCreateBodyTS(
		"MetaControlSizingPolicyByType",
		"MetaControlSizingPolicyTypeEntry",
		mustTSLiteralObjectFromGoValue(
			"meta control sizing policy defaults",
			defaults,
		),
		orderedTypePropertyNames(metaControlSizingPolicyByTypeProperties()),
		goJSONFieldOrderMap(map[string]projectstate.FrontendMetaControlSizingPolicyTypeEntry{
			"CodeCallable":     defaults.CodeCallable,
			"CodeParam":        defaults.CodeParam,
			"TextParam":        defaults.TextParam,
			"DateParam":        defaults.DateParam,
			"TimeParam":        defaults.TimeParam,
			"ButtonParam":      defaults.ButtonParam,
			"SliderParam":      defaults.SliderParam,
			"RotaryParam":      defaults.RotaryParam,
			"SwitchParam":      defaults.SwitchParam,
			"ColorPickerParam": defaults.ColorPickerParam,
			"DropdownParam":    defaults.DropdownParam,
			"PasswordParam":    defaults.PasswordParam,
			"TextAreaParam":    defaults.TextAreaParam,
			"DropzoneParam":    defaults.DropzoneParam,
			"NestedParam":      defaults.NestedParam,
		}),
	)
}

func buildSectionSizingPolicyByTypeCreateBodyTS() string {
	defaults := projectstate.FrontendDefaultSectionSizingPolicyByType()
	return buildTSNestedObjectMergeCreateBodyTS(
		"",
		"",
		mustTSLiteralObjectFromGoValue(
			"section sizing policy defaults",
			defaults,
		),
		orderedTypePropertyNames(sectionSizingPolicyByTypeProperties()),
		map[string][]string{
			"Callable":          goJSONFieldOrder(defaults.Callable),
			"Dict":              goJSONFieldOrder(defaults.Dict),
			"ListRoot":          goJSONFieldOrder(defaults.ListRoot),
			"Group":             goJSONFieldOrder(defaults.Group),
			"StateMachineStart": goJSONFieldOrder(defaults.StateMachineStart),
			"StateMachineGate":  goJSONFieldOrder(defaults.StateMachineGate),
			"StateMachineEnd":   goJSONFieldOrder(defaults.StateMachineEnd),
			"Image":             goJSONFieldOrder(defaults.Image),
			"Chart":             goJSONFieldOrder(defaults.Chart),
			"Draw":              goJSONFieldOrder(defaults.Draw),
			"Prompt":            goJSONFieldOrder(defaults.Prompt),
			"TextBlock":         goJSONFieldOrder(defaults.TextBlock),
			"MetaControl":       goJSONFieldOrder(defaults.MetaControl),
			"Social":            goJSONFieldOrder(defaults.Social),
			"GlobalVariables":   goJSONFieldOrder(defaults.GlobalVariables),
			"Code":              goJSONFieldOrder(defaults.Code),
			"GenPythonCode":     goJSONFieldOrder(defaults.GenPythonCode),
			"GenPythonMetadata": goJSONFieldOrder(defaults.GenPythonMetadata),
			"Terminal":          goJSONFieldOrder(defaults.Terminal),
			"IFrame":            goJSONFieldOrder(defaults.IFrame),
			"Chat":              goJSONFieldOrder(defaults.Chat),
			"Browser":           goJSONFieldOrder(defaults.Browser),
			"Plugin":            goJSONFieldOrder(defaults.Plugin),
			"TaskBoard":         goJSONFieldOrder(defaults.TaskBoard),
			"Spreadsheet":       goJSONFieldOrder(defaults.Spreadsheet),
		},
	)
}

func buildSectionSizingPolicyCreateBodyTS() string {
	var builder strings.Builder
	builder.WriteString("  const byType = createSectionSizingPolicyByType(options.byType ?? {});\n")
	builder.WriteString("  const metaControlByType = createMetaControlSizingPolicyByType(\n")
	builder.WriteString("    options.metaControlByType ?? {},\n")
	builder.WriteString("  );\n")
	builder.WriteString("  const globals = createSectionSizingPolicyGlobals(options.globals ?? {});\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(\n")
	builder.WriteString("      {\n")
	builder.WriteString("        byType,\n")
	builder.WriteString("        metaControlByType,\n")
	builder.WriteString("        globals,\n")
	builder.WriteString("      },\n")
	builder.WriteString("      options,\n")
	builder.WriteString("    ),\n")
	builder.WriteString("    byType,\n")
	builder.WriteString("    metaControlByType,\n")
	builder.WriteString("    globals,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildSettingsStateCreateBodyTS() string {
	defaults := settingsstate.FrontendDefaultSettingsState()

	var builder strings.Builder
	builder.WriteString("  const shortcuts = createSettingsShortcuts(options.shortcuts ?? {});\n")
	builder.WriteString("  const gui = createSettingsGUI(options.gui ?? {});\n")
	builder.WriteString("  const backend = createSettingsBackend(options.backend ?? {});\n")
	builder.WriteString("  const sectionSizingPolicy = createSectionSizingPolicy(\n")
	builder.WriteString("    options.sectionSizingPolicy ?? {},\n")
	builder.WriteString("  );\n")
	builder.WriteString("  const defaults: SettingsState = {\n")
	builder.WriteString("    shortcuts,\n")
	builder.WriteString("    gui,\n")
	builder.WriteString("    backend,\n")
	builder.WriteString("    sectionSizingPolicy,\n")
	builder.WriteString("    languageServer: ")
	writeTSObjectLiteral(&builder, "    ", defaults.LanguageServer, nil)
	builder.WriteString(",\n")
	builder.WriteString("  };\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(defaults, options),\n")
	builder.WriteString("    shortcuts,\n")
	builder.WriteString("    gui,\n")
	builder.WriteString("    backend,\n")
	builder.WriteString("    sectionSizingPolicy,\n")
	builder.WriteString("    languageServer: cloneGeneratedValue(\n")
	builder.WriteString("      options.languageServer ?? defaults.languageServer,\n")
	builder.WriteString("    ),\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildProjectCodegenPythonTargetCreateBodyTS() string {
	defaultTarget := projectview.FrontendDefaultProjectCodegenPythonTarget()
	var builder strings.Builder
	builder.WriteString("  const sectionPolicy = createSectionCodegenPolicy(options.sectionPolicy ?? {});\n")
	builder.WriteString("  const codeObjValuePolicy = createCodeObjValuePolicy(\n")
	builder.WriteString("    options.codeObjValuePolicy ?? {},\n")
	builder.WriteString("  );\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...")
	builder.WriteString(buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
		"default project codegen python target",
		defaultTarget,
		goJSONFieldOrder(defaultTarget),
		"options",
		map[string]string{
			"sectionPolicy":      "sectionPolicy",
			"codeObjValuePolicy": "codeObjValuePolicy",
		},
	))
	builder.WriteString(",\n")
	builder.WriteString("    language: ")
	writeTSLiteralValue(&builder, "    ", string(defaultTarget.Language))
	builder.WriteString(",\n")
	builder.WriteString("    sectionPolicy,\n")
	builder.WriteString("    codeObjValuePolicy,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildSectionCodegenPolicyCreateBodyTS() string {
	defaultsLiteral := renderTSObjectLiteralFromGoValue(
		"frontend default python section codegen policy",
		projectview.FrontendDefaultPythonSectionCodegenPolicy(),
		[]string{
			"allowlist",
			"metaControlAllowlist",
			"exclude",
			"typePolicies",
			"sectionOverrides",
		},
	)
	var builder strings.Builder
	builder.WriteString("  const defaults: SectionCodegenPolicy = ")
	builder.WriteString(defaultsLiteral)
	builder.WriteString(";\n")
	builder.WriteString("  const typePolicies = Object.fromEntries(\n")
	builder.WriteString("    Object.entries({\n")
	builder.WriteString("      ...defaults.typePolicies,\n")
	builder.WriteString("      ...(options.typePolicies ?? {}),\n")
	builder.WriteString("    }).map(([sectionType, policy]) => [\n")
	builder.WriteString("      sectionType,\n")
	builder.WriteString("      createSectionTypeCodegenPolicy(policy),\n")
	builder.WriteString("    ]),\n")
	builder.WriteString("  ) as Record<SectionType, SectionTypeCodegenPolicy>;\n")
	builder.WriteString("  const sectionOverrides = Object.fromEntries(\n")
	builder.WriteString("    Object.entries({\n")
	builder.WriteString("      ...defaults.sectionOverrides,\n")
	builder.WriteString("      ...(options.sectionOverrides ?? {}),\n")
	builder.WriteString("    }).map(([sectionId, override]) => [\n")
	builder.WriteString("      sectionId,\n")
	builder.WriteString("      createSectionCodegenOverride(override),\n")
	builder.WriteString("    ]),\n")
	builder.WriteString("  ) as Record<string, SectionCodegenOverride>;\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(defaults, options),\n")
	builder.WriteString("    allowlist:\n")
	builder.WriteString("      options.allowlist === null\n")
	builder.WriteString("        ? null\n")
	builder.WriteString("        : [...(options.allowlist ?? defaults.allowlist ?? [])],\n")
	builder.WriteString("    metaControlAllowlist:\n")
	builder.WriteString("      options.metaControlAllowlist === null\n")
	builder.WriteString("        ? null\n")
	builder.WriteString("        : [\n")
	builder.WriteString("            ...(options.metaControlAllowlist ??\n")
	builder.WriteString("              defaults.metaControlAllowlist ??\n")
	builder.WriteString("              []),\n")
	builder.WriteString("          ],\n")
	builder.WriteString("    exclude: [...(options.exclude ?? defaults.exclude)],\n")
	builder.WriteString("    typePolicies,\n")
	builder.WriteString("    sectionOverrides,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildCodeObjValuePolicyCreateBodyTS() string {
	defaultsLiteral := renderTSObjectLiteralFromGoValue(
		"frontend default python code object value policy",
		projectview.FrontendDefaultPythonCodeObjValuePolicy(),
		[]string{"typePolicies", "codeObjOverrides"},
	)
	var builder strings.Builder
	builder.WriteString("  const defaults: CodeObjValuePolicy = ")
	builder.WriteString(defaultsLiteral)
	builder.WriteString(";\n")
	builder.WriteString("  const typePolicies = Object.fromEntries(\n")
	builder.WriteString("    Object.entries({\n")
	builder.WriteString("      ...defaults.typePolicies,\n")
	builder.WriteString("      ...(options.typePolicies ?? {}),\n")
	builder.WriteString("    }).map(([codeObjType, policy]) => [\n")
	builder.WriteString("      codeObjType,\n")
	builder.WriteString("      createCodeObjTypeValuePolicy(policy),\n")
	builder.WriteString("    ]),\n")
	builder.WriteString("  ) as Record<CodeObjType, CodeObjTypeValuePolicy>;\n")
	builder.WriteString("  const codeObjOverrides = Object.fromEntries(\n")
	builder.WriteString("    Object.entries({\n")
	builder.WriteString("      ...defaults.codeObjOverrides,\n")
	builder.WriteString("      ...(options.codeObjOverrides ?? {}),\n")
	builder.WriteString("    }).map(([codeObjId, override]) => [\n")
	builder.WriteString("      codeObjId,\n")
	builder.WriteString("      createCodeObjValueOverride(override),\n")
	builder.WriteString("    ]),\n")
	builder.WriteString("  ) as Record<string, CodeObjValueOverride>;\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(defaults, options),\n")
	builder.WriteString("    typePolicies,\n")
	builder.WriteString("    codeObjOverrides,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildEngineConfigCreateBodyTS() string {
	defaultConfig := agentruns.EngineConfig{
		EngineType: agentruns.EngineTypeSettaLLM,
	}
	var builder strings.Builder
	builder.WriteString("  const defaults = createEngineConfigDefaults();\n")
	builder.WriteString("  const runtimeSupport = createEngineRuntimeSupport();\n")
	builder.WriteString("  const mergedDefaults = mergeGeneratedOptions(defaults, options.defaults ?? {});\n")
	builder.WriteString("  const mergedRuntimeSupport =\n")
	builder.WriteString("    options.runtimeSupport === undefined || options.runtimeSupport === null\n")
	builder.WriteString("      ? null\n")
	builder.WriteString("      : mergeGeneratedOptions(runtimeSupport, options.runtimeSupport);\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...")
	builder.WriteString(buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
		"frontend default engine config",
		defaultConfig,
		goJSONFieldOrder(defaultConfig),
		"options",
		map[string]string{
			"defaults": "defaults",
		},
	))
	builder.WriteString(",\n")
	builder.WriteString("    defaults: mergedDefaults,\n")
	builder.WriteString("    runtimeSupport: mergedRuntimeSupport,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildGeneratedFactoryReturnBodyTS(
	objectEntries []string,
	overridesExpr string,
	prelude string,
) string {
	var builder strings.Builder
	trimmedPrelude := strings.TrimRight(prelude, "\n")
	if trimmedPrelude != "" {
		builder.WriteString(trimmedPrelude)
		builder.WriteString("\n")
	}
	builder.WriteString("  return mergeGeneratedOptions(\n")
	builder.WriteString("    {\n")
	for _, entry := range objectEntries {
		builder.WriteString("      ")
		builder.WriteString(entry)
		builder.WriteString(",\n")
	}
	builder.WriteString("    },\n")
	builder.WriteString("    ")
	builder.WriteString(overridesExpr)
	builder.WriteString(",\n")
	builder.WriteString("  );")
	return builder.String()
}

func buildResolvedGeneratedFactoryBodyTS(
	defaultType string,
	implType string,
	objectEntries []string,
	prelude string,
	overridesExpr string,
) string {
	if overridesExpr == "" {
		overridesExpr = "resolved.overrides"
	}
	var builder strings.Builder
	builder.WriteString("  const resolved = resolveGeneratedFactoryInputs<\n")
	builder.WriteString("    ")
	builder.WriteString(defaultType)
	builder.WriteString(",\n")
	builder.WriteString("    ")
	builder.WriteString(implType)
	builder.WriteString("\n")
	builder.WriteString("  >(create")
	builder.WriteString(defaultType)
	builder.WriteString("(), defaultsOrOverrides, overrides);\n")
	builder.WriteString(buildGeneratedFactoryReturnBodyTS(objectEntries, overridesExpr, prelude))
	return builder.String()
}

func buildDirectGeneratedFactoryBodyTS(
	objectEntries []string,
	overridesExpr string,
	prelude string,
) string {
	return buildGeneratedFactoryReturnBodyTS(objectEntries, overridesExpr, prelude)
}

func objectDeclarationWithGoBackedSectionDefaults(
	name string,
	implType string,
	properties ...TypeProperty,
) TypeDeclaration {
	return objectDeclarationWithCreateExpr(
		name,
		buildGoBackedSectionDefaultsCreateExprTS(implType, properties),
		properties...,
	)
}

func objectDeclarationWithGoBackedCreateExpr(
	name string,
	defaultValue any,
	properties ...TypeProperty,
) TypeDeclaration {
	return objectDeclarationWithCreateExpr(
		name,
		buildGoBackedCreateExprTS("frontend create defaults "+name, defaultValue, properties),
		properties...,
	)
}

func buildGoBackedSectionDefaultsCreateExprTS(implType string, properties []TypeProperty) string {
	defaults, err := projectstate.FrontendUserDefaultSectionDefaults(implType)
	if err != nil {
		panic("load frontend user default section defaults: " + err.Error())
	}
	return buildGoBackedCreateExprTS(
		"frontend user default section defaults "+implType,
		defaults,
		properties,
	)
}

func buildGoBackedCreateExprTS(context string, value any, properties []TypeProperty) string {
	filteredDefaults := filterObjectByTypeProperties(
		context,
		mustTSLiteralObjectFromGoValue(context, value),
		properties,
	)
	var builder strings.Builder
	builder.WriteString("mergeGeneratedOptions(\n")
	writeTSObjectLiteral(&builder, "    ", filteredDefaults, orderedTypePropertyNames(properties))
	builder.WriteString(",\n")
	builder.WriteString("    options,\n")
	builder.WriteString("  )")
	return builder.String()
}

func buildGoBackedCreateExprWithExprOverridesTS(
	context string,
	value any,
	properties []TypeProperty,
	exprOverrides map[string]string,
) string {
	filteredDefaults := filterObjectByTypePropertiesWithExprOverrides(
		context,
		mustTSLiteralObjectFromGoValue(context, value),
		properties,
		exprOverrides,
	)
	return buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
		context,
		filteredDefaults,
		orderedTypePropertyNames(properties),
		"options",
		exprOverrides,
	)
}

func filterObjectByTypeProperties(
	context string,
	object map[string]any,
	properties []TypeProperty,
) map[string]any {
	return filterObjectByTypePropertiesWithExprOverrides(context, object, properties, nil)
}

func filterObjectByTypePropertiesWithExprOverrides(
	context string,
	object map[string]any,
	properties []TypeProperty,
	exprOverrides map[string]string,
) map[string]any {
	filtered := make(map[string]any, len(properties))
	for _, property := range properties {
		value, ok := object[property.Name]
		if !ok {
			if exprOverrides != nil {
				if _, overridden := exprOverrides[property.Name]; overridden {
					continue
				}
			}
			if property.Optional {
				continue
			}
			panic(fmt.Sprintf("%s is missing property %q", context, property.Name))
		}
		filtered[property.Name] = value
	}
	return filtered
}

func defaultsOrOverridesTypeProperty(defaultType string, implType string) TypeProperty {
	return TypeProperty{
		Name:         "defaultsOrOverrides",
		TypeExpr:     "Partial<" + defaultType + "> | Partial<" + implType + ">",
		DefaultValue: "{}",
	}
}

func optionalOverrideTypeProperty(implType string) TypeProperty {
	return TypeProperty{Name: "overrides", TypeExpr: "Partial<" + implType + ">", Optional: true}
}

func defaultsTypeProperty(defaultType string) TypeProperty {
	return TypeProperty{Name: "defaults", TypeExpr: defaultType}
}

func overrideTypeProperty(implType string) TypeProperty {
	return TypeProperty{Name: "overrides", TypeExpr: "Partial<" + implType + ">", DefaultValue: "{}"}
}

func orderedTypePropertyNames(properties []TypeProperty) []string {
	names := make([]string, 0, len(properties))
	for _, property := range properties {
		names = append(names, property.Name)
	}
	return names
}

func buildTaskBoardOverridesPreludeTS() string {
	var builder strings.Builder
	builder.WriteString("  const normalizedOverrides: Partial<TaskBoardSectionImpl> = {\n")
	builder.WriteString("    ...resolved.overrides,\n")
	builder.WriteString("  };\n")
	builder.WriteString("  if (normalizedOverrides.columns === undefined) {\n")
	builder.WriteString("    delete normalizedOverrides.columns;\n")
	builder.WriteString("  }\n")
	builder.WriteString("  if (normalizedOverrides.tasks === undefined) {\n")
	builder.WriteString("    delete normalizedOverrides.tasks;\n")
	builder.WriteString("  }")
	return builder.String()
}

func generatedSectionTypeSetContains(setName string, sectionName string) bool {
	member := "SectionTypeEnum." + sectionName
	for _, spec := range projectStateTypeGuardTypeSets {
		if spec.Name != setName {
			continue
		}
		for _, candidate := range spec.Members {
			if candidate == member {
				return true
			}
		}
		return false
	}
	return false
}

func generatedCodeObjTypeSetContains(setName string, codeObjName string) bool {
	member := "CodeObjTypeEnum." + codeObjName
	for _, spec := range projectStateTypeGuardTypeSets {
		if spec.Name != setName {
			continue
		}
		for _, candidate := range spec.Members {
			if candidate == member {
				return true
			}
		}
		return false
	}
	return false
}

func generatedSectionImplName(t reflect.Type) (string, bool) {
	if t == nil || t.Kind() != reflect.Struct {
		return "", false
	}
	name := t.Name()
	if name == "" || strings.HasPrefix(name, "Base") || strings.HasPrefix(name, "UserDefault") {
		return "", false
	}
	if !strings.HasSuffix(name, "SectionImpl") {
		return "", false
	}
	sectionName := strings.TrimSuffix(name, "SectionImpl")
	if _, err := projectstate.FrontendUserDefaultSectionDefaults(sectionName); err != nil {
		return "", false
	}
	return sectionName, true
}

func generatedCodeObjImplName(t reflect.Type) (string, bool) {
	if t == nil || t.Kind() != reflect.Struct {
		return "", false
	}
	name := t.Name()
	if name == "" || strings.HasPrefix(name, "Base") || strings.HasPrefix(name, "UserDefault") {
		return "", false
	}
	if !strings.HasSuffix(name, "CodeObjImpl") {
		return "", false
	}
	return name, true
}

func generatedSectionImplTypeExpr(sectionName string) string {
	return "SectionTypeEnum." + sectionName
}

func generatedSectionImplDefaultTypeName(sectionName string) string {
	return "UserDefault" + sectionName + "SectionImpl"
}

func generatedSectionImplFactoryUsesDirectDefaults(sectionName string) bool {
	return sectionName == "Dict"
}

func generatedSectionImplFactoryOverridesExpr(sectionName string) string {
	if sectionName == "TaskBoard" {
		return "normalizedOverrides"
	}
	return "resolved.overrides"
}

func generatedSectionImplFactoryPreludeTS(sectionName string) string {
	if sectionName == "TaskBoard" {
		return buildTaskBoardOverridesPreludeTS()
	}
	return ""
}

func generatedSectionImplFactoryEntries(sectionName string, defaultsExpr string) []string {
	entries := []string{
		"..." + defaultsExpr,
		"type: " + generatedSectionImplTypeExpr(sectionName),
		`id: ""`,
		`name: ""`,
		"isInOtherProjectConfigs: false",
		"aspectRatioExtraHeight: 0",
		"aspectRatioExtraWidth: 0",
		"isPreset: false",
	}
	if generatedSectionTypeSetContains("BaseSectionWithParamsImplTypeSet", sectionName) {
		entries = append(
			entries,
			"codeObjVariantMap: {}",
			"pinnedParams: []",
			"selectedParams: []",
			`ignoreTypeErrors: {
        callable: false,
        params: {},
      }`,
		)
	}
	if generatedSectionTypeSetContains("BaseParentSectionImplTypeSet", sectionName) {
		entries = append(entries, "children: []")
	}
	switch sectionName {
	case "Callable":
		entries = append(entries, "callable: null")
	case "Dict":
		entries = append(entries, "topLevelParamId: null", "jsonSourceMissing: false")
	case "Prompt":
		entries = append(entries, "promptTemplateId: null")
	case "TaskBoard":
		entries = append(
			entries,
			`columns: `+defaultsExpr+`.columns === null || `+defaultsExpr+`.columns === undefined
        ? []
        : cloneGeneratedValue(`+defaultsExpr+`.columns)`,
		)
	}
	return entries
}

func generatedSectionImplFactoryDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	sectionName, ok := generatedSectionImplName(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	implType := t.Name()
	defaultType := generatedSectionImplDefaultTypeName(sectionName)
	name := "create" + implType

	if generatedSectionImplFactoryUsesDirectDefaults(sectionName) {
		return exportedFunctionDeclaration(
			name,
			implType,
			buildDirectGeneratedFactoryBodyTS(
				generatedSectionImplFactoryEntries(sectionName, "defaults"),
				"overrides",
				"",
			),
			defaultsTypeProperty(defaultType),
			overrideTypeProperty(implType),
		), true
	}

	return exportedFunctionDeclaration(
		name,
		implType,
		buildResolvedGeneratedFactoryBodyTS(
			defaultType,
			implType,
			generatedSectionImplFactoryEntries(sectionName, "resolved.defaults"),
			generatedSectionImplFactoryPreludeTS(sectionName),
			generatedSectionImplFactoryOverridesExpr(sectionName),
		),
		defaultsOrOverridesTypeProperty(defaultType, implType),
		optionalOverrideTypeProperty(implType),
	), true
}

func generatedCodeParamCodeObjFactoryDeclaration() TypeDeclaration {
	return exportedFunctionDeclaration(
		"createCodeParamCodeObjImpl",
		"CodeParamCodeObjImpl",
		buildResolvedGeneratedFactoryBodyTS(
			"UserDefaultCodeParamCodeObjImpl",
			"CodeParamCodeObjImpl",
			[]string{
				"...resolved.defaults",
				"type: CodeObjTypeEnum.CodeParam",
				`id: ""`,
				`name: ""`,
				`description: ""`,
				"isPreset: false",
				"passingStyle: ParameterPassingStyleEnum.DEFAULT",
			},
			"",
			"",
		),
		defaultsOrOverridesTypeProperty("UserDefaultCodeParamCodeObjImpl", "CodeParamCodeObjImpl"),
		optionalOverrideTypeProperty("CodeParamCodeObjImpl"),
	)
}

func additionalDeclarationsForType(t reflect.Type) ([]TypeDeclaration, bool) {
	switch t {
	case reflect.TypeOf(CodeParamCodeObjImpl{}):
		return []TypeDeclaration{generatedCodeParamCodeObjFactoryDeclaration()}, true
	case reflect.TypeOf(BaseChartSettingsUnion{}):
		return []TypeDeclaration{
			exportedFunctionDeclaration(
				"createBaseChartSettingsUnionWithDiscriminator",
				"BaseChartSettingsUnion",
				`  switch (options.type) {
    case ChartTypeEnum.line:
      return createLineChartSettings(options);
    case ChartTypeEnum.scatter:
      return createScatterChartSettings(options);
    default:
      throw new Error("Unsupported chart type.");
  }`,
				TypeProperty{
					Name: "options",
					TypeExpr: `({ type: typeof ChartTypeEnum.line } & Partial<LineChartSettings>)
    | ({ type: typeof ChartTypeEnum.scatter } & Partial<ScatterChartSettings>)`,
				},
			),
		}, true
	}
	if declaration, ok := generatedSectionImplFactoryDeclaration(t); ok {
		return []TypeDeclaration{declaration}, true
	}
	return nil, false
}
