package projectstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	toml "github.com/pelletier/go-toml/v2"
	"gopkg.in/yaml.v3"
	"setta/internal/statefs"
)

var (
	ErrJSONSourceKeysPathNotFound        = errors.New("jsonSourceKeys path not found")
	ErrJSONSourceKeysMustResolveToObject = errors.New("jsonSourceKeys must resolve to an object")
)

type JSONSourceKeysValidationResult struct {
	JSONSourceKeys    []string
	JSONSourceMissing bool
}

func ValidateVariantJSONSourceKeys(document Document, workspaceRoot string, projectID string, sectionID string, variantID string, jsonSourceKeys []string) (JSONSourceKeysValidationResult, error) {
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return JSONSourceKeysValidationResult{}, err
	}
	if !project.AllowJSONSourceKeyEdits {
		return JSONSourceKeysValidationResult{}, ErrJSONSourceKeyEditsDisabled
	}
	_, variant, _, _, err := project.resolveVariantDictSectionMutationState(sectionID, variantID)
	if err != nil {
		return JSONSourceKeysValidationResult{}, err
	}

	normalizedKeys := normalizeJSONSourceKeys(jsonSourceKeys)
	jsonSourceMissing, err := validateJSONSourceKeysPath(workspaceRoot, variant.Name, normalizedKeys)
	if err != nil {
		return JSONSourceKeysValidationResult{}, err
	}
	return JSONSourceKeysValidationResult{
		JSONSourceKeys:    normalizedKeys,
		JSONSourceMissing: jsonSourceMissing,
	}, nil
}

func validateJSONSourceKeysPath(workspaceRoot string, variantName string, jsonSourceKeys []string) (bool, error) {
	trimmedVariantName := strings.TrimSpace(variantName)
	if trimmedVariantName == "" {
		return true, nil
	}

	resolvedPath, err := statefs.NormalizePath(trimmedVariantName, strings.TrimSpace(workspaceRoot))
	if err != nil {
		return false, fmt.Errorf("resolve json source path %q: %w", variantName, err)
	}

	payload, exists, err := readJSONSourceValidationPayload(resolvedPath)
	if err != nil {
		return false, err
	}
	if !exists {
		return true, nil
	}

	current := payload
	for _, key := range jsonSourceKeys {
		object, ok := current.(map[string]any)
		if !ok {
			return false, fmt.Errorf("%w: %s", ErrJSONSourceKeysPathNotFound, displayJSONSourceKeys(jsonSourceKeys))
		}
		next, ok := object[key]
		if !ok {
			return false, fmt.Errorf("%w: %s", ErrJSONSourceKeysPathNotFound, displayJSONSourceKeys(jsonSourceKeys))
		}
		current = next
	}

	if _, ok := current.(map[string]any); !ok {
		return false, fmt.Errorf("%w: %s", ErrJSONSourceKeysMustResolveToObject, displayJSONSourceKeys(jsonSourceKeys))
	}
	return false, nil
}

func readJSONSourceValidationPayload(path string) (any, bool, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("read json source payload %q: %w", path, err)
	}

	var payload any
	switch strings.ToLower(filepath.Ext(path)) {
	case ".json":
		if err := json.Unmarshal(content, &payload); err != nil {
			return nil, false, fmt.Errorf("decode json source payload %q: %w", path, err)
		}
	case ".yaml", ".yml":
		if err := yaml.Unmarshal(content, &payload); err != nil {
			return nil, false, fmt.Errorf("decode json source payload %q: %w", path, err)
		}
	case ".toml":
		if err := toml.Unmarshal(content, &payload); err != nil {
			return nil, false, fmt.Errorf("decode json source payload %q: %w", path, err)
		}
	default:
		return nil, false, fmt.Errorf("unsupported jsonSource file extension: %s", path)
	}

	return payload, true, nil
}

func displayJSONSourceKeys(jsonSourceKeys []string) string {
	if len(jsonSourceKeys) == 0 {
		return "<root>"
	}
	return strings.Join(jsonSourceKeys, ".")
}
