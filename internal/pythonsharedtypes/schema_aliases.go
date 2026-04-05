package pythonsharedtypes

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"setta/internal/sharedtypes"
)

const (
	pythonSharedAliasTargetVersion = "3.12"
	datamodelGeneratorModule       = "datamodel_code_generator"
)

var (
	pythonSharedSchemaAliasExprsOnce sync.Once
	pythonSharedSchemaAliasExprsMap  map[string]string
	pythonSharedSchemaAliasExprsErr  error
)

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
	document, err := sharedtypes.BuildOpenAPIProjectionDocument()
	if err != nil {
		return nil, err
	}

	tempDir, err := os.MkdirTemp("", "setta-python-shared-aliases-*")
	if err != nil {
		return nil, fmt.Errorf("python shared types: create datamodel temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	inputPath := filepath.Join(tempDir, "openapi.json")
	outputPath := filepath.Join(tempDir, "aliases.py")
	payload, err := json.Marshal(document)
	if err != nil {
		return nil, fmt.Errorf("python shared types: marshal shared OpenAPI projection: %w", err)
	}
	if err := os.WriteFile(inputPath, payload, 0o600); err != nil {
		return nil, fmt.Errorf("python shared types: write shared OpenAPI projection: %w", err)
	}

	pythonBin, err := pythonGeneratorExecutable()
	if err != nil {
		return nil, err
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
		return nil, fmt.Errorf("python shared types: run %q: %s", strings.Join(cmd.Args, " "), message)
	}

	module, err := os.ReadFile(outputPath)
	if err != nil {
		return nil, fmt.Errorf("python shared types: read datamodel alias output: %w", err)
	}
	aliases, err := extractDatamodelTypeAliases(string(module))
	if err != nil {
		return nil, err
	}
	return aliases, nil
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

func extractDatamodelTypeAliases(module string) (map[string]string, error) {
	aliases := map[string]string{}
	lines := strings.Split(module, "\n")
	for index := 0; index < len(lines); {
		line := strings.TrimSpace(lines[index])
		if !strings.HasPrefix(line, "type ") {
			index++
			continue
		}

		block := []string{line}
		index++
		for index < len(lines) {
			trimmed := strings.TrimSpace(lines[index])
			if trimmed == "" {
				break
			}
			block = append(block, trimmed)
			index++
		}

		name, expr, err := parseDatamodelTypeAliasBlock(block)
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
