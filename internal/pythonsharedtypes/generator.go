package pythonsharedtypes

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"
	"unicode"

	"setta/internal/sharedtypes"
)

type GeneratedTypes struct {
	PythonModule string
}

type modelSpec struct {
	Name            string
	Fields          []fieldSpec
	ExternalImports map[string]struct{}
}

type aliasSpec struct {
	Name     string
	TypeExpr string
}

type fieldSpec struct {
	Name        string
	TypeExpr    string
	DefaultExpr string
}

var timeType = reflect.TypeOf(time.Time{})
var rawJSONType = reflect.TypeOf(json.RawMessage{})
var pythonExternalTypeModules = map[string]string{
	"setta/internal/pythonsdkcontracts": "setta.sdk_contracts.generated",
}
var pythonKeywords = map[string]struct{}{
	"False": {}, "None": {}, "True": {}, "and": {}, "as": {}, "assert": {},
	"async": {}, "await": {}, "break": {}, "class": {}, "continue": {}, "def": {},
	"del": {}, "elif": {}, "else": {}, "except": {}, "finally": {}, "for": {},
	"from": {}, "global": {}, "if": {}, "import": {}, "in": {}, "is": {},
	"lambda": {}, "nonlocal": {}, "not": {}, "or": {}, "pass": {}, "raise": {},
	"return": {}, "try": {}, "while": {}, "with": {}, "yield": {},
}

func Build() (GeneratedTypes, error) {
	ctx, err := buildGenerationContext()
	if err != nil {
		return GeneratedTypes{}, err
	}

	manualOverrideNames := contractSpecNameSet(manualOverrideContractSpecs(ctx.ContractSpecs))
	standardBlocks, standardImports, standardDeclarationNames, err := pythonSharedSchemaDeclarations(ctx.Sidecar, manualOverrideNames)
	if err != nil {
		return GeneratedTypes{}, err
	}

	manualSpecs := manualContractSpecs(ctx.ContractSpecs, standardDeclarationNames, manualOverrideNames)
	manualAliases := missingStandardAliasSpecs(ctx.AliasSpecs, standardDeclarationNames)
	knownContractNames := knownContractNameSetFromSidecar(ctx.Sidecar)
	models, enums, externalImports, typingImports, needsDatetime, needsEnum, needsPydanticField, err := collectRenderedContractSpecs(
		manualSpecs,
		knownContractNames,
		ctx.DefaultSourcesByType,
	)
	if err != nil {
		return GeneratedTypes{}, err
	}
	models = sortModelSpecsByDependencies(models)
	applyAliasRenderNeeds(manualAliases, typingImports, &needsDatetime)

	return GeneratedTypes{
		PythonModule: renderGeneratedTypesModule(
			standardImports,
			standardBlocks,
			enums,
			models,
			manualAliases,
			externalImports,
			typingImports,
			needsEnum,
			needsDatetime,
			needsPydanticField,
		),
	}, nil
}

func buildModelSpec(
	spec contractSpec,
	knownContractNames map[string]struct{},
) (modelSpec, error) {
	ctx, err := buildGenerationContext()
	if err != nil {
		return modelSpec{}, err
	}
	return buildModelSpecWithDefaultSources(spec, knownContractNames, ctx.DefaultSourcesByType)
}

func knownContractNameSet(specs []contractSpec, aliases []aliasSpec) map[string]struct{} {
	known := map[string]struct{}{}
	for _, spec := range specs {
		if strings.TrimSpace(spec.Name) == "" {
			continue
		}
		known[spec.Name] = struct{}{}
	}
	for _, alias := range aliases {
		if strings.TrimSpace(alias.Name) == "" {
			continue
		}
		known[alias.Name] = struct{}{}
	}
	return known
}

func knownContractNameSetFromSidecar(sidecar sharedtypes.SemanticSidecar) map[string]struct{} {
	known := map[string]struct{}{}
	for _, entry := range sidecar.Contracts {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}
		known[name] = struct{}{}
	}
	return known
}

func contractSpecNameSet(specs []contractSpec) map[string]struct{} {
	names := map[string]struct{}{}
	for _, spec := range specs {
		name := strings.TrimSpace(spec.Name)
		if name == "" {
			continue
		}
		names[name] = struct{}{}
	}
	return names
}

func manualContractSpecs(
	specs []contractSpec,
	standardDeclarationNames map[string]struct{},
	manualOverrideNames map[string]struct{},
) []contractSpec {
	manual := make([]contractSpec, 0, len(specs))
	for _, spec := range specs {
		name := strings.TrimSpace(spec.Name)
		if name == "" {
			continue
		}
		if _, overridden := manualOverrideNames[name]; overridden {
			manual = append(manual, spec)
			continue
		}
		if _, present := standardDeclarationNames[name]; present {
			continue
		}
		manual = append(manual, spec)
	}
	return manual
}

func manualOverrideContractSpecs(specs []contractSpec) []contractSpec {
	overrides := make([]contractSpec, 0, len(specs))
	for _, spec := range specs {
		if spec.Kind != contractKindModel {
			continue
		}
		if !pythonModelRequiresManualOverride(spec.Type) {
			continue
		}
		overrides = append(overrides, spec)
	}
	return overrides
}

func pythonModelRequiresManualOverride(t reflect.Type) bool {
	if t == nil || t.Kind() != reflect.Struct {
		return false
	}
	for _, field := range visibleFields(t) {
		if pythonFieldRequiresManualOverride(field) {
			return true
		}
	}
	return false
}

func pythonFieldRequiresManualOverride(field reflect.StructField) bool {
	if strings.TrimSpace(field.Tag.Get("py_type")) != "" {
		return true
	}
	if strings.TrimSpace(field.Tag.Get("py_import")) != "" {
		return true
	}
	if strings.TrimSpace(field.Tag.Get("py_default")) != "" {
		return true
	}
	return false
}

func missingStandardAliasSpecs(
	aliases []aliasSpec,
	standardDeclarationNames map[string]struct{},
) []aliasSpec {
	missing := make([]aliasSpec, 0, len(aliases))
	for _, alias := range aliases {
		name := strings.TrimSpace(alias.Name)
		if name == "" {
			continue
		}
		if _, present := standardDeclarationNames[name]; present {
			continue
		}
		missing = append(missing, alias)
	}
	return missing
}

func collectRenderedContractSpecs(
	specs []contractSpec,
	knownContractNames map[string]struct{},
	defaultSourcesByType map[reflect.Type]reflect.Value,
) ([]modelSpec, []contractSpec, map[string]struct{}, map[string]struct{}, bool, bool, bool, error) {
	models := make([]modelSpec, 0, len(specs))
	enums := make([]contractSpec, 0, len(specs))
	externalImports := map[string]struct{}{}
	typingImports := map[string]struct{}{}
	needsDatetime := false
	needsEnum := false
	needsPydanticField := false

	for _, spec := range specs {
		model, isModel, err := renderedModelSpec(spec, knownContractNames, defaultSourcesByType)
		if err != nil {
			return nil, nil, nil, nil, false, false, false, err
		}
		if isModel {
			models = append(models, model)
			mergeImportSet(externalImports, model.ExternalImports)
			recordFieldRenderNeeds(model.Fields, typingImports, &needsDatetime, &needsPydanticField)
			continue
		}
		enumSpec, isEnum, err := renderedEnumSpec(spec)
		if err != nil {
			return nil, nil, nil, nil, false, false, false, err
		}
		if isEnum {
			needsEnum = true
			enums = append(enums, enumSpec)
			continue
		}
		return nil, nil, nil, nil, false, false, false, fmt.Errorf(
			"python shared types: unsupported contract kind %q",
			spec.Kind,
		)
	}
	return models, enums, externalImports, typingImports, needsDatetime, needsEnum, needsPydanticField, nil
}

func renderedEnumSpec(spec contractSpec) (contractSpec, bool, error) {
	if spec.Kind != contractKindEnum {
		return contractSpec{}, false, nil
	}
	if len(spec.EnumValues) == 0 {
		return contractSpec{}, false, fmt.Errorf("python shared types: enum %s has no values", spec.Name)
	}
	return spec, true, nil
}

func renderedModelSpec(
	spec contractSpec,
	knownContractNames map[string]struct{},
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (modelSpec, bool, error) {
	if spec.Kind != contractKindModel {
		return modelSpec{}, false, nil
	}
	model, err := buildModelSpecWithDefaultSources(spec, knownContractNames, defaultSourcesByType)
	if err != nil {
		return modelSpec{}, false, err
	}
	return model, true, nil
}

func applyAliasRenderNeeds(
	aliases []aliasSpec,
	typingImports map[string]struct{},
	needsDatetime *bool,
) {
	for _, alias := range aliases {
		recordTypeExprRenderNeeds(alias.TypeExpr, typingImports, needsDatetime)
	}
}

func recordFieldRenderNeeds(
	fields []fieldSpec,
	typingImports map[string]struct{},
	needsDatetime *bool,
	needsPydanticField *bool,
) {
	for _, field := range fields {
		recordTypeExprRenderNeeds(field.TypeExpr, typingImports, needsDatetime)
		if strings.Contains(field.DefaultExpr, "Field(") {
			*needsPydanticField = true
		}
	}
}

func recordTypeExprRenderNeeds(
	typeExpr string,
	typingImports map[string]struct{},
	needsDatetime *bool,
) {
	if strings.Contains(typeExpr, "Any") {
		typingImports["Any"] = struct{}{}
	}
	if strings.Contains(typeExpr, "datetime") {
		*needsDatetime = true
	}
}

func renderGeneratedTypesModule(
	standardImportLines []string,
	standardBlocks []string,
	enums []contractSpec,
	models []modelSpec,
	aliases []aliasSpec,
	externalImports map[string]struct{},
	typingImports map[string]struct{},
	needsEnum bool,
	needsDatetime bool,
	needsPydanticField bool,
) string {
	var builder strings.Builder
	builder.WriteString("# Code generated by ./scripts/go.sh run ./cmd/setta-gen-python-shared-types -out backend/setta/types/generated/go_shared_types.py; DO NOT EDIT.\n")
	builder.WriteString("\n")
	builder.WriteString("from __future__ import annotations\n")
	builder.WriteString("\n")
	writeRawImportLines(&builder, standardImportLines)
	writeStandardImports(&builder, typingImports, needsEnum, needsDatetime, needsPydanticField)
	writeExternalImports(&builder, externalImports)
	writePydanticBaseModel(&builder, len(models) > 0)
	writeStandardSchemaBlocks(&builder, standardBlocks)
	writeEnumSpecs(&builder, enums)
	writeModelSpecs(&builder, models)
	writeAliasSpecs(&builder, aliases)
	return builder.String()
}

func writeStandardImports(
	builder *strings.Builder,
	typingImports map[string]struct{},
	needsEnum bool,
	needsDatetime bool,
	needsPydanticField bool,
) {
	if needsEnum {
		builder.WriteString("from enum import Enum\n")
	}
	if needsDatetime {
		builder.WriteString("from datetime import datetime\n")
	}
	if len(typingImports) > 0 {
		builder.WriteString("from typing import ")
		builder.WriteString(strings.Join(sortedImportNames(typingImports), ", "))
		builder.WriteString("\n")
	}
	builder.WriteString("from pydantic import BaseModel, ConfigDict")
	if needsPydanticField {
		builder.WriteString(", Field")
	}
	builder.WriteString("\n")
	builder.WriteString("\n")
}

func writeExternalImports(builder *strings.Builder, externalImports map[string]struct{}) {
	if len(externalImports) == 0 {
		return
	}
	for _, line := range sortedImportNames(externalImports) {
		builder.WriteString(line)
		builder.WriteString("\n")
	}
	builder.WriteString("\n")
}

func writePydanticBaseModel(builder *strings.Builder, needed bool) {
	if !needed {
		return
	}
	builder.WriteString("class SettaSharedTypeModel(BaseModel):\n")
	builder.WriteString("    model_config = ConfigDict(extra=\"forbid\")\n")
	builder.WriteString("\n")
}

func writeEnumSpecs(builder *strings.Builder, enums []contractSpec) {
	for _, enumSpec := range enums {
		builder.WriteString("\n\n")
		builder.WriteString("class ")
		builder.WriteString(enumSpec.Name)
		builder.WriteString("(str, Enum):\n")
		for _, value := range enumSpec.EnumValues {
			builder.WriteString("    ")
			builder.WriteString(pythonEnumMemberName(value.Name))
			builder.WriteString(" = ")
			builder.WriteString(fmt.Sprintf("%q", value.Value))
			builder.WriteString("\n")
		}
	}
}

func writeModelSpecs(builder *strings.Builder, models []modelSpec) {
	for _, model := range models {
		builder.WriteString("\n")
		builder.WriteString("class ")
		builder.WriteString(model.Name)
		builder.WriteString("(SettaSharedTypeModel):\n")
		if len(model.Fields) == 0 {
			builder.WriteString("    pass\n")
			continue
		}
		for _, field := range model.Fields {
			builder.WriteString(renderFieldLine(field))
		}
	}
}

func writeRawImportLines(builder *strings.Builder, importLines []string) {
	if len(importLines) == 0 {
		return
	}
	for _, line := range importLines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		builder.WriteString(trimmed)
		builder.WriteString("\n")
	}
	builder.WriteString("\n")
}

func writeStandardSchemaBlocks(builder *strings.Builder, blocks []string) {
	for _, block := range blocks {
		trimmed := strings.TrimSpace(block)
		if trimmed == "" {
			continue
		}
		builder.WriteString(trimmed)
		builder.WriteString("\n\n")
	}
}

func writeAliasSpecs(builder *strings.Builder, aliases []aliasSpec) {
	for _, alias := range aliases {
		builder.WriteString("\n\n")
		builder.WriteString(alias.Name)
		builder.WriteString(" = ")
		builder.WriteString(alias.TypeExpr)
		builder.WriteString("\n")
	}
}

func buildModelSpecWithDefaultSources(
	spec contractSpec,
	knownContractNames map[string]struct{},
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (modelSpec, error) {
	modelType := spec.Type
	if modelType.Kind() != reflect.Struct {
		return modelSpec{}, fmt.Errorf("python shared types: %s must be a struct", modelType)
	}
	model := modelSpec{
		Name:            spec.Name,
		Fields:          make([]fieldSpec, 0, modelType.NumField()),
		ExternalImports: map[string]struct{}{},
	}
	for _, field := range visibleFields(modelType) {
		resolvedField, fieldImports, err := buildModelFieldSpec(
			spec,
			field,
			knownContractNames,
			defaultSourcesByType,
		)
		if err != nil {
			return modelSpec{}, err
		}
		mergeImportSet(model.ExternalImports, fieldImports)
		model.Fields = append(model.Fields, resolvedField)
	}
	return model, nil
}

func buildModelFieldSpec(
	spec contractSpec,
	field reflect.StructField,
	knownContractNames map[string]struct{},
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (fieldSpec, map[string]struct{}, error) {
	jsonName, err := fieldJSONName(field)
	if err != nil {
		return fieldSpec{}, nil, fmt.Errorf(
			"python shared types: %s.%s: %w",
			spec.Name,
			field.Name,
			err,
		)
	}
	typeSpec, err := pythonFieldTypeSpec(field, knownContractNames)
	if err != nil {
		return fieldSpec{}, nil, fmt.Errorf(
			"python shared types: %s.%s: %w",
			spec.Name,
			field.Name,
			err,
		)
	}

	fieldImports := map[string]struct{}{}
	mergeImportSet(fieldImports, typeSpec.Imports)
	importTag := strings.TrimSpace(field.Tag.Get("py_import"))
	if importTag != "" {
		for _, line := range strings.Split(importTag, "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}
			fieldImports[trimmed] = struct{}{}
		}
	}

	defaultExpr, err := pythonDefaultExpr(
		spec.Type,
		field,
		typeSpec.TypeExpr,
		defaultSourcesByType,
	)
	if err != nil {
		return fieldSpec{}, nil, fmt.Errorf(
			"python shared types: %s.%s: %w",
			spec.Name,
			field.Name,
			err,
		)
	}
	typeExpr := typeSpec.TypeExpr
	if field.Type.Kind() == reflect.Pointer && !strings.Contains(typeExpr, " | None") {
		typeExpr += " | None"
	}
	if fieldAllowsMissing(field) && defaultExpr == "" {
		if !strings.Contains(typeExpr, " | None") {
			typeExpr += " | None"
		}
		defaultExpr = "None"
	}

	return fieldSpec{
		Name:        jsonName,
		TypeExpr:    typeExpr,
		DefaultExpr: defaultExpr,
	}, fieldImports, nil
}

func mergeImportSet(dst map[string]struct{}, src map[string]struct{}) {
	if dst == nil {
		return
	}
	for line := range src {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		dst[trimmed] = struct{}{}
	}
}

func sortModelSpecsByDependencies(models []modelSpec) []modelSpec {
	if len(models) < 2 {
		return models
	}

	modelNames, originalOrder := indexedModelNames(models)
	dependentsByName, inDegree := modelDependencyGraph(models, modelNames)
	ready := readyModelNames(models, inDegree)

	sorted := make([]modelSpec, 0, len(models))
	seen := make(map[string]struct{}, len(models))
	for len(ready) > 0 {
		name := ready[0]
		ready = ready[1:]
		if _, alreadySeen := seen[name]; alreadySeen {
			continue
		}
		seen[name] = struct{}{}
		sorted = append(sorted, models[originalOrder[name]])
		ready = advanceReadyModelNames(ready, name, dependentsByName, inDegree, originalOrder)
	}

	if len(sorted) == len(models) {
		return sorted
	}

	for _, model := range models {
		if _, alreadySeen := seen[model.Name]; alreadySeen {
			continue
		}
		sorted = append(sorted, model)
	}
	return sorted
}

func indexedModelNames(models []modelSpec) (map[string]struct{}, map[string]int) {
	modelNames := make(map[string]struct{}, len(models))
	originalOrder := make(map[string]int, len(models))
	for index, model := range models {
		modelNames[model.Name] = struct{}{}
		originalOrder[model.Name] = index
	}
	return modelNames, originalOrder
}

func modelDependencyGraph(
	models []modelSpec,
	modelNames map[string]struct{},
) (map[string][]string, map[string]int) {
	dependentsByName := make(map[string][]string, len(models))
	inDegree := make(map[string]int, len(models))
	for _, model := range models {
		dependencies := referencedModelNames(model, modelNames)
		inDegree[model.Name] = len(dependencies)
		for dependency := range dependencies {
			dependentsByName[dependency] = append(dependentsByName[dependency], model.Name)
		}
	}
	return dependentsByName, inDegree
}

func readyModelNames(models []modelSpec, inDegree map[string]int) []string {
	ready := make([]string, 0, len(models))
	for _, model := range models {
		if inDegree[model.Name] == 0 {
			ready = append(ready, model.Name)
		}
	}
	return ready
}

func advanceReadyModelNames(
	ready []string,
	name string,
	dependentsByName map[string][]string,
	inDegree map[string]int,
	originalOrder map[string]int,
) []string {
	for _, dependent := range dependentsByName[name] {
		inDegree[dependent]--
		if inDegree[dependent] == 0 {
			ready = append(ready, dependent)
		}
	}
	sort.SliceStable(ready, func(i int, j int) bool {
		return originalOrder[ready[i]] < originalOrder[ready[j]]
	})
	return ready
}

func pruneModelSpecsWithResolvedReferences(
	models []modelSpec,
	enums []contractSpec,
	aliases []aliasSpec,
) []modelSpec {
	if len(models) == 0 {
		return nil
	}

	current := append([]modelSpec(nil), models...)
	for {
		definedNames := map[string]struct{}{}
		for _, enumSpec := range enums {
			if strings.TrimSpace(enumSpec.Name) == "" {
				continue
			}
			definedNames[enumSpec.Name] = struct{}{}
		}
		for _, alias := range aliases {
			if strings.TrimSpace(alias.Name) == "" {
				continue
			}
			definedNames[alias.Name] = struct{}{}
		}
		for _, model := range current {
			if strings.TrimSpace(model.Name) == "" {
				continue
			}
			definedNames[model.Name] = struct{}{}
		}

		next := make([]modelSpec, 0, len(current))
		changed := false
		for _, model := range current {
			if modelHasUnresolvedTypeRefs(model, definedNames) {
				changed = true
				continue
			}
			next = append(next, model)
		}
		if !changed {
			return current
		}
		current = next
	}
}

func modelHasUnresolvedTypeRefs(
	model modelSpec,
	definedNames map[string]struct{},
) bool {
	externalNames := map[string]struct{}{}
	for line := range model.ExternalImports {
		for _, name := range pythonImportedNames(line) {
			externalNames[name] = struct{}{}
		}
	}
	for _, field := range model.Fields {
		for _, name := range referencedTypeNames(field.TypeExpr) {
			if pythonTypeNameIsBuiltin(name) {
				continue
			}
			if _, ok := definedNames[name]; ok {
				continue
			}
			if _, ok := externalNames[name]; ok {
				continue
			}
			return true
		}
	}
	return false
}

func pythonTypeNameIsBuiltin(name string) bool {
	switch name {
	case "", "Any", "None", "bool", "bytes", "datetime", "dict", "float", "int", "list", "str":
		return true
	default:
		return false
	}
}

func referencedModelNames(
	model modelSpec,
	knownModelNames map[string]struct{},
) map[string]struct{} {
	dependencies := make(map[string]struct{})
	for _, field := range model.Fields {
		for _, name := range referencedTypeNames(field.TypeExpr) {
			if name == model.Name {
				continue
			}
			if _, ok := knownModelNames[name]; ok {
				dependencies[name] = struct{}{}
			}
		}
	}
	return dependencies
}

func referencedTypeNames(typeExpr string) []string {
	names := make([]string, 0)
	seen := map[string]struct{}{}
	var token strings.Builder
	flush := func() {
		if token.Len() == 0 {
			return
		}
		name := token.String()
		token.Reset()
		if name == "" {
			return
		}
		if _, ok := seen[name]; ok {
			return
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	for _, char := range typeExpr {
		if char == '_' || unicode.IsLetter(char) || unicode.IsDigit(char) {
			token.WriteRune(char)
			continue
		}
		flush()
	}
	flush()
	return names
}

func visibleFields(modelType reflect.Type) []reflect.StructField {
	fields := make([]reflect.StructField, 0, modelType.NumField())
	for index := 0; index < modelType.NumField(); index++ {
		field := modelType.Field(index)
		if !field.IsExported() {
			continue
		}
		if field.Tag.Get("json") == "-" {
			continue
		}
		fields = append(fields, field)
	}
	return fields
}

func fieldJSONName(field reflect.StructField) (string, error) {
	tag := strings.TrimSpace(field.Tag.Get("json"))
	if tag == "" {
		return "", fmt.Errorf("missing json tag")
	}
	name := strings.TrimSpace(strings.Split(tag, ",")[0])
	if name == "" {
		return "", fmt.Errorf("missing json field name")
	}
	return name, nil
}

func fieldAllowsMissing(field reflect.StructField) bool {
	tag := strings.TrimSpace(field.Tag.Get("json"))
	if tag == "" {
		return false
	}
	parts := strings.Split(tag, ",")
	for _, part := range parts[1:] {
		if strings.TrimSpace(part) == "omitempty" {
			return true
		}
	}
	return false
}

type pythonTypeSpec struct {
	TypeExpr string
	Imports  map[string]struct{}
}

func pythonFieldTypeSpec(
	field reflect.StructField,
	knownContractNames map[string]struct{},
) (pythonTypeSpec, error) {
	if spec, ok, err := pythonTypeSpecFromSharedSchemaOverride(field, knownContractNames); ok || err != nil {
		return spec, err
	}
	return pythonTypeExprWithImports(
		field.Type,
		strings.TrimSpace(field.Tag.Get("py_type")),
		knownContractNames,
	)
}

func pythonTypeSpecFromSharedSchemaOverride(
	field reflect.StructField,
	knownContractNames map[string]struct{},
) (pythonTypeSpec, bool, error) {
	if strings.TrimSpace(field.Tag.Get("py_type")) != "" {
		return pythonTypeSpec{}, false, nil
	}

	override, ok, err := sharedtypes.SchemaFieldOverrideForField(field)
	if err != nil || !ok {
		return pythonTypeSpec{}, ok, err
	}

	switch {
	case override.Ref != "":
		typeName := strings.TrimSpace(override.Ref)
		if typeName == "" {
			return pythonTypeSpec{}, true, fmt.Errorf("shared schema ref contract name is required")
		}
		return pythonTypeSpec{TypeExpr: typeName}, true, nil
	case override.ItemsRef != "":
		switch field.Type.Kind() {
		case reflect.Slice, reflect.Array:
		default:
			return pythonTypeSpec{}, true, fmt.Errorf(
				"shared schema items ref requires slice or array field, got %s",
				field.Type,
			)
		}
		typeName := strings.TrimSpace(override.ItemsRef)
		if typeName == "" {
			return pythonTypeSpec{}, true, fmt.Errorf("shared schema items ref contract name is required")
		}
		return pythonTypeSpec{TypeExpr: "list[" + typeName + "]"}, true, nil
	case override.MapValueRef != "":
		return pythonTypeSpec{}, false, nil
	default:
		return pythonTypeSpec{}, false, nil
	}
}

func pythonTypeExpr(fieldType reflect.Type, override string) (string, error) {
	spec, err := pythonTypeExprWithImports(fieldType, override, nil)
	if err != nil {
		return "", err
	}
	return spec.TypeExpr, nil
}

func pythonTypeExprWithImports(
	fieldType reflect.Type,
	override string,
	knownContractNames map[string]struct{},
) (pythonTypeSpec, error) {
	if spec, ok := overridePythonTypeSpec(override); ok {
		return spec, nil
	}
	if spec, ok, err := pythonSpecialTypeSpec(fieldType, knownContractNames); ok || err != nil {
		return spec, err
	}
	if spec, ok := pythonPrimitiveTypeSpec(fieldType); ok {
		return spec, nil
	}
	return pythonCompositeTypeSpec(fieldType, knownContractNames)
}

func overridePythonTypeSpec(override string) (pythonTypeSpec, bool) {
	override = strings.TrimSpace(override)
	if override == "" {
		return pythonTypeSpec{}, false
	}
	return pythonTypeSpec{TypeExpr: override}, true
}

func pythonSpecialTypeSpec(
	fieldType reflect.Type,
	knownContractNames map[string]struct{},
) (pythonTypeSpec, bool, error) {
	if fieldType == timeType {
		return pythonTypeSpec{TypeExpr: "datetime"}, true, nil
	}
	if fieldType == rawJSONType {
		return pythonTypeSpec{TypeExpr: "Any"}, true, nil
	}

	publicTypeName := pythonSharedContractNameForType(fieldType)
	if modulePath, ok := pythonExternalTypeModules[fieldType.PkgPath()]; ok &&
		fieldType.Name() != "" {
		if _, sameModule := knownContractNames[publicTypeName]; sameModule {
			return pythonTypeSpec{TypeExpr: publicTypeName}, true, nil
		}
		importLine := fmt.Sprintf("from %s import %s", modulePath, publicTypeName)
		return pythonTypeSpec{
			TypeExpr: publicTypeName,
			Imports: map[string]struct{}{
				importLine: {},
			},
		}, true, nil
	}

	if fieldType.Kind() == reflect.String && fieldType.Name() != "" {
		spec, ok, err := enumContractSpecIfConvertible(fieldType)
		if err != nil {
			return pythonTypeSpec{}, false, err
		}
		if ok {
			return pythonTypeSpec{TypeExpr: spec.Name}, true, nil
		}
	}
	return pythonTypeSpec{}, false, nil
}

func pythonPrimitiveTypeSpec(fieldType reflect.Type) (pythonTypeSpec, bool) {
	switch fieldType.Kind() {
	case reflect.String:
		return pythonTypeSpec{TypeExpr: "str"}, true
	case reflect.Bool:
		return pythonTypeSpec{TypeExpr: "bool"}, true
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return pythonTypeSpec{TypeExpr: "int"}, true
	case reflect.Float32, reflect.Float64:
		return pythonTypeSpec{TypeExpr: "float"}, true
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		if fieldType.Kind() == reflect.Uint8 {
			return pythonTypeSpec{TypeExpr: "bytes"}, true
		}
		return pythonTypeSpec{TypeExpr: "int"}, true
	case reflect.Interface:
		return pythonTypeSpec{TypeExpr: "Any"}, true
	default:
		return pythonTypeSpec{}, false
	}
}

func pythonCompositeTypeSpec(
	fieldType reflect.Type,
	knownContractNames map[string]struct{},
) (pythonTypeSpec, error) {
	switch fieldType.Kind() {
	case reflect.Pointer:
		elemSpec, err := pythonTypeExprWithImports(fieldType.Elem(), "", knownContractNames)
		if err != nil {
			return pythonTypeSpec{}, err
		}
		return pythonTypeSpec{
			TypeExpr: elemSpec.TypeExpr + " | None",
			Imports:  elemSpec.Imports,
		}, nil
	case reflect.Slice:
		if fieldType.Elem().Kind() == reflect.Uint8 {
			return pythonTypeSpec{TypeExpr: "bytes"}, nil
		}
		elemSpec, err := pythonTypeExprWithImports(fieldType.Elem(), "", knownContractNames)
		if err != nil {
			return pythonTypeSpec{}, err
		}
		return pythonTypeSpec{
			TypeExpr: "list[" + elemSpec.TypeExpr + "]",
			Imports:  elemSpec.Imports,
		}, nil
	case reflect.Array:
		elemSpec, err := pythonTypeExprWithImports(fieldType.Elem(), "", knownContractNames)
		if err != nil {
			return pythonTypeSpec{}, err
		}
		return pythonTypeSpec{
			TypeExpr: "list[" + elemSpec.TypeExpr + "]",
			Imports:  elemSpec.Imports,
		}, nil
	case reflect.Map:
		keySpec, err := pythonTypeExprWithImports(fieldType.Key(), "", knownContractNames)
		if err != nil {
			return pythonTypeSpec{}, err
		}
		valueSpec, err := pythonTypeExprWithImports(fieldType.Elem(), "", knownContractNames)
		if err != nil {
			return pythonTypeSpec{}, err
		}
		imports := map[string]struct{}{}
		mergeImportSet(imports, keySpec.Imports)
		mergeImportSet(imports, valueSpec.Imports)
		return pythonTypeSpec{
			TypeExpr: "dict[" + keySpec.TypeExpr + ", " + valueSpec.TypeExpr + "]",
			Imports:  imports,
		}, nil
	case reflect.Struct:
		return pythonTypeSpec{TypeExpr: pythonSharedContractNameForType(fieldType)}, nil
	default:
		return pythonTypeSpec{}, fmt.Errorf("unsupported type %s", fieldType)
	}
}

func pythonDefaultExpr(
	ownerType reflect.Type,
	field reflect.StructField,
	typeExpr string,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (string, error) {
	defaultTag := strings.TrimSpace(field.Tag.Get("py_default"))
	switch defaultTag {
	case "":
		if field.Type.Kind() == reflect.Pointer || strings.HasSuffix(typeExpr, " | None") {
			return "None", nil
		}
		return "", nil
	case "go_value":
		return pythonDefaultExprFromGoValue(ownerType, field, defaultSourcesByType)
	case "factory:list":
		return "Field(default_factory=list)", nil
	case "factory:dict":
		return "Field(default_factory=dict)", nil
	default:
		return defaultTag, nil
	}
}

func pythonDefaultExprFromGoValue(
	ownerType reflect.Type,
	field reflect.StructField,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (string, error) {
	defaultValue, ok := pythonSharedDefaultValueForField(ownerType, field, defaultSourcesByType)
	if !ok {
		defaultValue = reflect.Zero(field.Type)
	}
	return pythonFieldDefaultExprFromValue(defaultValue)
}

func pythonFieldDefaultExprFromValue(value reflect.Value) (string, error) {
	if !value.IsValid() {
		return "None", nil
	}
	if value.Kind() == reflect.Interface {
		return pythonInterfaceFieldDefaultExpr(value)
	}
	if expr, ok, err := pythonCollectionFieldDefaultExpr(value); ok || err != nil {
		return expr, err
	}
	if expr, ok, err := pythonPointerFieldDefaultExpr(value); ok || err != nil {
		return expr, err
	}
	if expr, ok, err := pythonStructuredFieldDefaultExpr(value); ok || err != nil {
		return expr, err
	}
	return pythonValueExpr(value)
}

func pythonInterfaceFieldDefaultExpr(value reflect.Value) (string, error) {
	if value.IsNil() {
		return "None", nil
	}
	return pythonFieldDefaultExprFromValue(value.Elem())
}

func pythonCollectionFieldDefaultExpr(value reflect.Value) (string, bool, error) {
	switch value.Kind() {
	case reflect.Map:
		if value.IsNil() || value.Len() == 0 {
			return "Field(default_factory=dict)", true, nil
		}
		expr, err := pythonValueExpr(value)
		if err != nil {
			return "", true, err
		}
		return "Field(default_factory=lambda: " + expr + ")", true, nil
	case reflect.Slice:
		if value.Type().Elem().Kind() == reflect.Uint8 {
			expr, err := pythonValueExpr(value)
			if err != nil {
				return "", true, err
			}
			return expr, true, nil
		}
		if value.IsNil() || value.Len() == 0 {
			return "Field(default_factory=list)", true, nil
		}
		expr, err := pythonValueExpr(value)
		if err != nil {
			return "", true, err
		}
		return "Field(default_factory=lambda: " + expr + ")", true, nil
	default:
		return "", false, nil
	}
}

func pythonPointerFieldDefaultExpr(value reflect.Value) (string, bool, error) {
	if value.Kind() != reflect.Pointer {
		return "", false, nil
	}
	if value.IsNil() {
		return "None", true, nil
	}
	expr, err := pythonValueExpr(value)
	if err != nil {
		return "", true, err
	}
	return "Field(default_factory=lambda: " + expr + ")", true, nil
}

func pythonStructuredFieldDefaultExpr(value reflect.Value) (string, bool, error) {
	switch value.Kind() {
	case reflect.Struct, reflect.Array:
		expr, err := pythonValueExpr(value)
		if err != nil {
			return "", true, err
		}
		return "Field(default_factory=lambda: " + expr + ")", true, nil
	default:
		return "", false, nil
	}
}

func renderFieldLine(field fieldSpec) string {
	line := "    " + field.Name + ": " + field.TypeExpr
	if field.DefaultExpr == "" {
		return line + "\n"
	}
	return line + " = " + field.DefaultExpr + "\n"
}

func sortedImportNames(imports map[string]struct{}) []string {
	names := make([]string, 0, len(imports))
	for name := range imports {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func pythonEnumMemberName(name string) string {
	if _, ok := pythonKeywords[name]; ok {
		return name + "_"
	}
	return name
}

func aliasSpecsFromSharedSchema(sidecar sharedtypes.SemanticSidecar) ([]aliasSpec, error) {
	aliasExprs, err := pythonSharedSchemaAliasExprs()
	if err != nil {
		return nil, err
	}
	aliases := make([]aliasSpec, 0, len(sidecar.Contracts))
	seenNames := map[string]struct{}{}
	for _, entry := range sidecar.Contracts {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}
		if _, duplicate := seenNames[name]; duplicate {
			continue
		}
		typeExpr, ok := aliasExprs[name]
		if !ok {
			continue
		}
		aliases = append(aliases, aliasSpec{
			Name:     name,
			TypeExpr: typeExpr,
		})
		seenNames[name] = struct{}{}
	}
	return aliases, nil
}

func pythonSharedTypeHasSchemaAlias(t reflect.Type) (bool, error) {
	aliasExprs, err := pythonSharedSchemaAliasExprs()
	if err != nil {
		return false, err
	}
	typeExpr, ok := aliasExprs[pythonSharedContractNameForType(t)]
	return ok && strings.TrimSpace(typeExpr) != "", nil
}
