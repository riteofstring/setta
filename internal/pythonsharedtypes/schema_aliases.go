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
	"unicode"

	"setta/internal/sharedtypes"
)

const (
	pythonSharedAliasTargetVersion = "3.12"
	datamodelGeneratorModule       = "datamodel_code_generator"
)

type datamodelDeclaration struct {
	Name  string
	Block string
}

type datamodelModule struct {
	ImportLines  []string
	Declarations []datamodelDeclaration
}

var (
	pythonSharedSchemaModuleOnce sync.Once
	pythonSharedSchemaModuleData datamodelModule
	pythonSharedSchemaModuleErr  error
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

func pythonSharedSchemaDeclarations(
	defaultSourcesByType map[reflect.Type]reflect.Value,
) ([]string, []string, error) {
	module, err := pythonSharedSchemaModule()
	if err != nil {
		return nil, nil, err
	}

	imports := map[string]struct{}{}
	for _, line := range module.ImportLines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		imports[line] = struct{}{}
	}
	blocks := make([]string, 0, len(module.Declarations))
	for _, declaration := range module.Declarations {
		block := declaration.Block
		declarationImports := map[string]struct{}(nil)
		if ownerType, ok := sharedtypes.TypeByContractName(declaration.Name); ok &&
			ownerType != nil &&
			ownerType.Kind() == reflect.Struct {
			updatedBlock, extraImports, changed, err := applyPythonFieldMetadataToDatamodelClassBlock(
				declaration.Name,
				declaration.Block,
				ownerType,
				defaultSourcesByType,
			)
			if err != nil {
				return nil, nil, err
			}
			declarationImports = extraImports
			if changed {
				block = updatedBlock
			}
		}
		mergeImportSet(imports, declarationImports)
		blocks = append(blocks, block)
	}
	return blocks, sortedImportNames(imports), nil
}

func applyPythonFieldMetadataToDatamodelClassBlock(
	contractName string,
	block string,
	ownerType reflect.Type,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (string, map[string]struct{}, bool, error) {
	lines := strings.Split(block, "\n")
	fieldsByJSONName, err := datamodelFieldsByJSONName(ownerType)
	if err != nil {
		return "", nil, false, err
	}

	imports := map[string]struct{}{}
	changed := false
	for index := 0; index < len(lines); {
		fieldName, currentTypeExpr, end, ok, err := parseDatamodelField(lines, index)
		if err != nil {
			return "", nil, false, fmt.Errorf(
				"python shared types: %s: %w",
				contractName,
				err,
			)
		}
		if !ok {
			index++
			continue
		}

		field, exists := fieldsByJSONName[fieldName]
		if !exists {
			index = end
			continue
		}
		renderedField, fieldImports, err := buildModelFieldSpec(
			contractName,
			ownerType,
			field,
			currentTypeExpr,
			defaultSourcesByType,
		)
		if err != nil {
			return "", nil, false, err
		}
		mergeImportSet(imports, fieldImports)

		renderedLine := strings.TrimSuffix(renderFieldLine(renderedField), "\n")
		if strings.Join(lines[index:end], "\n") == renderedLine {
			index = end
			continue
		}
		lines = append(
			append(append([]string(nil), lines[:index]...), renderedLine),
			lines[end:]...,
		)
		changed = true
		index++
	}

	return strings.Join(lines, "\n"), imports, changed, nil
}

func datamodelFieldsByJSONName(ownerType reflect.Type) (map[string]reflect.StructField, error) {
	fieldsByJSONName := make(map[string]reflect.StructField, ownerType.NumField())
	for _, field := range reflect.VisibleFields(ownerType) {
		if !field.IsExported() || field.Anonymous || field.Tag.Get("json") == "-" {
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

func parseDatamodelField(lines []string, start int) (string, string, int, bool, error) {
	if start >= len(lines) {
		return "", "", start, false, nil
	}
	fieldName, rhs, ok := strings.Cut(strings.TrimSpace(lines[start]), ": ")
	fieldName = strings.TrimSpace(fieldName)
	if !ok || !isPythonIdentifier(fieldName) {
		return "", "", start, false, nil
	}
	parts := []string{rhs}
	end := start + 1
	for end < len(lines) {
		nextName, _, nextIsField := strings.Cut(strings.TrimSpace(lines[end]), ": ")
		if nextIsField && isPythonIdentifier(strings.TrimSpace(nextName)) {
			break
		}
		parts = append(parts, strings.TrimSpace(lines[end]))
		end++
	}
	typeExpr := trimDatamodelFieldDefault(strings.Join(parts, "\n"))
	typeExpr = strings.Join(strings.Fields(typeExpr), " ")
	if typeExpr == "" {
		return "", "", start, false, fmt.Errorf("datamodel field %s has empty type expression", fieldName)
	}
	return fieldName, typeExpr, end, true, nil
}

func trimDatamodelFieldDefault(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	brackets := 0
	braces := 0
	parens := 0
	for index, char := range value {
		switch char {
		case '[':
			brackets++
		case ']':
			if brackets > 0 {
				brackets--
			}
		case '{':
			braces++
		case '}':
			if braces > 0 {
				braces--
			}
		case '(':
			parens++
		case ')':
			if parens > 0 {
				parens--
			}
		case '=':
			if brackets == 0 && braces == 0 && parens == 0 {
				return strings.TrimSpace(value[:index])
			}
		}
	}
	return value
}

func parseDatamodelModule(module string) (datamodelModule, error) {
	imports := []string{}
	seen := map[string]struct{}{}
	declarations := []datamodelDeclaration{}
	sawDeclaration := false
	for _, block := range splitDatamodelBlocks(module) {
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}
		header, _, _ := strings.Cut(block, "\n")
		header = strings.TrimSpace(header)
		switch {
		case header == "", strings.HasPrefix(header, "#"), header == "from __future__ import annotations":
			continue
		case !sawDeclaration && (strings.HasPrefix(header, "from ") || strings.HasPrefix(header, "import ")):
			for _, line := range strings.Split(block, "\n") {
				trimmed := strings.TrimSpace(line)
				if trimmed == "" || strings.HasPrefix(trimmed, "#") || trimmed == "from __future__ import annotations" {
					continue
				}
				if !strings.HasPrefix(trimmed, "from ") && !strings.HasPrefix(trimmed, "import ") {
					continue
				}
				if _, duplicate := seen[trimmed]; duplicate {
					continue
				}
				seen[trimmed] = struct{}{}
				imports = append(imports, trimmed)
			}
		default:
			declaration := datamodelDeclaration{Block: block}
			if strings.HasPrefix(header, "class ") {
				name := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(header, "class "), ":"))
				if before, _, ok := strings.Cut(name, "("); ok {
					name = strings.TrimSpace(before)
				}
				if name == "" {
					return datamodelModule{}, fmt.Errorf("python shared types: datamodel class has empty name")
				}
				declaration.Name = name
			}
			sawDeclaration = true
			declarations = append(declarations, declaration)
		}
	}
	return datamodelModule{
		ImportLines:  imports,
		Declarations: declarations,
	}, nil
}

func splitDatamodelBlocks(module string) []string {
	lines := strings.Split(module, "\n")
	blocks := make([]string, 0)
	current := make([]string, 0)
	flush := func() {
		if len(current) == 0 {
			return
		}
		blocks = append(blocks, strings.Join(current, "\n"))
		current = current[:0]
	}
	for _, line := range lines {
		trimmedRight := strings.TrimRight(line, " \t")
		if strings.TrimSpace(trimmedRight) == "" {
			flush()
			continue
		}
		current = append(current, trimmedRight)
	}
	flush()
	return blocks
}

func isPythonIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for index, char := range value {
		switch {
		case char == '_':
			continue
		case unicode.IsLetter(char):
			continue
		case unicode.IsDigit(char) && index > 0:
			continue
		default:
			return false
		}
	}
	return true
}
