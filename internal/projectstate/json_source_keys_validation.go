package projectstate

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/pelletier/go-toml/v2/unstable"
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

type JSONSourceKeysResolution struct {
	JSONSourceKeys    []string
	JSONSourceMissing bool
	JSONSourceObject  *JSONSourceObject
}

type JSONSourceObject struct {
	Entries []JSONSourceObjectEntry
}

type JSONSourceObjectEntry struct {
	Key   string
	Value JSONSourceValue
}

type JSONSourceValue struct {
	Object     *JSONSourceObject
	Serialized string
}

func ResolveVariantJSONSourceKeys(document Document, workspaceRoot string, projectID string, sectionID string, variantID string, jsonSourceKeys []string) (JSONSourceKeysResolution, error) {
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return JSONSourceKeysResolution{}, err
	}
	if !project.AllowJSONSourceKeyEdits {
		return JSONSourceKeysResolution{}, ErrJSONSourceKeyEditsDisabled
	}
	_, variant, _, _, err := project.resolveVariantDictSectionMutationState(sectionID, variantID)
	if err != nil {
		return JSONSourceKeysResolution{}, err
	}

	normalizedKeys := normalizeJSONSourceKeys(jsonSourceKeys)
	jsonSourceObject, jsonSourceMissing, err := resolveJSONSourceKeysPath(workspaceRoot, variant.Name, normalizedKeys)
	if err != nil {
		return JSONSourceKeysResolution{}, err
	}
	return JSONSourceKeysResolution{
		JSONSourceKeys:    normalizedKeys,
		JSONSourceMissing: jsonSourceMissing,
		JSONSourceObject:  jsonSourceObject,
	}, nil
}

func ValidateVariantJSONSourceKeys(document Document, workspaceRoot string, projectID string, sectionID string, variantID string, jsonSourceKeys []string) (JSONSourceKeysValidationResult, error) {
	resolution, err := ResolveVariantJSONSourceKeys(
		document,
		workspaceRoot,
		projectID,
		sectionID,
		variantID,
		jsonSourceKeys,
	)
	if err != nil {
		return JSONSourceKeysValidationResult{}, err
	}
	return JSONSourceKeysValidationResult{
		JSONSourceKeys:    append([]string(nil), resolution.JSONSourceKeys...),
		JSONSourceMissing: resolution.JSONSourceMissing,
	}, nil
}

func resolveJSONSourceKeysPath(workspaceRoot string, variantName string, jsonSourceKeys []string) (*JSONSourceObject, bool, error) {
	trimmedVariantName := strings.TrimSpace(variantName)
	if trimmedVariantName == "" {
		return &JSONSourceObject{}, true, nil
	}

	resolvedPath, err := statefs.NormalizePath(trimmedVariantName, strings.TrimSpace(workspaceRoot))
	if err != nil {
		return nil, false, fmt.Errorf("resolve json source path %q: %w", variantName, err)
	}

	payload, exists, err := readOrderedJSONSourceObject(resolvedPath)
	if err != nil {
		return nil, false, err
	}
	if !exists {
		return &JSONSourceObject{}, true, nil
	}

	current := &payload
	for _, key := range jsonSourceKeys {
		nextValue, ok := current.lookup(key)
		if !ok {
			return nil, false, fmt.Errorf("%w: %s", ErrJSONSourceKeysPathNotFound, displayJSONSourceKeys(jsonSourceKeys))
		}
		if nextValue.Object == nil {
			return nil, false, fmt.Errorf("%w: %s", ErrJSONSourceKeysMustResolveToObject, displayJSONSourceKeys(jsonSourceKeys))
		}
		current = nextValue.Object
	}

	return current.Clone(), false, nil
}

func (o *JSONSourceObject) Clone() *JSONSourceObject {
	if o == nil {
		return nil
	}
	cloned := &JSONSourceObject{
		Entries: make([]JSONSourceObjectEntry, 0, len(o.Entries)),
	}
	for _, entry := range o.Entries {
		cloned.Entries = append(cloned.Entries, JSONSourceObjectEntry{
			Key:   entry.Key,
			Value: entry.Value.Clone(),
		})
	}
	return cloned
}

func (o JSONSourceObject) lookup(key string) (JSONSourceValue, bool) {
	for _, entry := range o.Entries {
		if entry.Key == key {
			return entry.Value.Clone(), true
		}
	}
	return JSONSourceValue{}, false
}

func (v JSONSourceValue) Clone() JSONSourceValue {
	cloned := JSONSourceValue{
		Serialized: v.Serialized,
	}
	if v.Object != nil {
		cloned.Object = v.Object.Clone()
	}
	return cloned
}

func (v JSONSourceValue) IsObject() bool {
	return v.Object != nil
}

func serializeJSONSourceValue(value JSONSourceValue) string {
	if value.Object != nil {
		return value.Object.serialize()
	}
	return value.Serialized
}

func (o JSONSourceObject) serialize() string {
	var builder strings.Builder
	builder.WriteByte('{')
	for index, entry := range o.Entries {
		if index > 0 {
			builder.WriteByte(',')
		}
		keyBytes, _ := json.Marshal(entry.Key)
		builder.Write(keyBytes)
		builder.WriteByte(':')
		builder.WriteString(serializeJSONSourceValue(entry.Value))
	}
	builder.WriteByte('}')
	return builder.String()
}

func readOrderedJSONSourceObject(path string) (JSONSourceObject, bool, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return JSONSourceObject{}, false, nil
		}
		return JSONSourceObject{}, false, fmt.Errorf("read json source payload %q: %w", path, err)
	}

	switch strings.ToLower(filepath.Ext(path)) {
	case ".json":
		payload, err := decodeOrderedJSONObjectFromJSON(content)
		if err != nil {
			return JSONSourceObject{}, false, fmt.Errorf("decode json source payload %q: %w", path, err)
		}
		return payload, true, nil
	case ".yaml", ".yml":
		payload, err := decodeOrderedJSONObjectFromYAML(content)
		if err != nil {
			return JSONSourceObject{}, false, fmt.Errorf("decode json source payload %q: %w", path, err)
		}
		return payload, true, nil
	case ".toml":
		payload, err := decodeOrderedJSONObjectFromTOML(content)
		if err != nil {
			return JSONSourceObject{}, false, fmt.Errorf("decode json source payload %q: %w", path, err)
		}
		return payload, true, nil
	default:
		return JSONSourceObject{}, false, fmt.Errorf("unsupported jsonSource file extension: %s", path)
	}
}

func displayJSONSourceKeys(jsonSourceKeys []string) string {
	if len(jsonSourceKeys) == 0 {
		return "<root>"
	}
	return strings.Join(jsonSourceKeys, ".")
}

func decodeOrderedJSONObjectFromJSON(content []byte) (JSONSourceObject, error) {
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.UseNumber()
	value, err := decodeJSONSourceValue(decoder)
	if err != nil {
		return JSONSourceObject{}, err
	}
	if value.Object == nil {
		return JSONSourceObject{}, fmt.Errorf("json source payload must be an object at the root")
	}
	return *value.Object, nil
}

func decodeJSONSourceValue(decoder *json.Decoder) (JSONSourceValue, error) {
	token, err := decoder.Token()
	if err != nil {
		return JSONSourceValue{}, err
	}

	switch typed := token.(type) {
	case json.Delim:
		switch typed {
		case '{':
			object := JSONSourceObject{
				Entries: []JSONSourceObjectEntry{},
			}
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return JSONSourceValue{}, err
				}
				key, ok := keyToken.(string)
				if !ok {
					return JSONSourceValue{}, fmt.Errorf("expected object key, got %T", keyToken)
				}
				value, err := decodeJSONSourceValue(decoder)
				if err != nil {
					return JSONSourceValue{}, err
				}
				object.Entries = append(object.Entries, JSONSourceObjectEntry{
					Key:   key,
					Value: value,
				})
			}
			endToken, err := decoder.Token()
			if err != nil {
				return JSONSourceValue{}, err
			}
			if end, ok := endToken.(json.Delim); !ok || end != '}' {
				return JSONSourceValue{}, fmt.Errorf("expected object terminator, got %v", endToken)
			}
			return JSONSourceValue{Object: &object}, nil
		case '[':
			elements := make([]string, 0)
			for decoder.More() {
				value, err := decodeJSONSourceValue(decoder)
				if err != nil {
					return JSONSourceValue{}, err
				}
				elements = append(elements, serializeJSONSourceValue(value))
			}
			endToken, err := decoder.Token()
			if err != nil {
				return JSONSourceValue{}, err
			}
			if end, ok := endToken.(json.Delim); !ok || end != ']' {
				return JSONSourceValue{}, fmt.Errorf("expected array terminator, got %v", endToken)
			}
			return JSONSourceValue{Serialized: "[" + strings.Join(elements, ",") + "]"}, nil
		default:
			return JSONSourceValue{}, fmt.Errorf("unsupported json delimiter %q", typed)
		}
	case nil:
		return JSONSourceValue{Serialized: "null"}, nil
	case bool:
		if typed {
			return JSONSourceValue{Serialized: "true"}, nil
		}
		return JSONSourceValue{Serialized: "false"}, nil
	case string, json.Number:
		bytes, err := json.Marshal(typed)
		if err != nil {
			return JSONSourceValue{}, err
		}
		return JSONSourceValue{Serialized: string(bytes)}, nil
	case float64:
		bytes, err := json.Marshal(typed)
		if err != nil {
			return JSONSourceValue{}, err
		}
		return JSONSourceValue{Serialized: string(bytes)}, nil
	default:
		return JSONSourceValue{}, fmt.Errorf("unsupported json token %T", token)
	}
}

func decodeOrderedJSONObjectFromYAML(content []byte) (JSONSourceObject, error) {
	var node yaml.Node
	if err := yaml.Unmarshal(content, &node); err != nil {
		return JSONSourceObject{}, err
	}
	target := &node
	if node.Kind == yaml.DocumentNode && len(node.Content) > 0 {
		target = node.Content[0]
	}
	value, err := jsonSourceValueFromYAMLNode(target)
	if err != nil {
		return JSONSourceObject{}, err
	}
	if value.Object == nil {
		return JSONSourceObject{}, fmt.Errorf("json source payload must be an object at the root")
	}
	return *value.Object, nil
}

func decodeOrderedJSONObjectFromTOML(content []byte) (JSONSourceObject, error) {
	var parser unstable.Parser
	parser.Reset(content)

	object := JSONSourceObject{
		Entries: []JSONSourceObjectEntry{},
	}
	currentObject := &object

	for parser.NextExpression() {
		expr := parser.Expression()
		switch expr.Kind {
		case unstable.Comment:
			continue
		case unstable.KeyValue:
			keyPath, err := tomlKeyPath(expr.Key())
			if err != nil {
				return JSONSourceObject{}, err
			}
			value, err := jsonSourceValueFromTOMLNode(expr.Value())
			if err != nil {
				return JSONSourceObject{}, err
			}
			if err := setJSONSourceValueAtPath(currentObject, keyPath, value); err != nil {
				return JSONSourceObject{}, err
			}
		case unstable.Table:
			keyPath, err := tomlKeyPath(expr.Key())
			if err != nil {
				return JSONSourceObject{}, err
			}
			currentObject, err = ensureJSONSourceObjectPath(&object, keyPath)
			if err != nil {
				return JSONSourceObject{}, err
			}
		default:
			return JSONSourceObject{}, fmt.Errorf("json source values must use JSON-compatible types, got TOML %s", expr.Kind)
		}
	}
	if err := parser.Error(); err != nil {
		return JSONSourceObject{}, err
	}
	return object, nil
}

func tomlKeyPath(iterator unstable.Iterator) ([]string, error) {
	keyPath := []string{}
	for iterator.Next() {
		node := iterator.Node()
		if node.Kind != unstable.Key {
			return nil, fmt.Errorf("expected TOML key node, got %s", node.Kind)
		}
		keyPath = append(keyPath, string(node.Data))
	}
	if len(keyPath) == 0 {
		return nil, fmt.Errorf("expected TOML key path")
	}
	return keyPath, nil
}

func ensureJSONSourceObjectPath(target *JSONSourceObject, keyPath []string) (*JSONSourceObject, error) {
	current := target
	for _, pathPart := range keyPath {
		next, err := getOrCreateJSONSourceChildObject(current, pathPart)
		if err != nil {
			return nil, err
		}
		current = next
	}
	return current, nil
}

func setJSONSourceValueAtPath(target *JSONSourceObject, keyPath []string, value JSONSourceValue) error {
	current := target
	for _, pathPart := range keyPath[:len(keyPath)-1] {
		next, err := getOrCreateJSONSourceChildObject(current, pathPart)
		if err != nil {
			return err
		}
		current = next
	}
	setJSONSourceObjectEntry(current, keyPath[len(keyPath)-1], value)
	return nil
}

func jsonSourceValueFromTOMLNode(node *unstable.Node) (JSONSourceValue, error) {
	switch node.Kind {
	case unstable.InlineTable:
		object := JSONSourceObject{
			Entries: []JSONSourceObjectEntry{},
		}
		children := node.Children()
		for children.Next() {
			entry := children.Node()
			if entry.Kind != unstable.KeyValue {
				return JSONSourceValue{}, fmt.Errorf("expected TOML inline table key/value, got %s", entry.Kind)
			}
			keyPath, err := tomlKeyPath(entry.Key())
			if err != nil {
				return JSONSourceValue{}, err
			}
			value, err := jsonSourceValueFromTOMLNode(entry.Value())
			if err != nil {
				return JSONSourceValue{}, err
			}
			if err := setJSONSourceValueAtPath(&object, keyPath, value); err != nil {
				return JSONSourceValue{}, err
			}
		}
		return JSONSourceValue{Object: &object}, nil
	case unstable.Array:
		elements := []string{}
		children := node.Children()
		for children.Next() {
			value, err := jsonSourceValueFromTOMLNode(children.Node())
			if err != nil {
				return JSONSourceValue{}, err
			}
			elements = append(elements, serializeJSONSourceValue(value))
		}
		return JSONSourceValue{Serialized: "[" + strings.Join(elements, ",") + "]"}, nil
	case unstable.String:
		bytes, err := json.Marshal(string(node.Data))
		if err != nil {
			return JSONSourceValue{}, err
		}
		return JSONSourceValue{Serialized: string(bytes)}, nil
	case unstable.Bool, unstable.Float, unstable.Integer:
		return JSONSourceValue{Serialized: string(node.Data)}, nil
	default:
		return JSONSourceValue{}, fmt.Errorf("json source values must use JSON-compatible types, got TOML %s", node.Kind)
	}
}

func jsonSourceValueFromYAMLNode(node *yaml.Node) (JSONSourceValue, error) {
	if node == nil {
		return JSONSourceValue{Serialized: "null"}, nil
	}
	switch node.Kind {
	case yaml.DocumentNode:
		if len(node.Content) == 0 {
			return JSONSourceValue{Serialized: "null"}, nil
		}
		return jsonSourceValueFromYAMLNode(node.Content[0])
	case yaml.MappingNode:
		if node.Tag != "" && node.Tag != "!!map" {
			return JSONSourceValue{}, fmt.Errorf("json source values must use JSON-compatible types, got yaml tag %s", node.Tag)
		}
		object := JSONSourceObject{
			Entries: make([]JSONSourceObjectEntry, 0, len(node.Content)/2),
		}
		for index := 0; index+1 < len(node.Content); index += 2 {
			keyNode := node.Content[index]
			valueNode := node.Content[index+1]
			if keyNode.Kind != yaml.ScalarNode {
				return JSONSourceValue{}, fmt.Errorf("json source dict keys must be strings")
			}
			value, err := jsonSourceValueFromYAMLNode(valueNode)
			if err != nil {
				return JSONSourceValue{}, err
			}
			object.Entries = append(object.Entries, JSONSourceObjectEntry{
				Key:   keyNode.Value,
				Value: value,
			})
		}
		return JSONSourceValue{Object: &object}, nil
	case yaml.SequenceNode:
		if node.Tag != "" && node.Tag != "!!seq" {
			return JSONSourceValue{}, fmt.Errorf("json source values must use JSON-compatible types, got yaml tag %s", node.Tag)
		}
		elements := make([]string, 0, len(node.Content))
		for _, child := range node.Content {
			value, err := jsonSourceValueFromYAMLNode(child)
			if err != nil {
				return JSONSourceValue{}, err
			}
			elements = append(elements, serializeJSONSourceValue(value))
		}
		return JSONSourceValue{Serialized: "[" + strings.Join(elements, ",") + "]"}, nil
	default:
		var scalar any
		if err := node.Decode(&scalar); err != nil {
			return JSONSourceValue{}, err
		}
		return jsonSourceScalarToJSONValue(scalar)
	}
}

func jsonSourceValueFromGeneric(value any) (JSONSourceValue, error) {
	switch typed := value.(type) {
	case map[string]any:
		object := JSONSourceObject{
			Entries: make([]JSONSourceObjectEntry, 0, len(typed)),
		}
		for key, child := range typed {
			childValue, err := jsonSourceValueFromGeneric(child)
			if err != nil {
				return JSONSourceValue{}, err
			}
			object.Entries = append(object.Entries, JSONSourceObjectEntry{
				Key:   key,
				Value: childValue,
			})
		}
		return JSONSourceValue{Object: &object}, nil
	case []any:
		elements := make([]string, 0, len(typed))
		for _, child := range typed {
			childValue, err := jsonSourceValueFromGeneric(child)
			if err != nil {
				return JSONSourceValue{}, err
			}
			elements = append(elements, serializeJSONSourceValue(childValue))
		}
		return JSONSourceValue{Serialized: "[" + strings.Join(elements, ",") + "]"}, nil
	default:
		return jsonSourceScalarToJSONValue(typed)
	}
}

func jsonSourceScalarToJSONValue(value any) (JSONSourceValue, error) {
	switch typed := value.(type) {
	case nil, string, bool, float32, float64, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		bytes, err := json.Marshal(typed)
		if err != nil {
			return JSONSourceValue{}, err
		}
		return JSONSourceValue{Serialized: string(bytes)}, nil
	default:
		return JSONSourceValue{}, fmt.Errorf("json source values must use JSON-compatible types, got %T", value)
	}
}
