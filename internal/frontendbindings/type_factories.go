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

type generatedCompositeCreateFieldSpec struct {
	LocalName    string
	PropertyName string
	CreateExpr   string
}

type generatedCompositeCreateAssignmentSpec struct {
	Name string
	Expr string
}

type generatedCompositeCreateClonedFieldSpec struct {
	Name     string
	Nullable bool
}

type generatedCompositeCreateMapFieldSpec struct {
	Name       string
	KeyName    string
	ValueName  string
	CreateExpr string
	ResultType string
}

func buildGoBackedCompositeCreateBodyTS(
	context string,
	defaultValue any,
	nestedFields []generatedCompositeCreateFieldSpec,
	clonedFields []string,
	assignments []generatedCompositeCreateAssignmentSpec,
) string {
	fieldOrder := goJSONFieldOrder(defaultValue)
	defaultObject := mustTSLiteralObjectFromGoValue(context, defaultValue)

	exprOverrides := make(map[string]string, len(nestedFields))
	var builder strings.Builder
	for _, field := range nestedFields {
		builder.WriteString("  const ")
		builder.WriteString(field.LocalName)
		builder.WriteString(" = ")
		builder.WriteString(field.CreateExpr)
		builder.WriteString(";\n")
		exprOverrides[field.PropertyName] = field.LocalName
	}
	if len(clonedFields) > 0 {
		clonedDefaults := make(map[string]any, len(clonedFields))
		for _, name := range clonedFields {
			value, ok := defaultObject[name]
			if !ok {
				panic(context + ": missing cloned field default " + name)
			}
			clonedDefaults[name] = value
		}
		builder.WriteString("  const clonedDefaults = ")
		writeTSObjectLiteral(&builder, "  ", clonedDefaults, clonedFields)
		builder.WriteString(";\n")
	}
	builder.WriteString("  return {\n")
	builder.WriteString("    ...")
	builder.WriteString(buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
		context,
		defaultValue,
		fieldOrder,
		"options",
		exprOverrides,
	))
	builder.WriteString(",\n")
	for _, field := range nestedFields {
		builder.WriteString("    ")
		if field.PropertyName == field.LocalName {
			builder.WriteString(field.PropertyName)
		} else {
			builder.WriteString(field.PropertyName)
			builder.WriteString(": ")
			builder.WriteString(field.LocalName)
		}
		builder.WriteString(",\n")
	}
	for _, name := range clonedFields {
		builder.WriteString("    ")
		builder.WriteString(name)
		builder.WriteString(": cloneGeneratedValue(\n")
		builder.WriteString("      options.")
		builder.WriteString(name)
		builder.WriteString(" ?? clonedDefaults.")
		builder.WriteString(name)
		builder.WriteString(",\n")
		builder.WriteString("    ),\n")
	}
	for _, assignment := range assignments {
		builder.WriteString("    ")
		builder.WriteString(assignment.Name)
		builder.WriteString(": ")
		builder.WriteString(assignment.Expr)
		builder.WriteString(",\n")
	}
	builder.WriteString("  };")
	return builder.String()
}

func buildGoBackedPolicyCreateBodyTS(
	context string,
	typeName string,
	defaultValue any,
	clonedFields []generatedCompositeCreateClonedFieldSpec,
	mapFields []generatedCompositeCreateMapFieldSpec,
) string {
	defaultsLiteral := renderTSObjectLiteralFromGoValue(
		context,
		defaultValue,
		goJSONFieldOrder(defaultValue),
	)
	var builder strings.Builder
	builder.WriteString("  const defaults: ")
	builder.WriteString(typeName)
	builder.WriteString(" = ")
	builder.WriteString(defaultsLiteral)
	builder.WriteString(";\n")
	for _, field := range mapFields {
		builder.WriteString("  const ")
		builder.WriteString(field.Name)
		builder.WriteString(" = Object.fromEntries(\n")
		builder.WriteString("    Object.entries({\n")
		builder.WriteString("      ...defaults.")
		builder.WriteString(field.Name)
		builder.WriteString(",\n")
		builder.WriteString("      ...(options.")
		builder.WriteString(field.Name)
		builder.WriteString(" ?? {}),\n")
		builder.WriteString("    }).map(([")
		builder.WriteString(field.KeyName)
		builder.WriteString(", ")
		builder.WriteString(field.ValueName)
		builder.WriteString("]) => [\n")
		builder.WriteString("      ")
		builder.WriteString(field.KeyName)
		builder.WriteString(",\n")
		builder.WriteString("      ")
		builder.WriteString(field.CreateExpr)
		builder.WriteString(",\n")
		builder.WriteString("    ]),\n")
		builder.WriteString("  ) as ")
		builder.WriteString(field.ResultType)
		builder.WriteString(";\n")
	}
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(defaults, options),\n")
	for _, field := range clonedFields {
		builder.WriteString("    ")
		builder.WriteString(field.Name)
		builder.WriteString(":")
		if field.Nullable {
			builder.WriteString("\n")
			builder.WriteString("      options.")
			builder.WriteString(field.Name)
			builder.WriteString(" === null\n")
			builder.WriteString("        ? null\n")
			builder.WriteString("        : [...(options.")
			builder.WriteString(field.Name)
			builder.WriteString(" ?? defaults.")
			builder.WriteString(field.Name)
			builder.WriteString(" ?? [])],\n")
			continue
		}
		builder.WriteString(" [...(options.")
		builder.WriteString(field.Name)
		builder.WriteString(" ?? defaults.")
		builder.WriteString(field.Name)
		builder.WriteString(" ?? [])],\n")
	}
	for _, field := range mapFields {
		builder.WriteString("    ")
		builder.WriteString(field.Name)
		builder.WriteString(",\n")
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
		goJSONFieldOrder(defaults),
		goJSONFieldOrderMapFromStructFields(defaults),
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
		goJSONFieldOrder(defaults),
		goJSONFieldOrderMapFromStructFields(defaults),
	)
}

func buildSectionSizingPolicyCreateBodyTS() string {
	return buildGoBackedCompositeCreateBodyTS(
		"frontend default section sizing policy",
		projectstate.FrontendDefaultSectionSizingPolicy(),
		[]generatedCompositeCreateFieldSpec{
			{
				LocalName:    "byType",
				PropertyName: "byType",
				CreateExpr:   "createSectionSizingPolicyByType(options.byType ?? {})",
			},
			{
				LocalName:    "metaControlByType",
				PropertyName: "metaControlByType",
				CreateExpr: "createMetaControlSizingPolicyByType(\n" +
					"    options.metaControlByType ?? {},\n" +
					"  )",
			},
			{
				LocalName:    "globals",
				PropertyName: "globals",
				CreateExpr:   "createSectionSizingPolicyGlobals(options.globals ?? {})",
			},
		},
		nil,
		nil,
	)
}

func buildSettingsStateCreateBodyTS() string {
	return buildGoBackedCompositeCreateBodyTS(
		"frontend default settings state",
		settingsstate.FrontendDefaultSettingsState(),
		[]generatedCompositeCreateFieldSpec{
			{
				LocalName:    "shortcuts",
				PropertyName: "shortcuts",
				CreateExpr:   "createSettingsShortcuts(options.shortcuts ?? {})",
			},
			{
				LocalName:    "gui",
				PropertyName: "gui",
				CreateExpr:   "createSettingsGUI(options.gui ?? {})",
			},
			{
				LocalName:    "backend",
				PropertyName: "backend",
				CreateExpr:   "createSettingsBackend(options.backend ?? {})",
			},
			{
				LocalName:    "sectionSizingPolicy",
				PropertyName: "sectionSizingPolicy",
				CreateExpr: "createSectionSizingPolicy(\n" +
					"    options.sectionSizingPolicy ?? {},\n" +
					"  )",
			},
		},
		[]string{"languageServer"},
		nil,
	)
}

func buildProjectCodegenPythonTargetCreateBodyTS() string {
	defaultTarget := projectview.FrontendDefaultProjectCodegenPythonTarget()
	return buildGoBackedCompositeCreateBodyTS(
		"default project codegen python target",
		defaultTarget,
		[]generatedCompositeCreateFieldSpec{
			{
				LocalName:    "sectionPolicy",
				PropertyName: "sectionPolicy",
				CreateExpr:   "createSectionCodegenPolicy(options.sectionPolicy ?? {})",
			},
			{
				LocalName:    "codeObjValuePolicy",
				PropertyName: "codeObjValuePolicy",
				CreateExpr: "createCodeObjValuePolicy(\n" +
					"    options.codeObjValuePolicy ?? {},\n" +
					"  )",
			},
		},
		nil,
		[]generatedCompositeCreateAssignmentSpec{
			{Name: "language", Expr: renderTSLiteralExpr(string(defaultTarget.Language))},
		},
	)
}

func buildSectionCodegenPolicyCreateBodyTS() string {
	return buildGoBackedPolicyCreateBodyTS(
		"frontend default python section codegen policy",
		"SectionCodegenPolicy",
		projectview.FrontendDefaultPythonSectionCodegenPolicy(),
		[]generatedCompositeCreateClonedFieldSpec{
			{Name: "allowlist", Nullable: true},
			{Name: "metaControlAllowlist", Nullable: true},
			{Name: "exclude"},
		},
		[]generatedCompositeCreateMapFieldSpec{
			{
				Name:       "typePolicies",
				KeyName:    "sectionType",
				ValueName:  "policy",
				CreateExpr: "createSectionTypeCodegenPolicy(policy)",
				ResultType: "Record<SectionType, SectionTypeCodegenPolicy>",
			},
			{
				Name:       "sectionOverrides",
				KeyName:    "sectionId",
				ValueName:  "override",
				CreateExpr: "createSectionCodegenOverride(override)",
				ResultType: "Record<string, SectionCodegenOverride>",
			},
		},
	)
}

func buildCodeObjValuePolicyCreateBodyTS() string {
	return buildGoBackedPolicyCreateBodyTS(
		"frontend default python code object value policy",
		"CodeObjValuePolicy",
		projectview.FrontendDefaultPythonCodeObjValuePolicy(),
		nil,
		[]generatedCompositeCreateMapFieldSpec{
			{
				Name:       "typePolicies",
				KeyName:    "codeObjType",
				ValueName:  "policy",
				CreateExpr: "createCodeObjTypeValuePolicy(policy)",
				ResultType: "Record<CodeObjType, CodeObjTypeValuePolicy>",
			},
			{
				Name:       "codeObjOverrides",
				KeyName:    "codeObjId",
				ValueName:  "override",
				CreateExpr: "createCodeObjValueOverride(override)",
				ResultType: "Record<string, CodeObjValueOverride>",
			},
		},
	)
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
