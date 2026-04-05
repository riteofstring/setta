package pythonsharedtypes

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"

	"setta/internal/sharedtypes"
)

const (
	pythonSharedAliasTargetVersion = "3.12"
	datamodelGeneratorModule       = "datamodel_code_generator"
)

type datamodelDeclarationKind string

const (
	datamodelDeclarationKindClass datamodelDeclarationKind = "class"
	datamodelDeclarationKindType  datamodelDeclarationKind = "type"
)

type datamodelDeclaration struct {
	Name         string
	Kind         datamodelDeclarationKind
	Block        string
	Dependencies []string
}

type datamodelModule struct {
	ImportLines       []string
	Declarations      []datamodelDeclaration
	declarationByName map[string]datamodelDeclaration
}

var (
	pythonSharedSchemaModuleOnce sync.Once
	pythonSharedSchemaModuleData datamodelModule
	pythonSharedSchemaModuleErr  error

	pythonSharedSchemaAliasExprsOnce sync.Once
	pythonSharedSchemaAliasExprsMap  map[string]string
	pythonSharedSchemaAliasExprsErr  error
)

func pythonSharedSchemaModule() (datamodelModule, error) {
	pythonSharedSchemaModuleOnce.Do(func() {
		pythonSharedSchemaModuleData, pythonSharedSchemaModuleErr = buildPythonSharedSchemaModule()
	})
	if pythonSharedSchemaModuleErr != nil {
		return datamodelModule{}, pythonSharedSchemaModuleErr
	}
	return pythonSharedSchemaModuleData, nil
}

func buildPythonSharedSchemaModule() (datamodelModule, error) {
	document, err := sharedtypes.BuildOpenAPIProjectionDocument()
	if err != nil {
		return datamodelModule{}, err
	}

	tempDir, err := os.MkdirTemp("", "setta-python-shared-schema-*")
	if err != nil {
		return datamodelModule{}, fmt.Errorf("python shared types: create datamodel temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	inputPath := filepath.Join(tempDir, "openapi.json")
	outputPath := filepath.Join(tempDir, "schema.py")
	payload, err := json.Marshal(document)
	if err != nil {
		return datamodelModule{}, fmt.Errorf("python shared types: marshal shared OpenAPI projection: %w", err)
	}
	if err := os.WriteFile(inputPath, payload, 0o600); err != nil {
		return datamodelModule{}, fmt.Errorf("python shared types: write shared OpenAPI projection: %w", err)
	}

	pythonBin, err := pythonGeneratorExecutable()
	if err != nil {
		return datamodelModule{}, err
	}

	cmd := exec.Command(
		pythonBin,
		"-m", datamodelGeneratorModule,
		"--input", inputPath,
		"--input-file-type", "openapi",
		"--schema-version", "3.1",
		"--output-model-type", "pydantic_v2.BaseModel",
		"--target-python-version", pythonSharedAliasTargetVersion,
		"--disable-timestamp",
		"--use-double-quotes",
		"--use-title-as-name",
		"--parent-scoped-naming",
		"--use-root-model-type-alias",
		"--use-type-alias",
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
		return datamodelModule{}, fmt.Errorf("python shared types: run %q: %s", strings.Join(cmd.Args, " "), message)
	}

	module, err := os.ReadFile(outputPath)
	if err != nil {
		return datamodelModule{}, fmt.Errorf("python shared types: read datamodel module output: %w", err)
	}
	return parseDatamodelModule(string(module))
}

func pythonGeneratorExecutable() (string, error) {
	repoRoot, err := repoRootFromCaller()
	if err != nil {
		return "", err
	}
	candidate := filepath.Join(repoRoot, ".venv", "bin", "python")
	if info, statErr := os.Stat(candidate); statErr == nil && !info.IsDir() {
		return candidate, nil
	}
	if path, lookErr := exec.LookPath("python3"); lookErr == nil {
		return path, nil
	}
	if path, lookErr := exec.LookPath("python"); lookErr == nil {
		return path, nil
	}
	return "", fmt.Errorf("python shared types: no python executable found for datamodel-code-generator")
}

func repoRootFromCaller() (string, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("python shared types: runtime caller lookup failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", "..")), nil
}

func pythonSharedSchemaAliasExprs() (map[string]string, error) {
	pythonSharedSchemaAliasExprsOnce.Do(func() {
		pythonSharedSchemaAliasExprsMap, pythonSharedSchemaAliasExprsErr = buildPythonSharedSchemaAliasExprs()
	})
	if pythonSharedSchemaAliasExprsErr != nil {
		return nil, pythonSharedSchemaAliasExprsErr
	}
	return pythonSharedSchemaAliasExprsMap, nil
}

func buildPythonSharedSchemaAliasExprs() (map[string]string, error) {
	module, err := pythonSharedSchemaModule()
	if err != nil {
		return nil, err
	}
	aliases := map[string]string{}
	for _, declaration := range module.Declarations {
		if declaration.Kind != datamodelDeclarationKindType {
			continue
		}
		name, expr, err := parseDatamodelTypeAliasBlock(strings.Split(declaration.Block, "\n"))
		if err != nil {
			return nil, err
		}
		if name == "" || datamodelAliasExprReferencesName(name, expr) {
			continue
		}
		aliases[name] = expr
	}
	return aliases, nil
}

func pythonSharedSchemaDeclarations(
	sidecar sharedtypes.SemanticSidecar,
	defaultSourcesByType map[reflect.Type]reflect.Value,
	excludedNames map[string]struct{},
) ([]string, []string, map[string]struct{}, error) {
	module, err := pythonSharedSchemaModule()
	if err != nil {
		return nil, nil, nil, err
	}

	rootNames := map[string]struct{}{}
	for _, entry := range sidecar.Contracts {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}
		if _, excluded := excludedNames[name]; excluded {
			continue
		}
		rootNames[name] = struct{}{}
	}

	selected := reachableDatamodelDeclarations(module, rootNames, excludedNames)
	blocks := make([]string, 0, len(selected))
	includedNames := make(map[string]struct{}, len(selected))
	for _, declaration := range selected {
		updated, err := applyPythonDefaultsToDatamodelDeclaration(declaration, defaultSourcesByType)
		if err != nil {
			return nil, nil, nil, err
		}
		blocks = append(blocks, updated.Block)
		includedNames[updated.Name] = struct{}{}
	}
	return blocks, append([]string(nil), module.ImportLines...), includedNames, nil
}

func reachableDatamodelDeclarations(
	module datamodelModule,
	rootNames map[string]struct{},
	excludedNames map[string]struct{},
) []datamodelDeclaration {
	included := map[string]struct{}{}
	queue := make([]string, 0, len(rootNames))

	enqueue := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" {
			return
		}
		if _, excluded := excludedNames[name]; excluded {
			return
		}
		if _, ok := module.declarationByName[name]; !ok {
			return
		}
		if _, seen := included[name]; seen {
			return
		}
		included[name] = struct{}{}
		queue = append(queue, name)
	}

	for name := range rootNames {
		enqueue(name)
	}
	for len(queue) > 0 {
		name := queue[0]
		queue = queue[1:]
		declaration, ok := module.declarationByName[name]
		if !ok {
			continue
		}
		for _, dependency := range declaration.Dependencies {
			enqueue(dependency)
		}
	}

	selected := make([]datamodelDeclaration, 0, len(included))
	for _, declaration := range module.Declarations {
		if _, ok := included[declaration.Name]; !ok {
			continue
		}
		selected = append(selected, declaration)
	}
	return selected
}

func applyPythonDefaultsToDatamodelDeclaration(
	declaration datamodelDeclaration,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (datamodelDeclaration, error) {
	if declaration.Kind != datamodelDeclarationKindClass {
		return declaration, nil
	}

	ownerType, ok := sharedtypes.TypeByContractName(declaration.Name)
	if !ok || ownerType == nil || ownerType.Kind() != reflect.Struct {
		return declaration, nil
	}

	block, changed, err := applyPythonDefaultsToDatamodelClassBlock(
		declaration.Block,
		ownerType,
		defaultSourcesByType,
	)
	if err != nil {
		return datamodelDeclaration{}, err
	}
	if !changed {
		return declaration, nil
	}

	updated := declaration
	updated.Block = block
	return updated, nil
}

func applyPythonDefaultsToDatamodelClassBlock(
	block string,
	ownerType reflect.Type,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (string, bool, error) {
	lines := strings.Split(block, "\n")
	fieldsByJSONName, err := datamodelFieldsByJSONName(ownerType)
	if err != nil {
		return "", false, err
	}

	changed := false
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		fieldName, typeExpr, ok := datamodelClassFieldTypeExpr(trimmed)
		if !ok {
			continue
		}

		field, exists := fieldsByJSONName[fieldName]
		if !exists {
			continue
		}
		if strings.TrimSpace(field.Tag.Get("py_default")) == "" {
			continue
		}

		defaultExpr, err := pythonDefaultExpr(ownerType, field, typeExpr, defaultSourcesByType)
		if err != nil {
			return "", false, fmt.Errorf(
				"python shared types: %s.%s: %w",
				ownerType,
				field.Name,
				err,
			)
		}
		if defaultExpr == "" {
			continue
		}

		lines[index] = fmt.Sprintf(
			"    %s: %s = %s",
			fieldName,
			datamodelFieldTypeExprWithPythonDefault(field, typeExpr, defaultExpr),
			defaultExpr,
		)
		changed = true
	}

	return strings.Join(lines, "\n"), changed, nil
}

func datamodelFieldsByJSONName(ownerType reflect.Type) (map[string]reflect.StructField, error) {
	fieldsByJSONName := make(map[string]reflect.StructField, ownerType.NumField())
	for _, field := range visibleFields(ownerType) {
		if strings.TrimSpace(field.Tag.Get("py_default")) == "" {
			continue
		}
		jsonName, err := fieldJSONName(field)
		if err != nil {
			return nil, fmt.Errorf("python shared types: %s.%s: %w", ownerType, field.Name, err)
		}
		fieldsByJSONName[jsonName] = field
	}
	return fieldsByJSONName, nil
}

func datamodelFieldTypeExprWithPythonDefault(
	field reflect.StructField,
	typeExpr string,
	defaultExpr string,
) string {
	typeExpr = strings.TrimSpace(typeExpr)
	if defaultExpr == "" || defaultExpr == "None" {
		return typeExpr
	}
	if field.Type.Kind() == reflect.Pointer {
		return typeExpr
	}
	return strings.TrimSuffix(typeExpr, " | None")
}

func parseDatamodelModule(module string) (datamodelModule, error) {
	importLines := datamodelImportLines(module)
	declarations, err := parseDatamodelDeclarations(module)
	if err != nil {
		return datamodelModule{}, err
	}
	declarationByName := make(map[string]datamodelDeclaration, len(declarations))
	for _, declaration := range declarations {
		declarationByName[declaration.Name] = declaration
	}
	return datamodelModule{
		ImportLines:       importLines,
		Declarations:      declarations,
		declarationByName: declarationByName,
	}, nil
}

func datamodelImportLines(module string) []string {
	lines := strings.Split(module, "\n")
	imports := []string{}
	seen := map[string]struct{}{}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "", strings.HasPrefix(trimmed, "#"):
			continue
		case trimmed == "from __future__ import annotations":
			continue
		case isDatamodelDeclarationStart(line):
			return imports
		case strings.HasPrefix(trimmed, "from "), strings.HasPrefix(trimmed, "import "):
			if _, duplicate := seen[trimmed]; duplicate {
				continue
			}
			seen[trimmed] = struct{}{}
			imports = append(imports, trimmed)
		}
	}
	return imports
}

func parseDatamodelDeclarations(module string) ([]datamodelDeclaration, error) {
	lines := strings.Split(module, "\n")
	declarations := []datamodelDeclaration{}
	start := -1
	for index, line := range lines {
		if !isDatamodelDeclarationStart(line) {
			continue
		}
		if start >= 0 {
			declaration, err := parseDatamodelDeclaration(lines[start:index])
			if err != nil {
				return nil, err
			}
			declarations = append(declarations, declaration)
		}
		start = index
	}
	if start >= 0 {
		declaration, err := parseDatamodelDeclaration(lines[start:])
		if err != nil {
			return nil, err
		}
		declarations = append(declarations, declaration)
	}
	return declarations, nil
}

func isDatamodelDeclarationStart(line string) bool {
	trimmedLeft := strings.TrimLeft(line, " \t")
	if trimmedLeft != line {
		return false
	}
	trimmed := strings.TrimSpace(line)
	return strings.HasPrefix(trimmed, "class ") || strings.HasPrefix(trimmed, "type ")
}

func parseDatamodelDeclaration(lines []string) (datamodelDeclaration, error) {
	blockLines := trimDatamodelBlockLines(lines)
	if len(blockLines) == 0 {
		return datamodelDeclaration{}, fmt.Errorf("python shared types: empty datamodel declaration block")
	}
	header := strings.TrimSpace(blockLines[0])
	switch {
	case strings.HasPrefix(header, "class "):
		name, err := parseDatamodelClassName(header)
		if err != nil {
			return datamodelDeclaration{}, err
		}
		return datamodelDeclaration{
			Name:         name,
			Kind:         datamodelDeclarationKindClass,
			Block:        strings.Join(blockLines, "\n"),
			Dependencies: datamodelClassDependencies(blockLines),
		}, nil
	case strings.HasPrefix(header, "type "):
		name, expr, err := parseDatamodelTypeAliasBlock(blockLines)
		if err != nil {
			return datamodelDeclaration{}, err
		}
		return datamodelDeclaration{
			Name:         name,
			Kind:         datamodelDeclarationKindType,
			Block:        strings.Join(blockLines, "\n"),
			Dependencies: datamodelAliasDependencies(expr),
		}, nil
	default:
		return datamodelDeclaration{}, fmt.Errorf("python shared types: unsupported datamodel declaration header %q", header)
	}
}

func trimDatamodelBlockLines(lines []string) []string {
	start := 0
	for start < len(lines) && strings.TrimSpace(lines[start]) == "" {
		start++
	}
	end := len(lines)
	for end > start && strings.TrimSpace(lines[end-1]) == "" {
		end--
	}
	trimmed := make([]string, 0, end-start)
	for _, line := range lines[start:end] {
		trimmed = append(trimmed, strings.TrimRight(line, " \t"))
	}
	return trimmed
}

func parseDatamodelClassName(header string) (string, error) {
	name := strings.TrimSpace(strings.TrimPrefix(header, "class "))
	if before, _, ok := strings.Cut(name, "("); ok {
		name = strings.TrimSpace(before)
	}
	name = strings.TrimSuffix(name, ":")
	if name == "" {
		return "", fmt.Errorf("python shared types: datamodel class has empty name")
	}
	return name, nil
}

func datamodelClassDependencies(lines []string) []string {
	dependencies := map[string]struct{}{}
	for _, line := range lines[1:] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "model_config") {
			continue
		}
		fieldName, typeExpr, ok := datamodelClassFieldTypeExpr(trimmed)
		if !ok || fieldName == "" {
			continue
		}
		for _, name := range referencedTypeNames(typeExpr) {
			if pythonTypeNameIsBuiltin(name) {
				continue
			}
			dependencies[name] = struct{}{}
		}
	}
	return sortedImportNames(dependencies)
}

func datamodelClassFieldTypeExpr(line string) (string, string, bool) {
	fieldName, rhs, ok := strings.Cut(line, ": ")
	if !ok {
		return "", "", false
	}
	fieldName = strings.TrimSpace(fieldName)
	if fieldName == "" || strings.Contains(fieldName, " ") {
		return "", "", false
	}
	typeExpr := strings.TrimSpace(rhs)
	if before, _, ok := strings.Cut(typeExpr, " = "); ok {
		typeExpr = strings.TrimSpace(before)
	}
	if typeExpr == "" {
		return "", "", false
	}
	return fieldName, typeExpr, true
}

func datamodelAliasDependencies(expr string) []string {
	dependencies := map[string]struct{}{}
	for _, name := range referencedTypeNames(expr) {
		if pythonTypeNameIsBuiltin(name) {
			continue
		}
		dependencies[name] = struct{}{}
	}
	return sortedImportNames(dependencies)
}

func extractDatamodelTypeAliases(module string) (map[string]string, error) {
	parsed, err := parseDatamodelModule(module)
	if err != nil {
		return nil, err
	}
	aliases := map[string]string{}
	for _, declaration := range parsed.Declarations {
		if declaration.Kind != datamodelDeclarationKindType {
			continue
		}
		name, expr, err := parseDatamodelTypeAliasBlock(strings.Split(declaration.Block, "\n"))
		if err != nil {
			return nil, err
		}
		if name == "" {
			continue
		}
		if datamodelAliasExprReferencesName(name, expr) {
			continue
		}
		aliases[name] = expr
	}
	return aliases, nil
}

func parseDatamodelTypeAliasBlock(lines []string) (string, string, error) {
	if len(lines) == 0 {
		return "", "", fmt.Errorf("python shared types: empty datamodel alias block")
	}
	header := strings.TrimSpace(strings.TrimPrefix(lines[0], "type "))
	name, rhs, ok := strings.Cut(header, " = ")
	if !ok {
		return "", "", fmt.Errorf("python shared types: malformed datamodel alias header %q", lines[0])
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return "", "", fmt.Errorf("python shared types: datamodel alias has empty name")
	}

	parts := make([]string, 0, len(lines))
	parts = append(parts, strings.TrimSpace(rhs))
	for _, line := range lines[1:] {
		parts = append(parts, strings.TrimSpace(line))
	}
	expr, err := normalizeDatamodelAliasExpr(strings.Join(parts, " "))
	if err != nil {
		return "", "", fmt.Errorf("python shared types: alias %s: %w", name, err)
	}
	return name, expr, nil
}

func normalizeDatamodelAliasExpr(expr string) (string, error) {
	expr = strings.TrimSpace(expr)
	if strings.HasPrefix(expr, "Annotated[") {
		inner := strings.TrimSpace(strings.TrimPrefix(expr, "Annotated["))
		if !strings.HasSuffix(inner, "]") {
			return "", fmt.Errorf("annotated alias is missing a closing bracket")
		}
		firstArg, err := firstTopLevelDelimitedSegment(strings.TrimSuffix(inner, "]"))
		if err != nil {
			return "", err
		}
		expr = firstArg
	}
	expr = strings.TrimSpace(strings.TrimSuffix(expr, ","))
	if expr == "" {
		return "", fmt.Errorf("alias expression is empty")
	}
	return strings.Join(strings.Fields(expr), " "), nil
}

func firstTopLevelDelimitedSegment(expr string) (string, error) {
	depthParens := 0
	depthBrackets := 0
	depthBraces := 0
	for index, char := range expr {
		switch char {
		case '(':
			depthParens++
		case ')':
			depthParens--
		case '[':
			depthBrackets++
		case ']':
			depthBrackets--
		case '{':
			depthBraces++
		case '}':
			depthBraces--
		case ',':
			if depthParens == 0 && depthBrackets == 0 && depthBraces == 0 {
				return strings.TrimSpace(expr[:index]), nil
			}
		}
		if depthParens < 0 || depthBrackets < 0 || depthBraces < 0 {
			return "", fmt.Errorf("unbalanced alias expression %q", expr)
		}
	}
	if depthParens != 0 || depthBrackets != 0 || depthBraces != 0 {
		return "", fmt.Errorf("unbalanced alias expression %q", expr)
	}
	return strings.TrimSpace(expr), nil
}

func datamodelAliasExprReferencesName(name string, expr string) bool {
	for _, referenced := range referencedTypeNames(expr) {
		if referenced == name {
			return true
		}
	}
	return false
}
