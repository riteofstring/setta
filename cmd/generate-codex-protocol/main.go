package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"go/format"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

type protocolMember struct {
	Method     string
	ConstName  string
	ParamsName string
	Source     string
}

type generator struct {
	repoRoot       string
	schemaDir      string
	rustDir        string
	outputPath     string
	rootSchemas    map[string]jsonSchema
	clientMethods  []protocolMember
	serverRequests []protocolMember
	notifications  []protocolMember
	schemas        map[string]jsonSchema
	schemaRaw      map[string]string
	queue          []string
}

type protocolRoots struct {
	ClientRequest      jsonSchema
	ServerRequest      jsonSchema
	ServerNotification jsonSchema
}

func main() {
	output := flag.String("out", "internal/codexapp/protocol_gen.go", "generated Go output path")
	schemaDir := flag.String("schema", "internal/codexapp/protocolschema", "checked-in Codex protocol schema snapshot")
	flag.Parse()

	repoRoot, err := os.Getwd()
	if err != nil {
		fatalf("find repo root: %v", err)
	}
	generator := &generator{
		repoRoot:    repoRoot,
		schemaDir:   filepath.Join(repoRoot, *schemaDir, "json"),
		rustDir:     filepath.Join(repoRoot, *schemaDir, "rust", "protocol"),
		outputPath:  filepath.Join(repoRoot, *output),
		rootSchemas: map[string]jsonSchema{},
		schemas:     map[string]jsonSchema{},
		schemaRaw:   map[string]string{},
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
	usage, err := generator.discoverUsage()
	if err != nil {
		return err
	}
	if err := generator.collectSchemasFromUsage(usage); err != nil {
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
	experimental, err := generator.experimentalClientMethods()
	if err != nil {
		return err
	}
	generator.clientMethods = mergeMembers(clientMethods, experimental)
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
		generator.rootSchemas[definitionName] = definition
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

func (generator *generator) experimentalClientMethods() ([]protocolMember, error) {
	commonPath := filepath.Join(generator.rustDir, "common.rs")
	data, err := os.ReadFile(commonPath)
	if err != nil {
		return nil, fmt.Errorf("read experimental protocol source: %w", err)
	}
	pattern := regexp.MustCompile(`(?s)([A-Za-z][A-Za-z0-9]*)\s*=>\s*"([^"]+)"\s*\{\s*params:\s*v2::([A-Za-z][A-Za-z0-9]*)[^}]*?response:\s*v2::([A-Za-z][A-Za-z0-9]*)`)
	text := string(data)
	matches := pattern.FindAllStringSubmatchIndex(text, -1)
	members := []protocolMember{}
	for _, match := range matches {
		start := match[0]
		prefixStart := start - 200
		if prefixStart < 0 {
			prefixStart = 0
		}
		if !strings.Contains(text[prefixStart:start], "#[experimental") {
			continue
		}
		method := text[match[4]:match[5]]
		if strings.HasPrefix(method, "mock/") {
			continue
		}
		members = append(members, protocolMember{
			Method:     method,
			ConstName:  methodConstName(method),
			ParamsName: text[match[6]:match[7]],
			Source:     "rust",
		})
	}
	sort.Slice(members, func(left int, right int) bool {
		return members[left].Method < members[right].Method
	})
	return members, nil
}

type usageSet struct {
	clientMethods  map[string]bool
	notifications  map[string]bool
	serverRequests map[string]bool
}

type usageMatchers struct {
	clientMethods           map[string]bool
	notifications           map[string]bool
	serverRequests          map[string]bool
	methodConstNames        map[string]string
	notificationConstNames  map[string]string
	serverRequestConstNames map[string]string
}

func (generator *generator) discoverUsage() (usageSet, error) {
	usage := newUsageSet()
	matchers := generator.usageMatchers()
	err := filepath.WalkDir(filepath.Join(generator.repoRoot, "internal", "chat"), func(path string, entry fs.DirEntry, err error) error {
		return discoverUsagePath(&usage, matchers, path, entry, err)
	})
	if err != nil {
		return usageSet{}, fmt.Errorf("discover Codex protocol usage: %w", err)
	}
	return usage, nil
}

func newUsageSet() usageSet {
	return usageSet{
		clientMethods:  map[string]bool{},
		notifications:  map[string]bool{},
		serverRequests: map[string]bool{},
	}
}

func (generator *generator) usageMatchers() usageMatchers {
	return usageMatchers{
		clientMethods:           memberMethodSet(generator.clientMethods),
		notifications:           memberMethodSet(generator.notifications),
		serverRequests:          memberMethodSet(generator.serverRequests),
		methodConstNames:        memberConstMethodSet(generator.clientMethods, "CodexMethod"),
		notificationConstNames:  memberConstMethodSet(generator.notifications, "CodexNotification"),
		serverRequestConstNames: memberConstMethodSet(generator.serverRequests, "CodexServerRequest"),
	}
}

func discoverUsagePath(usage *usageSet, matchers usageMatchers, path string, entry fs.DirEntry, walkErr error) error {
	if walkErr != nil {
		return walkErr
	}
	if entry.IsDir() || !strings.HasSuffix(path, ".go") {
		return nil
	}
	if strings.HasSuffix(path, "codex_protocol_registry.go") {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	recordUsageFromText(usage, matchers, string(data))
	return nil
}

func recordUsageFromText(usage *usageSet, matchers usageMatchers, text string) {
	for value := range stringLiterals(text) {
		recordLiteralUsage(usage, matchers, value)
	}
	recordConstantUsage(usage.clientMethods, matchers.methodConstNames, text)
	recordConstantUsage(usage.notifications, matchers.notificationConstNames, text)
	recordConstantUsage(usage.serverRequests, matchers.serverRequestConstNames, text)
}

func recordLiteralUsage(usage *usageSet, matchers usageMatchers, value string) {
	switch {
	case matchers.clientMethods[value]:
		usage.clientMethods[value] = true
	case matchers.notifications[value]:
		usage.notifications[value] = true
	case matchers.serverRequests[value]:
		usage.serverRequests[value] = true
	}
}

func recordConstantUsage(used map[string]bool, constants map[string]string, text string) {
	for constName, method := range constants {
		if strings.Contains(text, "codexapp."+constName) {
			used[method] = true
		}
	}
}

func memberMethodSet(members []protocolMember) map[string]bool {
	set := map[string]bool{}
	for _, member := range members {
		set[member.Method] = true
	}
	return set
}

func memberConstMethodSet(members []protocolMember, prefix string) map[string]string {
	set := map[string]string{}
	for _, member := range members {
		set[prefix+member.ConstName] = member.Method
	}
	return set
}

func stringLiterals(text string) map[string]bool {
	pattern := regexp.MustCompile(`"([A-Za-z0-9_/\.-]+)"`)
	values := map[string]bool{}
	for _, match := range pattern.FindAllStringSubmatch(text, -1) {
		values[match[1]] = true
	}
	return values
}

func (generator *generator) collectSchemasFromUsage(usage usageSet) error {
	if err := generator.collectClientMethodSchemas(usage.clientMethods); err != nil {
		return err
	}
	if err := generator.collectMemberSchemas(generator.notifications, usage.notifications, "notification params"); err != nil {
		return err
	}
	if err := generator.collectMemberSchemas(generator.serverRequests, usage.serverRequests, "server request params"); err != nil {
		return err
	}
	return generator.walkSchemaQueue()
}

func (generator *generator) collectClientMethodSchemas(used map[string]bool) error {
	byMethod := membersByMethod(generator.clientMethods)
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
		if err := generator.enqueueNamedSchema(member.ParamsName); err != nil {
			return fmt.Errorf("%s params: %w", member.Method, err)
		}
	}
	responseName := responseNameForParams(member.ParamsName)
	if responseName == "" {
		return nil
	}
	if err := generator.enqueueSchemaFile(responseName); err != nil && !errors.Is(err, errSchemaFileMissing) {
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
		generator.addSchema(name, schema)
		return nil
	}
	if err := generator.enqueueSchemaFile(name); err != nil {
		if errors.Is(err, errSchemaFileMissing) {
			return generator.enqueueRustStruct(name)
		}
		return err
	}
	return nil
}

func (generator *generator) enqueueSchemaFile(name string) error {
	if _, ok := generator.schemas[name]; ok {
		return nil
	}
	path := filepath.Join(generator.schemaDir, "v2", name+".json")
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			path = filepath.Join(generator.schemaDir, name+".json")
		}
	}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			foundPath, ok, walkErr := generator.findSchemaFile(name)
			if walkErr != nil {
				return walkErr
			}
			if !ok {
				return errSchemaFileMissing
			}
			path = foundPath
		} else {
			return err
		}
	}
	schema, err := readSchema(path)
	if err != nil {
		return err
	}
	generator.addSchema(name, schema)
	for defName, def := range schema.Definitions {
		generator.addSchema(defName, def)
	}
	return nil
}

func (generator *generator) findSchemaFile(name string) (string, bool, error) {
	target := name + ".json"
	found := ""
	err := filepath.WalkDir(generator.schemaDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || entry.Name() != target {
			return nil
		}
		found = path
		return filepath.SkipAll
	})
	if err != nil {
		return "", false, err
	}
	return found, found != "", nil
}

func (generator *generator) addSchema(name string, schema jsonSchema) {
	raw := string(schema.raw)
	if raw == "" {
		data, _ := json.Marshal(schema)
		raw = string(canonicalJSON(data))
	}
	if existing, ok := generator.schemaRaw[name]; ok {
		if existing == raw {
			return
		}
		return
	}
	generator.schemas[name] = schema
	generator.schemaRaw[name] = raw
	generator.queue = append(generator.queue, name)
}

func (generator *generator) enqueueRustStruct(name string) error {
	if _, ok := generator.schemas[name]; ok {
		return nil
	}
	path := filepath.Join(generator.rustDir, "v2", "thread.rs")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read Rust protocol source for %s: %w", name, err)
	}
	schema, ok := rustStructSchema(string(data), name)
	if !ok {
		return fmt.Errorf("schema %s was not found in JSON snapshot or Rust protocol source", name)
	}
	generator.addSchema(name, schema)
	return nil
}

func rustStructSchema(text string, name string) (jsonSchema, bool) {
	pattern := regexp.MustCompile(`(?s)pub struct ` + regexp.QuoteMeta(name) + ` \{(.*?)\n\}`)
	match := pattern.FindStringSubmatch(text)
	if match == nil {
		return jsonSchema{}, false
	}
	properties := map[string]jsonSchema{}
	required := []string{}
	fieldPattern := regexp.MustCompile(`(?m)^\s*pub ([a-zA-Z0-9_]+): ([^,]+),`)
	for _, field := range fieldPattern.FindAllStringSubmatch(match[1], -1) {
		jsonName := lowerCamelFromSnake(field[1])
		schema, isRequired := rustTypeSchema(strings.TrimSpace(field[2]))
		properties[jsonName] = schema
		if isRequired {
			required = append(required, jsonName)
		}
	}
	sort.Strings(required)
	return jsonSchema{
		Title:      name,
		Type:       "object",
		Properties: properties,
		Required:   required,
	}, true
}

func rustTypeSchema(typeName string) (jsonSchema, bool) {
	if typeName == "String" || typeName == "PathBuf" {
		return jsonSchema{Type: "string"}, true
	}
	if strings.HasPrefix(typeName, "Option<") {
		inner := strings.TrimSuffix(strings.TrimPrefix(typeName, "Option<"), ">")
		if strings.HasPrefix(inner, "Option<") {
			return jsonSchema{Type: []any{"string", "null"}}, false
		}
		schema, _ := rustTypeSchema(inner)
		if schema.Ref == "" && typeString(schema.Type) == "" {
			schema = jsonSchema{}
		}
		return nullableSchema(schema), false
	}
	switch typeName {
	case "ReasoningEffort":
		return jsonSchema{Ref: "#/definitions/ReasoningEffort"}, false
	default:
		return jsonSchema{}, false
	}
}

func nullableSchema(schema jsonSchema) jsonSchema {
	if schema.Ref != "" {
		return jsonSchema{AnyOf: []jsonSchema{schema, jsonSchema{Type: "null"}}}
	}
	if text := typeString(schema.Type); text != "" {
		return jsonSchema{Type: []any{text, "null"}}
	}
	return jsonSchema{}
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
	buffer.WriteString("import \"encoding/json\"\n\n")
	renderMethodConstants(&buffer, "CodexMethod", generator.clientMethods)
	renderMethodConstants(&buffer, "CodexServerRequest", generator.serverRequests)
	renderMethodConstants(&buffer, "CodexNotification", generator.notifications)
	if err := generator.renderSchemas(&buffer); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func renderMethodConstants(buffer *bytes.Buffer, prefix string, members []protocolMember) {
	buffer.WriteString("const (\n")
	for _, member := range members {
		fmt.Fprintf(buffer, "\t%s%s = %q\n", prefix, member.ConstName, member.Method)
	}
	buffer.WriteString(")\n\n")
	fmt.Fprintf(buffer, "var %sValues = []string{\n", prefix)
	for _, member := range members {
		fmt.Fprintf(buffer, "\t%s%s,\n", prefix, member.ConstName)
	}
	buffer.WriteString("}\n\n")
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
	enumValues := stringEnumValues(schema)
	if len(enumValues) > 0 {
		renderStringEnum(buffer, typeName, enumValues)
		return nil
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

func (generator *generator) renderObjectSchema(buffer *bytes.Buffer, typeName string, schema jsonSchema) error {
	required := requiredFields(schema.Required)
	fmt.Fprintf(buffer, "type %s struct {\n", typeName)
	for _, propertyName := range sortedPropertyNames(schema.Properties) {
		property := schema.Properties[propertyName]
		goType, err := generator.goType(property, required[propertyName])
		if err != nil {
			return fmt.Errorf("%s.%s: %w", typeName, propertyName, err)
		}
		fmt.Fprintf(buffer, "\t%s %s `json:%q`\n", exportedFieldName(propertyName), goType, jsonFieldTag(propertyName, required[propertyName]))
	}
	buffer.WriteString("}\n\n")
	return nil
}

func requiredFields(fields []string) map[string]bool {
	required := map[string]bool{}
	for _, field := range fields {
		required[field] = true
	}
	return required
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
	return typeString(schema.Type) != "" || len(schema.OneOf) > 0 || len(schema.AnyOf) > 0 || schema.Items != nil
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

func (generator *generator) goType(schema jsonSchema, required bool) (string, error) {
	nullable, inner := nullableInner(schema)
	if nullable {
		return generator.nullableGoType(inner)
	}
	if schema.Ref != "" {
		return goTypeFromRef(schema.Ref)
	}
	if len(schema.OneOf) > 0 || len(schema.AnyOf) > 0 {
		return goTypeFromUnion(schema), nil
	}
	if primitive, ok := primitiveGoType(typeString(schema.Type), required); ok {
		return primitive, nil
	}
	return generator.compositeGoType(schema, typeString(schema.Type))
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

func lowerCamelFromSnake(value string) string {
	parts := strings.Split(value, "_")
	if len(parts) == 0 {
		return value
	}
	for index := 1; index < len(parts); index++ {
		parts[index] = upperFirst(parts[index])
	}
	return strings.Join(parts, "")
}
