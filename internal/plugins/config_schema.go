package plugins

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
)

type pluginConfigSchemaDocument struct {
	Path     string
	JSON     map[string]any
	Resolved *jsonschema.Resolved
}

func resolvePluginConfigSchemaPath(entry DiscoveredPlugin) (string, bool, error) {
	if entry.Manifest == nil {
		return "", false, nil
	}
	trimmedPath := strings.TrimSpace(entry.Manifest.ConfigSchemaPath)
	if trimmedPath == "" {
		return "", false, nil
	}
	schemaPath, err := resolveManifestRegularFile(entry.SourcePath, trimmedPath, "plugin config schema")
	if err != nil {
		return "", false, err
	}
	return schemaPath, true, nil
}

func loadPluginConfigSchemaPayload(schemaPath string) ([]byte, error) {
	return os.ReadFile(schemaPath)
}

func parsePluginConfigSchemaJSON(payload []byte) (map[string]any, error) {
	var schemaJSON map[string]any
	if err := json.Unmarshal(payload, &schemaJSON); err != nil {
		return nil, err
	}
	if schemaJSON == nil {
		return map[string]any{}, nil
	}
	return schemaJSON, nil
}

func loadPluginConfigSchemaJSON(schemaPath string) (map[string]any, error) {
	payload, err := loadPluginConfigSchemaPayload(schemaPath)
	if err != nil {
		return nil, err
	}
	return parsePluginConfigSchemaJSON(payload)
}

func loadPluginConfigSchemaDocument(entry DiscoveredPlugin) (pluginConfigSchemaDocument, bool, error) {
	schemaPath, ok, err := resolvePluginConfigSchemaPath(entry)
	if err != nil || !ok {
		return pluginConfigSchemaDocument{}, ok, err
	}
	document, err := loadPluginConfigSchemaDocumentAtPath(schemaPath)
	if err != nil {
		return pluginConfigSchemaDocument{}, true, err
	}
	return document, true, nil
}

func loadPluginConfigSchemaAuthoringDocument(pluginRoot string, manifest PluginManifest) (pluginConfigSchemaDocument, bool, error) {
	trimmedPath := strings.TrimSpace(manifest.ConfigSchemaPath)
	if trimmedPath == "" {
		return pluginConfigSchemaDocument{}, false, nil
	}
	schemaPath, err := resolveAuthoringPath(pluginRoot, trimmedPath, "Invalid configSchemaPath")
	if err != nil {
		return pluginConfigSchemaDocument{}, false, err
	}
	document, err := loadPluginConfigSchemaDocumentAtPath(schemaPath)
	if err != nil {
		return pluginConfigSchemaDocument{}, true, err
	}
	return document, true, nil
}

func loadPluginConfigSchemaDocumentAtPath(schemaPath string) (pluginConfigSchemaDocument, error) {
	document := pluginConfigSchemaDocument{Path: schemaPath}
	payload, err := loadPluginConfigSchemaPayload(schemaPath)
	if err != nil {
		return document, err
	}
	document.JSON, err = parsePluginConfigSchemaJSON(payload)
	if err != nil {
		return document, err
	}
	schema, err := parsePluginConfigSchema(payload)
	if err != nil {
		return document, err
	}
	resolved, err := schema.Resolve(&jsonschema.ResolveOptions{
		BaseURI:          schemaFileURI(schemaPath),
		Loader:           pluginConfigSchemaLoader(),
		ValidateDefaults: true,
	})
	if err != nil {
		return document, err
	}
	document.Resolved = resolved
	return document, nil
}

func validateDiscoveredPluginConfigSchema(entry DiscoveredPlugin) error {
	document, ok, err := loadPluginConfigSchemaDocument(entry)
	if err == nil || !ok {
		return err
	}
	return invalidPluginConfigSchemaError(document.Path)
}

func invalidPluginConfigSchemaError(schemaPath string) error {
	return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Invalid plugin config schema JSON: %s", schemaPath)
}

func pluginConfigSchemaDefaultValue(
	schema map[string]any,
	schemaPath string,
	seen map[string]struct{},
) (any, bool, error) {
	if len(schema) == 0 {
		return nil, false, nil
	}
	if defaultValue, ok := schema["default"]; ok {
		return cloneJSONValue(defaultValue), true, nil
	}
	return pluginConfigSchemaCompositeDefaults(schema, schemaPath, seen)
}

func pluginConfigSchemaCompositeDefaults(
	schema map[string]any,
	schemaPath string,
	seen map[string]struct{},
) (any, bool, error) {
	collected, hasDefaults, err := pluginConfigSchemaReferencedDefaults(schema, schemaPath, seen)
	if err != nil {
		return nil, false, err
	}
	propertyDefaults, err := pluginConfigSchemaPropertyDefaults(schema, schemaPath, seen)
	if err != nil {
		return nil, false, err
	}
	if len(propertyDefaults) == 0 {
		return collected, hasDefaults, nil
	}
	return mergePluginConfigSchemaDefaultValues(collected, propertyDefaults), true, nil
}

func pluginConfigSchemaReferencedDefaults(
	schema map[string]any,
	schemaPath string,
	seen map[string]struct{},
) (any, bool, error) {
	var collected any
	hasDefaults := false
	refValue, ok := schema["$ref"].(string)
	if ok {
		resolvedDefault, ok, err := pluginConfigSchemaDefaultValueForRef(schemaPath, refValue, seen)
		if err != nil {
			return nil, false, err
		}
		if ok {
			collected = mergePluginConfigSchemaDefaultValues(collected, resolvedDefault)
			hasDefaults = true
		}
	}
	allOfDefaults, allOfHasDefaults, err := pluginConfigSchemaAllOfDefaults(schema, schemaPath, seen)
	if err != nil {
		return nil, false, err
	}
	if allOfHasDefaults {
		collected = mergePluginConfigSchemaDefaultValues(collected, allOfDefaults)
		hasDefaults = true
	}
	return collected, hasDefaults, nil
}

func pluginConfigSchemaAllOfDefaults(
	schema map[string]any,
	schemaPath string,
	seen map[string]struct{},
) (any, bool, error) {
	var collected any
	hasDefaults := false
	rawAllOf, ok := schema["allOf"].([]any)
	if !ok {
		return nil, false, nil
	}
	for _, rawSchema := range rawAllOf {
		subschema, ok := rawSchema.(map[string]any)
		if !ok {
			continue
		}
		defaultValue, ok, err := pluginConfigSchemaDefaultValue(subschema, schemaPath, seen)
		if err != nil {
			return nil, false, err
		}
		if ok {
			collected = mergePluginConfigSchemaDefaultValues(collected, defaultValue)
			hasDefaults = true
		}
	}
	return collected, hasDefaults, nil
}

func pluginConfigSchemaPropertyDefaults(
	schema map[string]any,
	schemaPath string,
	seen map[string]struct{},
) (map[string]any, error) {
	properties, ok := schema["properties"].(map[string]any)
	if !ok || len(properties) == 0 {
		return nil, nil
	}

	defaults := map[string]any{}
	for key, rawProperty := range properties {
		property, ok := rawProperty.(map[string]any)
		if !ok {
			continue
		}
		defaultValue, ok, err := pluginConfigSchemaDefaultValue(property, schemaPath, seen)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		defaults[key] = defaultValue
	}
	return defaults, nil
}

func pluginConfigSchemaDefaults(document pluginConfigSchemaDocument) map[string]any {
	defaultValue, ok, err := pluginConfigSchemaDefaultValue(document.JSON, document.Path, map[string]struct{}{})
	if err != nil || !ok {
		return nil
	}
	defaultMap, ok := defaultValue.(map[string]any)
	if !ok {
		return nil
	}
	return defaultMap
}

func pluginConfigSchemaDefaultValueForRef(schemaPath string, ref string, seen map[string]struct{}) (any, bool, error) {
	trimmedRef := strings.TrimSpace(ref)
	if trimmedRef == "" {
		return nil, false, nil
	}
	resolvedURI, err := resolvePluginConfigSchemaRefURI(schemaPath, trimmedRef)
	if err != nil {
		return nil, false, err
	}

	key := resolvedURI.String()
	if _, ok := seen[key]; ok {
		return nil, false, nil
	}
	seen[key] = struct{}{}
	defer delete(seen, key)

	targetPath, err := pluginConfigSchemaPathFromFileURI(resolvedURI)
	if err != nil {
		return nil, false, err
	}
	schemaJSON, err := loadPluginConfigSchemaJSON(targetPath)
	if err != nil {
		return nil, false, err
	}
	target, err := resolvePluginConfigSchemaJSONPointer(schemaJSON, resolvedURI.Fragment)
	if err != nil {
		return nil, false, err
	}
	targetSchema, ok := target.(map[string]any)
	if !ok {
		return nil, false, nil
	}
	return pluginConfigSchemaDefaultValue(targetSchema, targetPath, seen)
}

func resolvePluginConfigSchemaRefURI(schemaPath string, ref string) (*url.URL, error) {
	baseURI, err := url.Parse(schemaFileURI(schemaPath))
	if err != nil {
		return nil, err
	}
	refURI, err := url.Parse(ref)
	if err != nil {
		return nil, err
	}
	resolvedURI := baseURI.ResolveReference(refURI)
	if resolvedURI.Scheme != "" && resolvedURI.Scheme != "file" {
		return nil, fmt.Errorf("plugin config schema refs must use local files: %s", resolvedURI.String())
	}
	return resolvedURI, nil
}

func resolvePluginConfigSchemaJSONPointer(root any, fragment string) (any, error) {
	if fragment == "" {
		return root, nil
	}
	decodedFragment, err := url.PathUnescape(fragment)
	if err != nil {
		return nil, err
	}
	if decodedFragment == "" {
		return root, nil
	}
	if !strings.HasPrefix(decodedFragment, "/") {
		return nil, fmt.Errorf("unsupported plugin config schema ref fragment: %s", fragment)
	}

	current := root
	for _, rawSegment := range strings.Split(decodedFragment[1:], "/") {
		segment := strings.ReplaceAll(strings.ReplaceAll(rawSegment, "~1", "/"), "~0", "~")
		switch typed := current.(type) {
		case map[string]any:
			next, ok := typed[segment]
			if !ok {
				return nil, fmt.Errorf("plugin config schema ref target not found: %s", fragment)
			}
			current = next
		case []any:
			index, err := strconv.Atoi(segment)
			if err != nil || index < 0 || index >= len(typed) {
				return nil, fmt.Errorf("plugin config schema ref target not found: %s", fragment)
			}
			current = typed[index]
		default:
			return nil, fmt.Errorf("plugin config schema ref target not found: %s", fragment)
		}
	}
	return current, nil
}

func mergePluginConfigSchemaDefaultValues(base any, overlay any) any {
	switch {
	case overlay == nil:
		return cloneJSONValue(base)
	case base == nil:
		return cloneJSONValue(overlay)
	}

	baseMap, baseOK := base.(map[string]any)
	overlayMap, overlayOK := overlay.(map[string]any)
	if baseOK && overlayOK {
		return mergeStringAnyMaps(baseMap, overlayMap)
	}
	return cloneJSONValue(overlay)
}
