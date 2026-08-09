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
	return yamlNodeFromJSONToken(decoder, token)
}

func yamlNodeFromJSONToken(decoder *json.Decoder, token json.Token) (*yaml.Node, error) {
	switch typed := token.(type) {
	case json.Delim:
		return yamlNodeFromJSONDelimiter(decoder, typed)
	case nil:
		return newYAMLScalarNode("!!null", "null"), nil
	case bool:
		return newYAMLBoolNode(typed), nil
	case string:
		return newYAMLScalarNode("!!str", typed), nil
	case json.Number:
		return newYAMLNumberNode(typed.String()), nil
	case float64:
		return newYAMLScalarNode("!!float", strconv.FormatFloat(typed, 'g', -1, 64)), nil
	default:
		return nil, fmt.Errorf("unsupported json token %T", token)
	}
}

func yamlNodeFromJSONDelimiter(decoder *json.Decoder, delimiter json.Delim) (*yaml.Node, error) {
	switch delimiter {
	case '{':
		return yamlMappingNodeFromJSONDecoder(decoder)
	case '[':
		return yamlSequenceNodeFromJSONDecoder(decoder)
	default:
		return nil, fmt.Errorf("unsupported json delimiter %q", delimiter)
	}
}

func yamlMappingNodeFromJSONDecoder(decoder *json.Decoder) (*yaml.Node, error) {
	node := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
	for decoder.More() {
		key, err := nextJSONObjectKey(decoder)
		if err != nil {
			return nil, err
		}
		valueNode, err := yamlNodeFromJSONDecoder(decoder)
		if err != nil {
			return nil, err
		}
		node.Content = append(node.Content, newYAMLScalarNode("!!str", key), valueNode)
	}
	if err := consumeJSONDelimiter(decoder, '}', "object terminator"); err != nil {
		return nil, err
	}
	return node, nil
}

func yamlSequenceNodeFromJSONDecoder(decoder *json.Decoder) (*yaml.Node, error) {
	node := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
	for decoder.More() {
		child, err := yamlNodeFromJSONDecoder(decoder)
		if err != nil {
			return nil, err
		}
		node.Content = append(node.Content, child)
	}
	if err := consumeJSONDelimiter(decoder, ']', "array terminator"); err != nil {
		return nil, err
	}
	return node, nil
}

func newYAMLScalarNode(tag string, value string) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: tag, Value: value}
}

func newYAMLBoolNode(value bool) *yaml.Node {
	if value {
		return newYAMLScalarNode("!!bool", "true")
	}
	return newYAMLScalarNode("!!bool", "false")
}

func newYAMLNumberNode(value string) *yaml.Node {
	tag := "!!int"
	if strings.ContainsAny(value, ".eE") {
		tag = "!!float"
	}
	return newYAMLScalarNode(tag, value)
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
	return writeTOMLValueFromJSONToken(builder, decoder, token)
}

func writeTOMLValueFromJSONToken(builder *strings.Builder, decoder *json.Decoder, token json.Token) error {
	switch typed := token.(type) {
	case json.Delim:
		return writeTOMLValueFromJSONDelimiter(builder, decoder, typed)
	case nil:
		return fmt.Errorf("json source values must use TOML-compatible types, got null")
	case bool:
		writeTOMLBoolValue(builder, typed)
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

func writeTOMLValueFromJSONDelimiter(builder *strings.Builder, decoder *json.Decoder, delimiter json.Delim) error {
	switch delimiter {
	case '{':
		return writeTOMLObjectFromJSONDecoder(builder, decoder)
	case '[':
		return writeTOMLArrayFromJSONDecoder(builder, decoder)
	default:
		return fmt.Errorf("unsupported json delimiter %q", delimiter)
	}
}

func writeTOMLObjectFromJSONDecoder(builder *strings.Builder, decoder *json.Decoder) error {
	builder.WriteString("{ ")
	for index := 0; decoder.More(); index++ {
		if index > 0 {
			builder.WriteString(", ")
		}
		key, err := nextJSONObjectKey(decoder)
		if err != nil {
			return err
		}
		builder.WriteString(quoteTOMLKey(key))
		builder.WriteString(" = ")
		if err := writeTOMLValueFromJSONDecoder(builder, decoder); err != nil {
			return err
		}
	}
	if err := consumeJSONDelimiter(decoder, '}', "object terminator"); err != nil {
		return err
	}
	builder.WriteString(" }")
	return nil
}

func writeTOMLArrayFromJSONDecoder(builder *strings.Builder, decoder *json.Decoder) error {
	builder.WriteString("[")
	for index := 0; decoder.More(); index++ {
		if index > 0 {
			builder.WriteString(", ")
		}
		if err := writeTOMLValueFromJSONDecoder(builder, decoder); err != nil {
			return err
		}
	}
	if err := consumeJSONDelimiter(decoder, ']', "array terminator"); err != nil {
		return err
	}
	builder.WriteString("]")
	return nil
}

func writeTOMLBoolValue(builder *strings.Builder, value bool) {
	if value {
		builder.WriteString("true")
		return
	}
	builder.WriteString("false")
}

func nextJSONObjectKey(decoder *json.Decoder) (string, error) {
	token, err := decoder.Token()
	if err != nil {
		return "", err
	}
	key, ok := token.(string)
	if !ok {
		return "", fmt.Errorf("expected object key, got %T", token)
	}
	return key, nil
}

func consumeJSONDelimiter(decoder *json.Decoder, want json.Delim, description string) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if delimiter, ok := token.(json.Delim); ok && delimiter == want {
		return nil
	}
	return fmt.Errorf("expected %s, got %v", description, token)
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
