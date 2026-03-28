package projectstate

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
	"setta/internal/statefs"
)

type jsonSourceFileUpdate struct {
	KeyPath []string
	Subtree JSONSourceObject
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

func buildJSONSourceSectionSubtree(project Project, sectionPayload map[string]any) (JSONSourceObject, error) {
	topLevelParamID := payloadStringField(sectionPayload, "topLevelParamId")
	if topLevelParamID == "" {
		return JSONSourceObject{}, nil
	}

	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		return JSONSourceObject{}, err
	}

	subtree := JSONSourceObject{
		Entries: make([]JSONSourceObjectEntry, 0, len(payloadStringArrayField(rootPayload, "children"))),
	}
	for _, childID := range payloadStringArrayField(rootPayload, "children") {
		value, name, err := buildJSONSourceCodeObjectValue(project, codeObjVariantMap, childID)
		if err != nil {
			return JSONSourceObject{}, err
		}
		subtree.Entries = append(subtree.Entries, JSONSourceObjectEntry{
			Key:   name,
			Value: value,
		})
	}
	return subtree, nil
}

func buildJSONSourceCodeObjectValue(project Project, codeObjVariantMap map[string]string, codeObjID string) (JSONSourceValue, string, error) {
	payload, codeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, codeObjID)
	if err != nil {
		return JSONSourceValue{}, "", err
	}
	if strings.TrimSpace(codeObj.Name) == "" {
		return JSONSourceValue{}, "", ErrCodeObjNameRequired
	}

	children := payloadStringArrayField(payload, "children")
	if len(children) == 0 {
		value, err := jsonSourceValueFromProjectRaw(payloadRawStringField(payload, "value"))
		if err != nil {
			return JSONSourceValue{}, "", err
		}
		return value, codeObj.Name, nil
	}

	objectValue := JSONSourceObject{
		Entries: make([]JSONSourceObjectEntry, 0, len(children)),
	}
	for _, childID := range children {
		childValue, childName, err := buildJSONSourceCodeObjectValue(project, codeObjVariantMap, childID)
		if err != nil {
			return JSONSourceValue{}, "", err
		}
		objectValue.Entries = append(objectValue.Entries, JSONSourceObjectEntry{
			Key:   childName,
			Value: childValue,
		})
	}
	return JSONSourceValue{Object: &objectValue}, codeObj.Name, nil
}

func jsonSourceValueFromProjectRaw(raw string) (JSONSourceValue, error) {
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	value, err := decodeJSONSourceValue(decoder)
	if err == nil {
		return value, nil
	}

	bytes, marshalErr := json.Marshal(raw)
	if marshalErr != nil {
		return JSONSourceValue{}, marshalErr
	}
	return JSONSourceValue{Serialized: string(bytes)}, nil
}

func applyJSONSourceFileUpdates(existing JSONSourceObject, updates []jsonSourceFileUpdate) (JSONSourceObject, error) {
	output := JSONSourceObject{}
	if cloned := existing.Clone(); cloned != nil {
		output = *cloned
	}

	ordered := append([]jsonSourceFileUpdate(nil), updates...)
	sort.SliceStable(ordered, func(i int, j int) bool {
		if len(ordered[i].KeyPath) != len(ordered[j].KeyPath) {
			return len(ordered[i].KeyPath) < len(ordered[j].KeyPath)
		}
		return strings.Join(ordered[i].KeyPath, "\x00") < strings.Join(ordered[j].KeyPath, "\x00")
	})

	for _, update := range ordered {
		if len(update.KeyPath) == 0 {
			output = JSONSourceObject{}
			if cloned := update.Subtree.Clone(); cloned != nil {
				output = *cloned
			}
			continue
		}
		if err := setJSONSourceObjectSubtree(&output, update.KeyPath, update.Subtree); err != nil {
			return JSONSourceObject{}, err
		}
	}

	return output, nil
}

func setJSONSourceObjectSubtree(target *JSONSourceObject, keyPath []string, subtree JSONSourceObject) error {
	current := target
	for _, pathPart := range keyPath[:len(keyPath)-1] {
		next, err := getOrCreateJSONSourceChildObject(current, pathPart)
		if err != nil {
			return err
		}
		current = next
	}

	finalKey := keyPath[len(keyPath)-1]
	subtreeValue := JSONSourceValue{}
	if cloned := subtree.Clone(); cloned != nil {
		subtreeValue.Object = cloned
	} else {
		subtreeValue.Object = &JSONSourceObject{}
	}
	setJSONSourceObjectEntry(current, finalKey, subtreeValue)
	return nil
}

func getOrCreateJSONSourceChildObject(target *JSONSourceObject, key string) (*JSONSourceObject, error) {
	for index := range target.Entries {
		entry := &target.Entries[index]
		if entry.Key != key {
			continue
		}
		if entry.Value.Object == nil {
			return nil, fmt.Errorf("JSON source path conflicts with a non-dict value.")
		}
		return entry.Value.Object, nil
	}

	target.Entries = append(target.Entries, JSONSourceObjectEntry{
		Key:   key,
		Value: JSONSourceValue{Object: &JSONSourceObject{}},
	})
	return target.Entries[len(target.Entries)-1].Value.Object, nil
}

func setJSONSourceObjectEntry(target *JSONSourceObject, key string, value JSONSourceValue) {
	for index := range target.Entries {
		if target.Entries[index].Key == key {
			target.Entries[index].Value = value
			return
		}
	}
	target.Entries = append(target.Entries, JSONSourceObjectEntry{
		Key:   key,
		Value: value,
	})
}

func readJSONSourceFileObject(path string) (JSONSourceObject, error) {
	if err := ensureJSONSourceSavePath(path); err != nil {
		return JSONSourceObject{}, err
	}
	payload, exists, err := readOrderedJSONSourceObject(path)
	if err != nil {
		return JSONSourceObject{}, err
	}
	if !exists {
		return JSONSourceObject{}, nil
	}
	return payload, nil
}

func writeJSONSourceFileObject(path string, payload JSONSourceObject) error {
	if err := ensureJSONSourceSavePath(path); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir json source parent %q: %w", filepath.Dir(path), err)
	}

	content, err := marshalJSONSourceFileObject(path, payload)
	if err != nil {
		return err
	}
	if len(content) == 0 || content[len(content)-1] != '\n' {
		content = append(content, '\n')
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("write json source payload %q: %w", path, err)
	}
	return nil
}

func marshalJSONSourceFileObject(path string, payload JSONSourceObject) ([]byte, error) {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(path))) {
	case ".json":
		return marshalOrderedJSONObject(payload)
	case ".yaml", ".yml":
		return marshalOrderedYAMLObject(payload)
	case ".toml":
		return marshalOrderedTOMLObject(payload)
	default:
		return nil, fmt.Errorf("unsupported jsonSource file extension: %s", path)
	}
}

func marshalOrderedJSONObject(payload JSONSourceObject) ([]byte, error) {
	compact := []byte(payload.serialize())
	var indented bytes.Buffer
	if err := json.Indent(&indented, compact, "", "  "); err != nil {
		return nil, fmt.Errorf("encode ordered json source payload: %w", err)
	}
	return indented.Bytes(), nil
}

func marshalOrderedYAMLObject(payload JSONSourceObject) ([]byte, error) {
	node, err := yamlNodeFromJSONSourceObject(payload)
	if err != nil {
		return nil, fmt.Errorf("encode ordered yaml source payload: %w", err)
	}
	bytes, err := yaml.Marshal(node)
	if err != nil {
		return nil, fmt.Errorf("encode ordered yaml source payload: %w", err)
	}
	return bytes, nil
}

func yamlNodeFromJSONSourceObject(payload JSONSourceObject) (*yaml.Node, error) {
	node := &yaml.Node{
		Kind:    yaml.MappingNode,
		Tag:     "!!map",
		Content: make([]*yaml.Node, 0, len(payload.Entries)*2),
	}
	for _, entry := range payload.Entries {
		valueNode, err := yamlNodeFromJSONSourceValue(entry.Value)
		if err != nil {
			return nil, err
		}
		node.Content = append(node.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: entry.Key},
			valueNode,
		)
	}
	return node, nil
}

func yamlNodeFromJSONSourceValue(value JSONSourceValue) (*yaml.Node, error) {
	if value.Object != nil {
		return yamlNodeFromJSONSourceObject(*value.Object)
	}
	decoder := json.NewDecoder(strings.NewReader(value.Serialized))
	decoder.UseNumber()
	return yamlNodeFromJSONDecoder(decoder)
}

func yamlNodeFromJSONDecoder(decoder *json.Decoder) (*yaml.Node, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}

	switch typed := token.(type) {
	case json.Delim:
		switch typed {
		case '{':
			node := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return nil, err
				}
				key, ok := keyToken.(string)
				if !ok {
					return nil, fmt.Errorf("expected object key, got %T", keyToken)
				}
				valueNode, err := yamlNodeFromJSONDecoder(decoder)
				if err != nil {
					return nil, err
				}
				node.Content = append(node.Content,
					&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key},
					valueNode,
				)
			}
			endToken, err := decoder.Token()
			if err != nil {
				return nil, err
			}
			if end, ok := endToken.(json.Delim); !ok || end != '}' {
				return nil, fmt.Errorf("expected object terminator, got %v", endToken)
			}
			return node, nil
		case '[':
			node := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
			for decoder.More() {
				child, err := yamlNodeFromJSONDecoder(decoder)
				if err != nil {
					return nil, err
				}
				node.Content = append(node.Content, child)
			}
			endToken, err := decoder.Token()
			if err != nil {
				return nil, err
			}
			if end, ok := endToken.(json.Delim); !ok || end != ']' {
				return nil, fmt.Errorf("expected array terminator, got %v", endToken)
			}
			return node, nil
		default:
			return nil, fmt.Errorf("unsupported json delimiter %q", typed)
		}
	case nil:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"}, nil
	case bool:
		if typed {
			return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "true"}, nil
		}
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "false"}, nil
	case string:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: typed}, nil
	case json.Number:
		tag := "!!int"
		if strings.ContainsAny(typed.String(), ".eE") {
			tag = "!!float"
		}
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: tag, Value: typed.String()}, nil
	case float64:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!float", Value: strconv.FormatFloat(typed, 'g', -1, 64)}, nil
	default:
		return nil, fmt.Errorf("unsupported json token %T", token)
	}
}

func marshalOrderedTOMLObject(payload JSONSourceObject) ([]byte, error) {
	var builder strings.Builder
	if err := writeTOMLJSONSourceObject(&builder, payload); err != nil {
		return nil, fmt.Errorf("encode ordered toml source payload: %w", err)
	}
	return []byte(builder.String()), nil
}

func writeTOMLJSONSourceObject(builder *strings.Builder, payload JSONSourceObject) error {
	for _, entry := range payload.Entries {
		builder.WriteString(quoteTOMLKey(entry.Key))
		builder.WriteString(" = ")
		if err := writeTOMLJSONSourceValue(builder, entry.Value); err != nil {
			return err
		}
		builder.WriteByte('\n')
	}
	return nil
}

func writeTOMLJSONSourceValue(builder *strings.Builder, value JSONSourceValue) error {
	if value.Object != nil {
		return writeTOMLInlineObject(builder, *value.Object)
	}
	return writeTOMLValueFromJSONRaw(builder, value.Serialized)
}

func writeTOMLInlineObject(builder *strings.Builder, payload JSONSourceObject) error {
	builder.WriteString("{ ")
	for index, entry := range payload.Entries {
		if index > 0 {
			builder.WriteString(", ")
		}
		builder.WriteString(quoteTOMLKey(entry.Key))
		builder.WriteString(" = ")
		if err := writeTOMLJSONSourceValue(builder, entry.Value); err != nil {
			return err
		}
	}
	builder.WriteString(" }")
	return nil
}

func writeTOMLValueFromJSONRaw(builder *strings.Builder, raw string) error {
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	return writeTOMLValueFromJSONDecoder(builder, decoder)
}

func writeTOMLValueFromJSONDecoder(builder *strings.Builder, decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}

	switch typed := token.(type) {
	case json.Delim:
		switch typed {
		case '{':
			builder.WriteString("{ ")
			index := 0
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return err
				}
				key, ok := keyToken.(string)
				if !ok {
					return fmt.Errorf("expected object key, got %T", keyToken)
				}
				if index > 0 {
					builder.WriteString(", ")
				}
				builder.WriteString(quoteTOMLKey(key))
				builder.WriteString(" = ")
				if err := writeTOMLValueFromJSONDecoder(builder, decoder); err != nil {
					return err
				}
				index++
			}
			endToken, err := decoder.Token()
			if err != nil {
				return err
			}
			if end, ok := endToken.(json.Delim); !ok || end != '}' {
				return fmt.Errorf("expected object terminator, got %v", endToken)
			}
			builder.WriteString(" }")
			return nil
		case '[':
			builder.WriteString("[")
			index := 0
			for decoder.More() {
				if index > 0 {
					builder.WriteString(", ")
				}
				if err := writeTOMLValueFromJSONDecoder(builder, decoder); err != nil {
					return err
				}
				index++
			}
			endToken, err := decoder.Token()
			if err != nil {
				return err
			}
			if end, ok := endToken.(json.Delim); !ok || end != ']' {
				return fmt.Errorf("expected array terminator, got %v", endToken)
			}
			builder.WriteString("]")
			return nil
		default:
			return fmt.Errorf("unsupported json delimiter %q", typed)
		}
	case nil:
		return fmt.Errorf("json source values must use TOML-compatible types, got null")
	case bool:
		if typed {
			builder.WriteString("true")
		} else {
			builder.WriteString("false")
		}
		return nil
	case string:
		builder.WriteString(strconv.Quote(typed))
		return nil
	case json.Number:
		builder.WriteString(typed.String())
		return nil
	case float64:
		builder.WriteString(strconv.FormatFloat(typed, 'g', -1, 64))
		return nil
	default:
		return fmt.Errorf("unsupported json token %T", token)
	}
}

func quoteTOMLKey(key string) string {
	return strconv.Quote(key)
}

func ensureJSONSourceSavePath(path string) error {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(path))) {
	case ".json", ".yaml", ".yml", ".toml":
		return nil
	default:
		return fmt.Errorf("unsupported jsonSource file extension: %s", path)
	}
}
