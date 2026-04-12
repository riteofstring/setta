package pythonsharedtypes

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"setta/internal/sharedtypes"
)

const (
	pythonSharedAliasTargetVersion = "3.12"
	datamodelGeneratorModule       = "datamodel_code_generator"
)

var cachedPythonSharedProjectionDocument = sync.OnceValues(buildPythonSharedProjectionDocument)
var cachedPythonSharedProjectionSchemas = sync.OnceValues(buildPythonSharedProjectionSchemas)
var cachedPythonSharedSchemaModule = sync.OnceValues(buildPythonSharedSchemaModule)

func pythonSharedProjectionDocument() (map[string]any, error) {
	return cachedPythonSharedProjectionDocument()
}

func pythonSharedProjectionSchemas() (map[string]any, error) {
	return cachedPythonSharedProjectionSchemas()
}

func pythonSharedSchemaModule() (string, error) { return cachedPythonSharedSchemaModule() }

func buildPythonSharedProjectionDocument() (map[string]any, error) {
	return sharedtypes.BuildOpenAPIProjectionDocument()
}

func buildPythonSharedProjectionSchemas() (map[string]any, error) {
	document, err := pythonSharedProjectionDocument()
	if err != nil {
		return nil, err
	}
	componentsValue, ok := document["components"]
	if !ok {
		return nil, fmt.Errorf("python shared types: OpenAPI projection is missing components")
	}
	components, ok := componentsValue.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("python shared types: OpenAPI projection components has unsupported shape %T", componentsValue)
	}
	schemasValue, ok := components["schemas"]
	if !ok {
		return nil, fmt.Errorf("python shared types: OpenAPI projection is missing component schemas")
	}
	schemas, ok := schemasValue.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("python shared types: OpenAPI projection component schemas has unsupported shape %T", schemasValue)
	}
	return schemas, nil
}

func buildPythonSharedSchemaModule() (string, error) {
	document, err := pythonSharedProjectionDocument()
	if err != nil {
		return "", err
	}

	tempDir, err := os.MkdirTemp("", "setta-python-shared-schema-*")
	if err != nil {
		return "", fmt.Errorf("python shared types: create datamodel temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	inputPath := filepath.Join(tempDir, "openapi.json")
	outputPath := filepath.Join(tempDir, "schema.py")
	payload, err := json.Marshal(document)
	if err != nil {
		return "", fmt.Errorf("python shared types: marshal shared OpenAPI projection: %w", err)
	}
	if err := os.WriteFile(inputPath, payload, 0o600); err != nil {
		return "", fmt.Errorf("python shared types: write shared OpenAPI projection: %w", err)
	}

	pythonBin, err := pythonGeneratorExecutable()
	if err != nil {
		return "", err
	}

	cmd := exec.Command(
		pythonBin,
		"-m", datamodelGeneratorModule,
		"--input", inputPath,
		"--input-file-type", "openapi",
		"--schema-version", "3.1",
		"--output-model-type", "pydantic_v2.BaseModel",
		"--output-datetime-class", "datetime",
		"--target-python-version", pythonSharedAliasTargetVersion,
		"--disable-timestamp",
		"--use-double-quotes",
		"--use-title-as-name",
		"--parent-scoped-naming",
		"--use-root-model-type-alias",
		"--use-type-alias",
		"--use-default",
		"--strict-nullable",
		"--set-default-enum-member",
		"--field-type-collision-strategy", "rename-type",
		"--disable-appending-item-suffix",
		"--output", outputPath,
	)
	commandOutput, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(commandOutput))
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("python shared types: run %q: %s", strings.Join(cmd.Args, " "), message)
	}

	module, err := os.ReadFile(outputPath)
	if err != nil {
		return "", fmt.Errorf("python shared types: read datamodel module output: %w", err)
	}
	return string(module), nil
}

func pythonGeneratorExecutable() (string, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("python shared types: runtime caller lookup failed")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
	for _, candidate := range []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		"python3",
		"python",
	} {
		path, err := exec.LookPath(candidate)
		if err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("python shared types: no python executable found for datamodel-code-generator")
}

func pythonSharedSchemaDeclarations(
	defaultSourcesByType map[reflect.Type]reflect.Value,
) ([]string, []string, error) {
	module, err := pythonSharedSchemaModule()
	if err != nil {
		return nil, nil, err
	}
	schemasByName, err := pythonSharedProjectionSchemas()
	if err != nil {
		return nil, nil, err
	}
	return pythonSharedSchemaDeclarationsFromModule(module, defaultSourcesByType, schemasByName)
}

type pythonSharedSchemaBlock struct {
	text   string
	lines  []string
	header string
}

func pythonSharedSchemaDeclarationsFromModule(
	module string,
	defaultSourcesByType map[reflect.Type]reflect.Value,
	schemasByName map[string]any,
) ([]string, []string, error) {
	imports := map[string]struct{}{}
	blocks := []string{}
	sawDeclaration := false
	for _, rawBlock := range strings.Split(module, "\n\n") {
		block, ok := newPythonSharedSchemaBlock(rawBlock)
		if !ok || block.shouldSkip() {
			continue
		}
		if !sawDeclaration && block.isImportBlock() {
			mergeImportSet(imports, block.importLines())
			continue
		}
		updatedBlock, declarationImports, err := rewritePythonSharedSchemaBlock(
			block,
			defaultSourcesByType,
			schemasByName,
		)
		if err != nil {
			return nil, nil, err
		}
		sawDeclaration = true
		mergeImportSet(imports, declarationImports)
		blocks = append(blocks, updatedBlock)
	}
	return blocks, sortedImportNames(imports), nil
}

func newPythonSharedSchemaBlock(raw string) (pythonSharedSchemaBlock, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return pythonSharedSchemaBlock{}, false
	}
	lines := strings.Split(trimmed, "\n")
	return pythonSharedSchemaBlock{
		text:   trimmed,
		lines:  lines,
		header: strings.TrimSpace(lines[0]),
	}, true
}

func (block pythonSharedSchemaBlock) shouldSkip() bool {
	return block.header == "" ||
		strings.HasPrefix(block.header, "#") ||
		block.header == "from __future__ import annotations"
}

func (block pythonSharedSchemaBlock) isImportBlock() bool {
	return strings.HasPrefix(block.header, "from ") || strings.HasPrefix(block.header, "import ")
}

func (block pythonSharedSchemaBlock) importLines() map[string]struct{} {
	imports := map[string]struct{}{}
	for _, line := range block.lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" ||
			strings.HasPrefix(trimmed, "#") ||
			trimmed == "from __future__ import annotations" {
			continue
		}
		if !strings.HasPrefix(trimmed, "from ") && !strings.HasPrefix(trimmed, "import ") {
			continue
		}
		imports[trimmed] = struct{}{}
	}
	return imports
}

func (block pythonSharedSchemaBlock) classDeclarationName() (string, bool, error) {
	if !strings.HasPrefix(block.header, "class ") {
		return "", false, nil
	}
	declarationName := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(block.header, "class "), ":"))
	if before, _, ok := strings.Cut(declarationName, "("); ok {
		declarationName = strings.TrimSpace(before)
	}
	if declarationName == "" {
		return "", false, fmt.Errorf("python shared types: datamodel class has empty name")
	}
	return declarationName, true, nil
}

func rewritePythonSharedSchemaBlock(
	block pythonSharedSchemaBlock,
	defaultSourcesByType map[reflect.Type]reflect.Value,
	schemasByName map[string]any,
) (string, map[string]struct{}, error) {
	declarationName, isClass, err := block.classDeclarationName()
	if err != nil {
		return "", nil, err
	}
	if !isClass {
		return block.text, nil, nil
	}
	ownerType, ok := sharedtypes.TypeByContractName(declarationName)
	if !ok || ownerType == nil || ownerType.Kind() != reflect.Struct {
		return block.text, nil, nil
	}
	return renderGoBackedDatamodelClassBlock(
		declarationName,
		ownerType,
		defaultSourcesByType,
		schemasByName,
	)
}

func renderGoBackedDatamodelClassBlock(
	contractName string,
	ownerType reflect.Type,
	defaultSourcesByType map[reflect.Type]reflect.Value,
	schemasByName map[string]any,
) (string, map[string]struct{}, error) {
	properties, err := goBackedProjectedSchemaProperties(contractName, schemasByName)
	if err != nil {
		return "", nil, err
	}
	lines, imports, err := renderGoBackedDatamodelFieldLines(
		contractName,
		ownerType,
		defaultSourcesByType,
		properties,
	)
	if err != nil {
		return "", nil, err
	}
	return strings.Join(append(goBackedDatamodelClassHeader(contractName), lines...), "\n"), imports, nil
}

func goBackedProjectedSchemaProperties(
	contractName string,
	schemasByName map[string]any,
) (map[string]any, error) {
	rawSchema, ok := schemasByName[contractName]
	if !ok {
		return nil, fmt.Errorf("python shared types: missing projected schema for %s", contractName)
	}
	schema, ok := rawSchema.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("python shared types: projected schema %s has unsupported shape %T", contractName, rawSchema)
	}
	properties, err := projectedSchemaProperties(schema)
	if err != nil {
		return nil, fmt.Errorf("python shared types: %s: %w", contractName, err)
	}
	return properties, nil
}

func goBackedDatamodelClassHeader(contractName string) []string {
	return []string{
		fmt.Sprintf("class %s(BaseModel):", contractName),
		"    model_config = ConfigDict(",
		`        extra="forbid",`,
		"    )",
	}
}

func renderGoBackedDatamodelFieldLines(
	contractName string,
	ownerType reflect.Type,
	defaultSourcesByType map[reflect.Type]reflect.Value,
	properties map[string]any,
) ([]string, map[string]struct{}, error) {
	imports := map[string]struct{}{}
	lines := []string{}
	for _, field := range reflect.VisibleFields(ownerType) {
		if !shouldRenderGoBackedDatamodelField(field) {
			continue
		}
		renderedLine, fieldImports, err := renderGoBackedDatamodelFieldLine(
			contractName,
			ownerType,
			field,
			defaultSourcesByType,
			properties,
		)
		if err != nil {
			return nil, nil, err
		}
		mergeImportSet(imports, fieldImports)
		lines = append(lines, renderedLine)
	}
	return lines, imports, nil
}

func shouldRenderGoBackedDatamodelField(field reflect.StructField) bool {
	return field.IsExported() && !field.Anonymous && field.Tag.Get("json") != "-"
}

func renderGoBackedDatamodelFieldLine(
	contractName string,
	ownerType reflect.Type,
	field reflect.StructField,
	defaultSourcesByType map[reflect.Type]reflect.Value,
	properties map[string]any,
) (string, map[string]struct{}, error) {
	jsonName, err := fieldJSONName(field)
	if err != nil {
		return "", nil, fmt.Errorf(
			"python shared types: %s: %w",
			contractName,
			err,
		)
	}
	propertySchema, exists := properties[jsonName]
	if !exists {
		return "", nil, fmt.Errorf(
			"python shared types: %s.%s: missing projected property %q",
			contractName,
			field.Name,
			jsonName,
		)
	}
	currentTypeExpr, err := pythonProjectedFieldTypeExpr(contractName, field, propertySchema)
	if err != nil {
		return "", nil, err
	}
	return buildModelFieldLine(
		contractName,
		ownerType,
		field,
		currentTypeExpr,
		defaultSourcesByType,
	)
}

func pythonProjectedFieldTypeExpr(contractName string, field reflect.StructField, propertySchema any) (string, error) {
	currentTypeExpr, err := pythonProjectedSchemaTypeExpr(propertySchema)
	if err != nil {
		return "", fmt.Errorf(
			"python shared types: %s.%s: %w",
			contractName,
			field.Name,
			err,
		)
	}
	if discriminatorValue := strings.TrimSpace(field.Tag.Get("shared_discriminator")); discriminatorValue != "" {
		currentTypeExpr = fmt.Sprintf("Literal[%q]", discriminatorValue)
	}
	if shouldStripProjectedNullability(field) {
		currentTypeExpr = stripProjectedNoneType(currentTypeExpr)
	}
	return currentTypeExpr, nil
}

func shouldStripProjectedNullability(field reflect.StructField) bool {
	if field.Type.Kind() == reflect.Pointer {
		return false
	}
	defaultTag := strings.TrimSpace(field.Tag.Get("py_default"))
	switch field.Type.Kind() {
	case reflect.Slice:
		return defaultTag == "factory:list" || defaultTag == "go_value"
	case reflect.Map:
		return defaultTag == "factory:dict" || defaultTag == "go_value"
	default:
		return false
	}
}

func stripProjectedNoneType(typeExpr string) string {
	typeExpr = strings.TrimSpace(typeExpr)
	typeExpr = strings.TrimSuffix(typeExpr, " | None")
	typeExpr = strings.TrimSuffix(typeExpr, "| None")
	return strings.TrimSpace(typeExpr)
}

func projectedSchemaProperties(schema map[string]any) (map[string]any, error) {
	rawProperties, ok := schema["properties"]
	if !ok {
		return nil, fmt.Errorf("projected model schema is missing properties")
	}
	properties, ok := rawProperties.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("projected model schema properties have unsupported shape %T", rawProperties)
	}
	return properties, nil
}

func pythonProjectedSchemaTypeExpr(schema any) (string, error) {
	switch typed := schema.(type) {
	case bool:
		return "Any", nil
	case map[string]any:
		if refName := projectedSchemaRefName(typed); refName != "" {
			return refName, nil
		}
		if enumValues, ok := typed["enum"]; ok {
			return pythonProjectedEnumTypeExpr(enumValues)
		}
		if anyOf, ok := typed["anyOf"]; ok {
			return pythonProjectedUnionTypeExpr(anyOf)
		}
		if oneOf, ok := typed["oneOf"]; ok {
			return pythonProjectedUnionTypeExpr(oneOf)
		}
		types, ok, err := projectedSchemaTypes(typed["type"])
		if err != nil {
			return "", err
		}
		if ok {
			return pythonProjectedTypeExprFromTypes(types, typed)
		}
		if additionalProperties, ok := typed["additionalProperties"]; ok {
			return pythonProjectedMapTypeExpr(additionalProperties)
		}
		if _, ok := typed["properties"]; ok {
			return "dict[str, Any]", nil
		}
		return "Any", nil
	default:
		return "", fmt.Errorf("unsupported projected schema shape %T", schema)
	}
}

func pythonProjectedUnionTypeExpr(raw any) (string, error) {
	members, ok := raw.([]any)
	if !ok {
		return "", fmt.Errorf("projected union members have unsupported shape %T", raw)
	}
	parts := make([]string, 0, len(members))
	seen := map[string]struct{}{}
	for _, member := range members {
		expr, err := pythonProjectedSchemaTypeExpr(member)
		if err != nil {
			return "", err
		}
		expr = strings.TrimSpace(expr)
		if expr == "" {
			continue
		}
		if _, exists := seen[expr]; exists {
			continue
		}
		seen[expr] = struct{}{}
		parts = append(parts, expr)
	}
	if len(parts) == 0 {
		return "Any", nil
	}
	if len(parts) == 1 {
		return parts[0], nil
	}
	return strings.Join(parts, " | "), nil
}

func pythonProjectedEnumTypeExpr(raw any) (string, error) {
	values, ok := raw.([]any)
	if !ok {
		return "", fmt.Errorf("projected enum values have unsupported shape %T", raw)
	}
	if len(values) == 0 {
		return "Any", nil
	}
	literals := make([]string, 0, len(values))
	for _, value := range values {
		switch typed := value.(type) {
		case string:
			literals = append(literals, strconv.Quote(typed))
		case float64:
			literals = append(literals, strconv.FormatFloat(typed, 'f', -1, 64))
		case bool:
			if typed {
				literals = append(literals, "True")
			} else {
				literals = append(literals, "False")
			}
		case nil:
			literals = append(literals, "None")
		default:
			return "", fmt.Errorf("unsupported projected enum value %T", value)
		}
	}
	return "Literal[" + strings.Join(literals, ", ") + "]", nil
}

func projectedSchemaTypes(value any) ([]string, bool, error) {
	switch typed := value.(type) {
	case nil:
		return nil, false, nil
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil, false, nil
		}
		return []string{trimmed}, true, nil
	case []any:
		types := make([]string, 0, len(typed))
		for _, entry := range typed {
			typeName, ok := entry.(string)
			if !ok {
				return nil, false, fmt.Errorf("projected schema type list contains %T", entry)
			}
			typeName = strings.TrimSpace(typeName)
			if typeName == "" {
				continue
			}
			types = append(types, typeName)
		}
		if len(types) == 0 {
			return nil, false, nil
		}
		return types, true, nil
	default:
		return nil, false, fmt.Errorf("projected schema type has unsupported shape %T", value)
	}
}

func pythonProjectedTypeExprFromTypes(types []string, schema map[string]any) (string, error) {
	hasNull := false
	parts := make([]string, 0, len(types))
	seen := map[string]struct{}{}
	for _, typeName := range types {
		if typeName == "null" {
			hasNull = true
			continue
		}
		expr, err := pythonProjectedBaseTypeExpr(typeName, schema)
		if err != nil {
			return "", err
		}
		if _, exists := seen[expr]; exists {
			continue
		}
		seen[expr] = struct{}{}
		parts = append(parts, expr)
	}
	if len(parts) == 0 {
		if hasNull {
			return "None", nil
		}
		return "Any", nil
	}
	if hasNull {
		parts = append(parts, "None")
	}
	if len(parts) == 1 {
		return parts[0], nil
	}
	return strings.Join(parts, " | "), nil
}

func pythonProjectedBaseTypeExpr(typeName string, schema map[string]any) (string, error) {
	switch strings.TrimSpace(typeName) {
	case "string":
		return pythonProjectedStringTypeExpr(schema), nil
	case "integer":
		return "int", nil
	case "number":
		return "float", nil
	case "boolean":
		return "bool", nil
	case "object":
		return pythonProjectedObjectTypeExpr(schema)
	case "array":
		return pythonProjectedArrayTypeExpr(schema)
	case "null":
		return "None", nil
	default:
		return "", fmt.Errorf("unsupported projected schema type %q", typeName)
	}
}

func pythonProjectedStringTypeExpr(schema map[string]any) string {
	if strings.TrimSpace(stringValue(schema["format"])) == "date-time" {
		return "datetime"
	}
	return "str"
}

func pythonProjectedObjectTypeExpr(schema map[string]any) (string, error) {
	if additionalProperties, ok := schema["additionalProperties"]; ok {
		return pythonProjectedMapTypeExpr(additionalProperties)
	}
	return "dict[str, Any]", nil
}

func pythonProjectedArrayTypeExpr(schema map[string]any) (string, error) {
	itemExpr := "Any"
	if items, ok := schema["items"]; ok {
		var err error
		itemExpr, err = pythonProjectedSchemaTypeExpr(items)
		if err != nil {
			return "", err
		}
	}
	return "list[" + itemExpr + "]", nil
}

func pythonProjectedMapTypeExpr(additionalProperties any) (string, error) {
	switch typed := additionalProperties.(type) {
	case nil:
		return "dict[str, Any]", nil
	case bool:
		if typed {
			return "dict[str, Any]", nil
		}
		return "dict[str, Any]", nil
	default:
		valueExpr, err := pythonProjectedSchemaTypeExpr(additionalProperties)
		if err != nil {
			return "", err
		}
		return "dict[str, " + valueExpr + "]", nil
	}
}

func projectedSchemaRefName(schema map[string]any) string {
	ref, _ := schema["$ref"].(string)
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return ""
	}
	return strings.TrimPrefix(ref, "#/components/schemas/")
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}
