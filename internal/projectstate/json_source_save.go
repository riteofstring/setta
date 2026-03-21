package projectstate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/statefs"
)

type jsonSourceFileUpdate struct {
	KeyPath []string
	Subtree map[string]any
}

func SaveJSONSourceFiles(document Document, workspaceRoot string) error {
	updatesByPath, err := buildJSONSourceFileUpdates(document, workspaceRoot)
	if err != nil {
		return err
	}

	paths := make([]string, 0, len(updatesByPath))
	for path := range updatesByPath {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	for _, path := range paths {
		existing, err := readJSONSourceFileObject(path)
		if err != nil {
			return err
		}
		updated, err := applyJSONSourceFileUpdates(existing, updatesByPath[path])
		if err != nil {
			return err
		}
		if err := writeJSONSourceFileObject(path, updated); err != nil {
			return err
		}
	}

	return nil
}

func buildJSONSourceFileUpdates(document Document, workspaceRoot string) (map[string][]jsonSourceFileUpdate, error) {
	updatesByPath := map[string][]jsonSourceFileUpdate{}

	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	for _, projectID := range projectIDs {
		project := document.Projects[projectID]
		sectionIDs := make([]string, 0, len(project.Sections))
		for sectionID := range project.Sections {
			sectionIDs = append(sectionIDs, sectionID)
		}
		sort.Strings(sectionIDs)

		for _, sectionID := range sectionIDs {
			section, ok := project.Sections[sectionID]
			if !ok {
				return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
			}
			for _, variantID := range section.VariantIDs {
				updatePath, update, ok, err := buildJSONSourceSectionFileUpdate(project, workspaceRoot, sectionID, variantID)
				if err != nil {
					return nil, err
				}
				if !ok {
					continue
				}
				updatesByPath[updatePath] = append(updatesByPath[updatePath], update)
			}
		}
	}

	return updatesByPath, nil
}

func buildJSONSourceSectionFileUpdate(project Project, workspaceRoot string, sectionID string, variantID string) (string, jsonSourceFileUpdate, bool, error) {
	sectionPayload, err := project.EffectiveSectionPayload(sectionID, variantID)
	if err != nil {
		return "", jsonSourceFileUpdate{}, false, err
	}
	if !payloadBoolField(sectionPayload, "isJsonSource") {
		return "", jsonSourceFileUpdate{}, false, nil
	}

	variant, ok := project.SectionVariants[strings.TrimSpace(variantID)]
	if !ok {
		return "", jsonSourceFileUpdate{}, false, fmt.Errorf("%w: %q", ErrSectionVariantNotFound, variantID)
	}
	resolvedPath, err := statefs.NormalizePath(strings.TrimSpace(variant.Name), strings.TrimSpace(workspaceRoot))
	if err != nil {
		return "", jsonSourceFileUpdate{}, false, fmt.Errorf("resolve json source path %q: %w", variant.Name, err)
	}

	subtree, err := buildJSONSourceSectionSubtree(project, sectionPayload)
	if err != nil {
		return "", jsonSourceFileUpdate{}, false, err
	}
	return resolvedPath, jsonSourceFileUpdate{
		KeyPath: append([]string(nil), payloadStringArrayField(sectionPayload, "jsonSourceKeys")...),
		Subtree: subtree,
	}, true, nil
}

func buildJSONSourceSectionSubtree(project Project, sectionPayload map[string]any) (map[string]any, error) {
	topLevelParamID := payloadStringField(sectionPayload, "topLevelParamId")
	if topLevelParamID == "" {
		return map[string]any{}, nil
	}

	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		return nil, err
	}

	subtree := map[string]any{}
	for _, childID := range payloadStringArrayField(rootPayload, "children") {
		value, name, err := buildJSONSourceCodeObjectValue(project, codeObjVariantMap, childID)
		if err != nil {
			return nil, err
		}
		subtree[name] = value
	}
	return subtree, nil
}

func buildJSONSourceCodeObjectValue(project Project, codeObjVariantMap map[string]string, codeObjID string) (any, string, error) {
	payload, codeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, codeObjID)
	if err != nil {
		return nil, "", err
	}
	if strings.TrimSpace(codeObj.Name) == "" {
		return nil, "", ErrCodeObjNameRequired
	}

	children := payloadStringArrayField(payload, "children")
	if len(children) == 0 {
		return tryProjectJSONValue(payloadRawStringField(payload, "value")), codeObj.Name, nil
	}

	objectValue := map[string]any{}
	for _, childID := range children {
		childValue, childName, err := buildJSONSourceCodeObjectValue(project, codeObjVariantMap, childID)
		if err != nil {
			return nil, "", err
		}
		objectValue[childName] = childValue
	}
	return objectValue, codeObj.Name, nil
}

func applyJSONSourceFileUpdates(existing map[string]any, updates []jsonSourceFileUpdate) (map[string]any, error) {
	output := cloneProjectJSONObject(existing)
	ordered := append([]jsonSourceFileUpdate(nil), updates...)
	sort.SliceStable(ordered, func(i int, j int) bool {
		if len(ordered[i].KeyPath) != len(ordered[j].KeyPath) {
			return len(ordered[i].KeyPath) < len(ordered[j].KeyPath)
		}
		return strings.Join(ordered[i].KeyPath, "\x00") < strings.Join(ordered[j].KeyPath, "\x00")
	})

	for _, update := range ordered {
		if len(update.KeyPath) == 0 {
			output = cloneProjectJSONObject(update.Subtree)
			continue
		}

		current := output
		for _, pathPart := range update.KeyPath[:len(update.KeyPath)-1] {
			nextValue, ok := current[pathPart]
			if !ok {
				nextObject := map[string]any{}
				current[pathPart] = nextObject
				current = nextObject
				continue
			}
			nextObject, ok := nextValue.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("JSON source path conflicts with a non-dict value.")
			}
			current = nextObject
		}
		current[update.KeyPath[len(update.KeyPath)-1]] = cloneProjectJSONObject(update.Subtree)
	}

	return output, nil
}

func readJSONSourceFileObject(path string) (map[string]any, error) {
	if err := ensureJSONSourceSavePath(path); err != nil {
		return nil, err
	}

	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]any{}, nil
		}
		return nil, fmt.Errorf("read json source payload %q: %w", path, err)
	}
	var payload any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode json source payload %q: %w", path, err)
	}
	objectPayload, ok := payload.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("json source payload must be an object at the root: %q", path)
	}
	return objectPayload, nil
}

func writeJSONSourceFileObject(path string, payload map[string]any) error {
	if err := ensureJSONSourceSavePath(path); err != nil {
		return err
	}
	if payload == nil {
		payload = map[string]any{}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir json source parent %q: %w", filepath.Dir(path), err)
	}
	bytes, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode json source payload %q: %w", path, err)
	}
	bytes = append(bytes, '\n')
	if err := os.WriteFile(path, bytes, 0o644); err != nil {
		return fmt.Errorf("write json source payload %q: %w", path, err)
	}
	return nil
}

func ensureJSONSourceSavePath(path string) error {
	if strings.ToLower(filepath.Ext(strings.TrimSpace(path))) != ".json" {
		return fmt.Errorf("unsupported jsonSource file extension: %s", path)
	}
	return nil
}

func tryProjectJSONValue(raw string) any {
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return raw
	}
	return value
}

func cloneProjectJSONObject(source map[string]any) map[string]any {
	if source == nil {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneProjectJSONValue(value)
	}
	return cloned
}

func cloneProjectJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneProjectJSONObject(typed)
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, entry := range typed {
			cloned = append(cloned, cloneProjectJSONValue(entry))
		}
		return cloned
	default:
		return typed
	}
}
