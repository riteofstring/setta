package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

type protocolMember struct {
	Method       string
	ConstName    string
	ParamsName   string
	Source       string
	Experimental bool
}

type generator struct {
	repoRoot                string
	schemaDir               string
	experimentalSchemaDir   string
	supportedPath           string
	outputPath              string
	rootSchemas             map[string]jsonSchema
	rootSchemaRaw           map[string]string
	clientMethods           []protocolMember
	serverRequests          []protocolMember
	notifications           []protocolMember
	supportedClientMethods  []protocolMember
	supportedServerRequests []protocolMember
	supportedNotifications  []protocolMember
	schemas                 map[string]jsonSchema
	schemaRaw               map[string]string
	queue                   []string
}

type protocolRoots struct {
	ClientRequest      jsonSchema
	ServerRequest      jsonSchema
	ServerNotification jsonSchema
}

func main() {
	output := flag.String("out", "internal/codexapp/protocol_gen.go", "generated Go output path")
	schemaDir := flag.String("schema", "internal/codexapp/protocolschema", "checked-in Codex protocol schema snapshot")
	experimentalSchemaDir := flag.String("experimental-schema", "internal/codexapp/protocolschema/json_experimental", "checked-in generated Codex experimental protocol schema snapshot")
	supported := flag.String("supported", "internal/codexapp/protocolschema/supported_protocol.json", "checked-in supported Codex protocol registration")
	flag.Parse()

	repoRoot, err := os.Getwd()
	if err != nil {
		fatalf("find repo root: %v", err)
	}
	generator := &generator{
		repoRoot:              repoRoot,
		schemaDir:             filepath.Join(repoRoot, *schemaDir, "json"),
		experimentalSchemaDir: filepath.Join(repoRoot, *experimentalSchemaDir),
		supportedPath:         filepath.Join(repoRoot, *supported),
		outputPath:            filepath.Join(repoRoot, *output),
		rootSchemas:           map[string]jsonSchema{},
		rootSchemaRaw:         map[string]string{},
		schemas:               map[string]jsonSchema{},
		schemaRaw:             map[string]string{},
	}
	if err := generator.run(); err != nil {
		fatalf("generate codex protocol: %v", err)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func (generator *generator) run() error {
	roots, err := generator.loadProtocolRoots()
	if err != nil {
		return err
	}
	if err := generator.loadProtocolMembers(roots); err != nil {
		return err
	}
	supported, err := generator.loadSupportedProtocol()
	if err != nil {
		return err
	}
	if err := generator.applySupportedProtocol(supported); err != nil {
		return err
	}
	if err := generator.collectSchemasFromSupported(supported); err != nil {
		return err
	}

	output, err := generator.render()
	if err != nil {
		return err
	}
	return generator.writeGeneratedOutput(output)
}

func (generator *generator) loadProtocolRoots() (protocolRoots, error) {
	client, err := generator.loadRoot("ClientRequest.json")
	if err != nil {
		return protocolRoots{}, err
	}
	serverRequest, err := generator.loadRoot("ServerRequest.json")
	if err != nil {
		return protocolRoots{}, err
	}
	notifications, err := generator.loadRoot("ServerNotification.json")
	if err != nil {
		return protocolRoots{}, err
	}
	return protocolRoots{
		ClientRequest:      client,
		ServerRequest:      serverRequest,
		ServerNotification: notifications,
	}, nil
}

func (generator *generator) loadProtocolMembers(roots protocolRoots) error {
	clientMethods, err := membersFromRoot(roots.ClientRequest, "client request")
	if err != nil {
		return err
	}
	generator.clientMethods = clientMethods
	generator.serverRequests, err = membersFromRoot(roots.ServerRequest, "server request")
	if err != nil {
		return err
	}
	generator.notifications, err = membersFromRoot(roots.ServerNotification, "server notification")
	return err
}

func (generator *generator) writeGeneratedOutput(output []byte) error {
	formatted, err := format.Source(output)
	if err != nil {
		return fmt.Errorf("format generated Go: %w\n%s", err, output)
	}
	if err := os.MkdirAll(filepath.Dir(generator.outputPath), 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}
	return os.WriteFile(generator.outputPath, formatted, 0o644)
}

func (generator *generator) loadRoot(name string) (jsonSchema, error) {
	path := filepath.Join(generator.schemaDir, name)
	schema, err := readSchema(path)
	if err != nil {
		return jsonSchema{}, err
	}
	for definitionName, definition := range schema.Definitions {
		if err := generator.addRootSchema(definitionName, definition); err != nil {
			return jsonSchema{}, fmt.Errorf("%s definition %s: %w", name, definitionName, err)
		}
	}
	return schema, nil
}

func readSchema(path string) (jsonSchema, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return jsonSchema{}, fmt.Errorf("read %s: %w", path, err)
	}
	var schema jsonSchema
	if err := json.Unmarshal(data, &schema); err != nil {
		return jsonSchema{}, fmt.Errorf("parse %s: %w", path, err)
	}
	schema.raw = canonicalJSON(data)
	return schema, nil
}

func canonicalJSON(data []byte) []byte {
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return data
	}
	canonical, err := json.Marshal(value)
	if err != nil {
		return data
	}
	return canonical
}

func membersFromRoot(root jsonSchema, label string) ([]protocolMember, error) {
	if len(root.OneOf) == 0 {
		return nil, fmt.Errorf("%s root has no oneOf members", label)
	}
	members := make([]protocolMember, 0, len(root.OneOf))
	seenMethods := map[string]bool{}
	for index, entry := range root.OneOf {
		methodSchema, ok := entry.Properties["method"]
		if !ok {
			return nil, fmt.Errorf("%s oneOf[%d] has no method property", label, index)
		}
		if len(methodSchema.Enum) != 1 {
			return nil, fmt.Errorf("%s oneOf[%d] method enum must contain exactly one value", label, index)
		}
		method := methodSchema.Enum[0]
		if method == "" {
			return nil, fmt.Errorf("%s oneOf[%d] method is empty", label, index)
		}
		if seenMethods[method] {
			return nil, fmt.Errorf("%s root has duplicate method %s", label, method)
		}
		seenMethods[method] = true
		paramsName := ""
		if params, ok := entry.Properties["params"]; ok && params.Ref != "" {
			name, err := refName(params.Ref)
			if err != nil {
				return nil, fmt.Errorf("%s %s params ref: %w", label, method, err)
			}
			paramsName = name
		}
		members = append(members, protocolMember{
			Method:     method,
			ConstName:  methodConstName(method),
			ParamsName: paramsName,
			Source:     "json",
		})
	}
	sort.Slice(members, func(left int, right int) bool {
		return members[left].Method < members[right].Method
	})
	return members, nil
}

func refName(ref string) (string, error) {
	const prefix = "#/definitions/"
	if !strings.HasPrefix(ref, prefix) {
		return "", fmt.Errorf("unsupported ref %s", ref)
	}
	name := strings.TrimPrefix(ref, prefix)
	if strings.Contains(name, "/") {
		parts := strings.Split(name, "/")
		name = parts[len(parts)-1]
	}
	if name == "" {
		return "", fmt.Errorf("empty ref %s", ref)
	}
	return name, nil
}

func mergeMembers(base []protocolMember, extra []protocolMember) []protocolMember {
	byMethod := map[string]protocolMember{}
	for _, member := range base {
		byMethod[member.Method] = member
	}
	for _, member := range extra {
		byMethod[member.Method] = member
	}
	methods := make([]string, 0, len(byMethod))
	for method := range byMethod {
		methods = append(methods, method)
	}
	sort.Strings(methods)
	result := make([]protocolMember, 0, len(methods))
	for _, method := range methods {
		result = append(result, byMethod[method])
	}
	return result
}

func (generator *generator) collectClientMethodSchemas(used map[string]bool) error {
	byMethod := membersByMethod(generator.supportedClientMethods)
	for method := range used {
		member, ok := byMethod[method]
		if !ok {
			return fmt.Errorf("used Codex client method %s is missing from generated methods", method)
		}
		if err := generator.collectClientMethodSchema(member); err != nil {
			return err
		}
	}
	return nil
}

func membersByMethod(members []protocolMember) map[string]protocolMember {
	byMethod := map[string]protocolMember{}
	for _, member := range members {
		byMethod[member.Method] = member
	}
	return byMethod
}

func (generator *generator) collectClientMethodSchema(member protocolMember) error {
	if member.ParamsName != "" {
		if err := generator.enqueueNamedClientSchema(member); err != nil {
			return fmt.Errorf("%s params: %w", member.Method, err)
		}
	}
	responseName := responseNameForParams(member.ParamsName)
	if responseName == "" {
		return nil
	}
	if err := generator.enqueueClientSchemaFile(member, responseName); err != nil && !errors.Is(err, errSchemaFileMissing) {
		return fmt.Errorf("%s response: %w", member.Method, err)
	}
	return nil
}

func (generator *generator) collectMemberSchemas(members []protocolMember, used map[string]bool, label string) error {
	for _, member := range members {
		if !used[member.Method] || member.ParamsName == "" {
			continue
		}
		if err := generator.enqueueNamedSchema(member.ParamsName); err != nil {
			return fmt.Errorf("%s %s: %w", member.Method, label, err)
		}
	}
	return nil
}

func responseNameForParams(paramsName string) string {
	if paramsName == "" || !strings.HasSuffix(paramsName, "Params") {
		return ""
	}
	return strings.TrimSuffix(paramsName, "Params") + "Response"
}

var errSchemaFileMissing = errors.New("schema file missing")

func (generator *generator) enqueueNamedSchema(name string) error {
	if _, ok := generator.schemas[name]; ok {
		return nil
	}
	if schema, ok := generator.rootSchemas[name]; ok {
		return generator.addSchema(name, schema)
	}
	if err := generator.enqueueSchemaFile(name); err != nil {
		if errors.Is(err, errSchemaFileMissing) {
			return fmt.Errorf("schema %s was not found in JSON snapshot", name)
		}
		return err
	}
	return nil
}

func (generator *generator) enqueueNamedClientSchema(member protocolMember) error {
	if member.Experimental {
		return generator.enqueueNamedExperimentalSchema(member.ParamsName)
	}
	return generator.enqueueNamedSchema(member.ParamsName)
}

func (generator *generator) enqueueNamedExperimentalSchema(name string) error {
	if _, ok := generator.schemas[name]; ok {
		return nil
	}
	if err := generator.enqueueExperimentalSchemaFile(name); err != nil {
		if errors.Is(err, errSchemaFileMissing) {
			return fmt.Errorf("schema %s was not found in generated experimental JSON snapshot", name)
		}
		return err
	}
	return nil
}

func (generator *generator) enqueueSchemaFile(name string) error {
	if _, ok := generator.schemas[name]; ok {
		return nil
	}
	path, err := generator.schemaFilePath(name)
	if err != nil {
		return err
	}
	return generator.enqueueSchemaFileAtPath(name, path)
}

func (generator *generator) enqueueClientSchemaFile(member protocolMember, name string) error {
	if member.Experimental {
		return generator.enqueueExperimentalSchemaFile(name)
	}
	return generator.enqueueSchemaFile(name)
}

func (generator *generator) enqueueExperimentalSchemaFile(name string) error {
	if _, ok := generator.schemas[name]; ok {
		return nil
	}
	path, err := generator.experimentalSchemaFilePath(name)
	if err != nil {
		return err
	}
	return generator.enqueueSchemaFileAtPath(name, path)
}

func (generator *generator) enqueueSchemaFileAtPath(name string, path string) error {
	schema, err := readSchema(path)
	if err != nil {
		return err
	}
	if err := generator.addSchema(name, schema); err != nil {
		return err
	}
	for defName, def := range schema.Definitions {
		if err := generator.addSchema(defName, def); err != nil {
			return fmt.Errorf("%s definition %s: %w", name, defName, err)
		}
	}
	return nil
}

func (generator *generator) schemaFilePath(name string) (string, error) {
	return schemaFilePathIn(generator.schemaDir, name)
}

func (generator *generator) experimentalSchemaFilePath(name string) (string, error) {
	return schemaFilePathIn(generator.experimentalSchemaDir, name)
}

func schemaFilePathIn(dir string, name string) (string, error) {
	for _, path := range []string{
		filepath.Join(dir, "v2", name+".json"),
		filepath.Join(dir, "v1", name+".json"),
		filepath.Join(dir, name+".json"),
	} {
		exists, err := fileExists(path)
		if err != nil {
			return "", err
		}
		if exists {
			return path, nil
		}
	}
	return "", errSchemaFileMissing
}

func fileExists(path string) (bool, error) {
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (generator *generator) addRootSchema(name string, schema jsonSchema) error {
	raw, err := schemaCanonicalText(name, schema)
	if err != nil {
		return err
	}
	if existing, ok := generator.rootSchemaRaw[name]; ok {
		if existing == raw {
			return nil
		}
		return fmt.Errorf("schema %s has conflicting root definitions", name)
	}
	generator.rootSchemas[name] = schema
	generator.rootSchemaRaw[name] = raw
	return nil
}

func (generator *generator) addSchema(name string, schema jsonSchema) error {
	raw, err := schemaCanonicalText(name, schema)
	if err != nil {
		return err
	}
	if existing, ok := generator.schemaRaw[name]; ok {
		if existing == raw {
			return nil
		}
		existingSchema := generator.schemas[name]
		if schemaIsCompatibleObjectSuperset(existingSchema, schema) {
			return nil
		}
		if schemaIsCompatibleObjectSuperset(schema, existingSchema) {
			generator.schemas[name] = schema
			generator.schemaRaw[name] = raw
			return nil
		}
		return fmt.Errorf("schema %s has conflicting definitions", name)
	}
	generator.schemas[name] = schema
	generator.schemaRaw[name] = raw
	generator.queue = append(generator.queue, name)
	return nil
}

func schemaIsCompatibleObjectSuperset(candidate jsonSchema, base jsonSchema) bool {
	if !isObjectSchema(candidate) || !isObjectSchema(base) {
		return false
	}
	candidateWithoutProperties := candidate
	baseWithoutProperties := base
	candidateWithoutProperties.Properties = nil
	baseWithoutProperties.Properties = nil
	candidateWithoutProperties.raw = nil
	baseWithoutProperties.raw = nil
	if !schemasCanonicallyEqual(candidateWithoutProperties, baseWithoutProperties) {
		return false
	}
	for name, baseProperty := range base.Properties {
		candidateProperty, ok := candidate.Properties[name]
		if !ok || !schemasCanonicallyEqual(candidateProperty, baseProperty) {
			return false
		}
	}
	return true
}

func schemasCanonicallyEqual(left jsonSchema, right jsonSchema) bool {
	left.raw = nil
	right.raw = nil
	leftText, leftErr := schemaCanonicalText("left", left)
	rightText, rightErr := schemaCanonicalText("right", right)
	return leftErr == nil && rightErr == nil && leftText == rightText
}

func schemaCanonicalText(name string, schema jsonSchema) (string, error) {
	if len(schema.raw) > 0 {
		return string(schema.raw), nil
	}
	data, err := json.Marshal(schema)
	if err != nil {
		return "", fmt.Errorf("marshal schema %s: %w", name, err)
	}
	return string(canonicalJSON(data)), nil
}

func (generator *generator) walkSchemaQueue() error {
	for len(generator.queue) > 0 {
		name := generator.queue[0]
		generator.queue = generator.queue[1:]
		for _, ref := range refsInSchema(generator.schemas[name]) {
			if err := generator.enqueueNamedSchema(ref); err != nil {
				return fmt.Errorf("%s references %s: %w", name, ref, err)
			}
		}
	}
	return nil
}

func refsInSchema(schema jsonSchema) []string {
	seen := map[string]bool{}
	var walk func(jsonSchema)
	walk = func(current jsonSchema) {
		if current.Ref != "" {
			if name, err := refName(current.Ref); err == nil {
				seen[name] = true
			}
		}
		if current.Items != nil {
			walk(*current.Items)
		}
		for _, entry := range current.OneOf {
			walk(entry)
		}
		for _, entry := range current.AnyOf {
			walk(entry)
		}
		for _, entry := range current.AllOf {
			walk(entry)
		}
		for _, property := range current.Properties {
			walk(property)
		}
		if schema, ok := schemaFromAdditionalProperties(current.AdditionalProperties); ok {
			walk(schema)
		}
	}
	walk(schema)
	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func schemaFromAdditionalProperties(value any) (jsonSchema, bool) {
	if value == nil {
		return jsonSchema{}, false
	}
	data, err := json.Marshal(value)
	if err != nil {
		return jsonSchema{}, false
	}
	var schema jsonSchema
	if err := json.Unmarshal(data, &schema); err != nil {
		return jsonSchema{}, false
	}
	return schema, schema.Ref != "" || schema.Type != nil || len(schema.Properties) > 0
}

func (generator *generator) render() ([]byte, error) {
	var buffer bytes.Buffer
	buffer.WriteString("// Code generated by cmd/generate-codex-protocol. DO NOT EDIT.\n")
	buffer.WriteString("package codexapp\n\n")
	buffer.WriteString("import (\n")
	buffer.WriteString("\t\"encoding/json\"\n")
	buffer.WriteString(")\n\n")
	renderMethodConstants(&buffer, "CodexMethod", generator.supportedClientMethods)
	renderMethodConstants(&buffer, "CodexServerRequest", generator.supportedServerRequests)
	renderProtocolMemberConstants(&buffer, "CodexNotification", generator.supportedNotifications)
	renderProtocolMemberValues(&buffer, "CodexSupportedMethodValues", "CodexMethod", generator.supportedClientMethods)
	renderProtocolMemberValues(&buffer, "CodexSupportedServerRequestValues", "CodexServerRequest", generator.supportedServerRequests)
	renderProtocolMemberValues(&buffer, "CodexSupportedNotificationValues", "CodexNotification", generator.supportedNotifications)
	renderUpstreamNotificationMethods(&buffer, generator.notifications)
	if err := generator.renderSchemas(&buffer); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func (generator *generator) renderSchemas(buffer *bytes.Buffer) error {
	names := make([]string, 0, len(generator.schemas))
	for name := range generator.schemas {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if err := generator.renderSchema(buffer, name, generator.schemas[name]); err != nil {
			return err
		}
	}
	return nil
}

func (generator *generator) renderSchema(buffer *bytes.Buffer, name string, schema jsonSchema) error {
	typeName := exportedName(name)
	enumValues := settaStringEnumValues(typeName, stringEnumValues(schema))
	if len(enumValues) > 0 {
		renderStringEnum(buffer, typeName, enumValues)
		return nil
	}
	if taggedObjectUnionTypeNames[typeName] && isTaggedObjectUnionSchema(schema) {
		return generator.renderTaggedObjectUnionSchema(buffer, typeName, schema)
	}
	if isObjectSchema(schema) {
		return generator.renderObjectSchema(buffer, typeName, schema)
	}
	if isAliasSchema(schema) {
		return generator.renderAliasSchema(buffer, typeName, schema)
	}
	renderRawMessageAlias(buffer, typeName)
	return nil
}

func renderStringEnum(buffer *bytes.Buffer, typeName string, values []string) {
	fmt.Fprintf(buffer, "type %s string\n\n", typeName)
	buffer.WriteString("const (\n")
	for _, value := range values {
		fmt.Fprintf(buffer, "\t%s%s %s = %q\n", typeName, enumValueName(value), typeName, value)
	}
	buffer.WriteString(")\n\n")
}

func isObjectSchema(schema jsonSchema) bool {
	return schema.Type == "object" || len(schema.Properties) > 0
}

func sortedPropertyNames(properties map[string]jsonSchema) []string {
	names := make([]string, 0, len(properties))
	for property := range properties {
		names = append(names, property)
	}
	sort.Strings(names)
	return names
}

func jsonFieldTag(propertyName string, required bool) string {
	if required {
		return propertyName
	}
	return propertyName + ",omitempty"
}

func isAliasSchema(schema jsonSchema) bool {
	return typeString(schema.Type) != "" || len(schema.OneOf) > 0 || len(schema.AnyOf) > 0 || len(schema.AllOf) > 0 || schema.Items != nil
}

func (generator *generator) renderAliasSchema(buffer *bytes.Buffer, typeName string, schema jsonSchema) error {
	goType, err := generator.goType(schema, true)
	if err != nil {
		return fmt.Errorf("%s: %w", typeName, err)
	}
	fmt.Fprintf(buffer, "type %s = %s\n\n", typeName, goType)
	return nil
}

func renderRawMessageAlias(buffer *bytes.Buffer, typeName string) {
	fmt.Fprintf(buffer, "type %s = json.RawMessage\n\n", typeName)
}

func stringEnumValues(schema jsonSchema) []string {
	if len(schema.Enum) > 0 && schemaTypeAllows(schema.Type, "string") {
		return append([]string{}, schema.Enum...)
	}
	if len(schema.OneOf) == 0 {
		return nil
	}
	values := []string{}
	for _, entry := range schema.OneOf {
		if len(entry.Enum) != 1 || !schemaTypeAllows(entry.Type, "string") {
			return nil
		}
		values = append(values, entry.Enum[0])
	}
	return values
}

var unsupportedStringEnumValues = map[string]map[string]struct{}{
	"ApprovalsReviewer": {
		"guardian_subagent": {},
	},
}

func settaStringEnumValues(typeName string, values []string) []string {
	unsupported := unsupportedStringEnumValues[typeName]
	if len(values) == 0 || len(unsupported) == 0 {
		return values
	}
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := unsupported[value]; ok {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func (generator *generator) goType(schema jsonSchema, required bool) (string, error) {
	nullable, inner := nullableInner(schema)
	if nullable {
		return generator.nullableGoType(inner)
	}
	if schema.Ref != "" {
		return goTypeFromRef(schema.Ref)
	}
	if len(schema.AllOf) > 0 {
		return generator.goTypeFromAllOf(schema, required)
	}
	if len(schema.OneOf) > 0 || len(schema.AnyOf) > 0 {
		return goTypeFromUnion(schema), nil
	}
	if primitive, ok := primitiveGoType(typeString(schema.Type), required); ok {
		return primitive, nil
	}
	return generator.compositeGoType(schema, typeString(schema.Type))
}

func (generator *generator) goTypeFromAllOf(schema jsonSchema, required bool) (string, error) {
	if len(schema.AllOf) != 1 {
		return "json.RawMessage", nil
	}
	goType, err := generator.goType(schema.AllOf[0], true)
	if err != nil {
		return "", err
	}
	if required || goType == "json.RawMessage" {
		return goType, nil
	}
	return "*" + strings.TrimPrefix(goType, "*"), nil
}

func (generator *generator) nullableGoType(schema jsonSchema) (string, error) {
	goType, err := generator.goType(schema, true)
	if err != nil {
		return "", err
	}
	if goType == "json.RawMessage" {
		return "json.RawMessage", nil
	}
	return "*" + strings.TrimPrefix(goType, "*"), nil
}

func goTypeFromRef(ref string) (string, error) {
	name, err := refName(ref)
	if err != nil {
		return "", err
	}
	return exportedName(name), nil
}

func goTypeFromUnion(schema jsonSchema) string {
	if values := stringEnumValues(schema); len(values) > 0 {
		return "string"
	}
	return "json.RawMessage"
}

func primitiveGoType(typeName string, required bool) (string, bool) {
	switch typeName {
	case "string":
		return optionalGoType("string", required), true
	case "boolean":
		return optionalGoType("bool", required), true
	case "integer":
		return optionalGoType("int", required), true
	case "number":
		return optionalGoType("float64", required), true
	default:
		return "", false
	}
}

func optionalGoType(typeName string, required bool) string {
	if required {
		return typeName
	}
	return "*" + typeName
}

func (generator *generator) compositeGoType(schema jsonSchema, typeName string) (string, error) {
	switch typeName {
	case "array":
		return generator.arrayGoType(schema)
	case "object":
		return objectGoType(schema), nil
	case "null", "":
		return "json.RawMessage", nil
	default:
		return "", fmt.Errorf("unsupported schema type %q", typeName)
	}
}

func (generator *generator) arrayGoType(schema jsonSchema) (string, error) {
	if schema.Items == nil {
		return "[]json.RawMessage", nil
	}
	itemType, err := generator.goType(*schema.Items, true)
	if err != nil {
		return "", err
	}
	return "[]" + strings.TrimPrefix(itemType, "*"), nil
}

func objectGoType(schema jsonSchema) string {
	if schema.AdditionalProperties != nil && len(schema.Properties) == 0 {
		return "map[string]json.RawMessage"
	}
	return "json.RawMessage"
}

func nullableInner(schema jsonSchema) (bool, jsonSchema) {
	if types := typeStrings(schema.Type); len(types) > 0 {
		withoutNull := make([]string, 0, len(types))
		hasNull := false
		for _, typeName := range types {
			if typeName == "null" {
				hasNull = true
			} else {
				withoutNull = append(withoutNull, typeName)
			}
		}
		if hasNull && len(withoutNull) == 1 {
			schema.Type = withoutNull[0]
			return true, schema
		}
	}
	if len(schema.AnyOf) == 2 {
		var inner *jsonSchema
		hasNull := false
		for index := range schema.AnyOf {
			if typeString(schema.AnyOf[index].Type) == "null" {
				hasNull = true
			} else {
				current := schema.AnyOf[index]
				inner = &current
			}
		}
		if hasNull && inner != nil {
			return true, *inner
		}
	}
	return false, jsonSchema{}
}

func schemaTypeAllows(value any, expected string) bool {
	for _, typeName := range typeStrings(value) {
		if typeName == expected {
			return true
		}
	}
	return false
}

func typeString(value any) string {
	types := typeStrings(value)
	if len(types) == 1 {
		return types[0]
	}
	return ""
}

func typeStrings(value any) []string {
	switch typed := value.(type) {
	case string:
		return []string{typed}
	case []any:
		values := []string{}
		for _, item := range typed {
			text, ok := item.(string)
			if ok {
				values = append(values, text)
			}
		}
		return values
	default:
		return nil
	}
}

func methodConstName(method string) string {
	parts := regexp.MustCompile(`[^A-Za-z0-9]+`).Split(method, -1)
	var builder strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		builder.WriteString(exportedName(part))
	}
	return builder.String()
}

func exportedName(value string) string {
	parts := regexp.MustCompile(`[^A-Za-z0-9]+`).Split(value, -1)
	var builder strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		builder.WriteString(upperFirst(part))
	}
	return builder.String()
}

func exportedFieldName(value string) string {
	switch value {
	case "id":
		return "ID"
	case "threadId":
		return "ThreadID"
	case "turnId":
		return "TurnID"
	case "cwd":
		return "CWD"
	default:
		return exportedName(value)
	}
}

func enumValueName(value string) string {
	name := exportedName(value)
	if name == "" {
		return "Unknown"
	}
	return name
}

func upperFirst(value string) string {
	if value == "" {
		return ""
	}
	runes := []rune(value)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}
