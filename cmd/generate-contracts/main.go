package main

import (
	"bytes"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"setta/internal/chat"
	"setta/internal/httpapi"
)

type contractSpec struct {
	Endpoints     []endpointSpec
	ErrorResponse reflect.Type
	Events        []eventSpec
	Interfaces    []interfaceSpec
	ValueSets     []valueSetSpec
}

type endpointSpec struct {
	Method        string
	Name          string
	OperationName string
	Path          string
	Request       reflect.Type
	Response      reflect.Type
	Streaming     bool
}

type interfaceSpec struct {
	Name string
	Type reflect.Type
}

type valueSetSpec struct {
	Name   string
	Values []string
}

type eventSpec struct {
	Name    string
	Payload reflect.Type
	Type    string
}

type decoderHelpers struct {
	Array    bool
	Boolean  bool
	Integer  bool
	Map      bool
	Nullable bool
	String   bool
}

type contractCollector struct {
	specs          []interfaceSpec
	states         map[reflect.Type]visitState
	names          map[string]reflect.Type
	valueSets      map[string]valueSetSpec
	usedValueSets  []valueSetSpec
	usedValueNames map[string]bool
}

type visitState int

const (
	visitInProgress visitState = iota + 1
	visitDone
)

func main() {
	output := flag.String("out", "desktop/src/generated/backend.ts", "generated TypeScript output path")
	flag.Parse()

	specs, err := contractSpecs(httpapi.Contracts(), chat.EventContracts())
	if err != nil {
		fmt.Fprintf(os.Stderr, "collect contracts: %v\n", err)
		os.Exit(1)
	}

	var buffer bytes.Buffer
	if err := render(&buffer, specs); err != nil {
		fmt.Fprintf(os.Stderr, "render contracts: %v\n", err)
		os.Exit(1)
	}

	if err := os.MkdirAll(filepath.Dir(*output), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "create output directory: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(*output, buffer.Bytes(), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", *output, err)
		os.Exit(1)
	}
}

func contractSpecs(schema httpapi.ContractSchema, eventSchema chat.EventContractSchema) (contractSpec, error) {
	valueSets, err := valueSetSpecs(chat.ContractValueSets())
	if err != nil {
		return contractSpec{}, err
	}
	collector := contractCollector{
		states:         map[reflect.Type]visitState{},
		names:          map[string]reflect.Type{},
		valueSets:      valueSets,
		usedValueNames: map[string]bool{},
	}
	endpoints, err := endpointSpecs(schema.Endpoints, &collector)
	if err != nil {
		return contractSpec{}, err
	}
	errorResponse, err := errorResponseSpec(schema.ErrorResponses, &collector)
	if err != nil {
		return contractSpec{}, err
	}
	events, err := eventSpecs(eventSchema, &collector)
	if err != nil {
		return contractSpec{}, err
	}
	return contractSpec{
		Endpoints:     endpoints,
		ErrorResponse: errorResponse,
		Events:        events,
		Interfaces:    collector.specs,
		ValueSets:     collector.usedValueSets,
	}, nil
}

func valueSetSpecs(registry []chat.ContractValueSet) (map[string]valueSetSpec, error) {
	specs := map[string]valueSetSpec{}
	for _, valueSet := range registry {
		if !isTypeScriptIdentifier(valueSet.Name) || !isUpperASCII(valueSet.Name[0]) {
			return nil, fmt.Errorf("unsupported value set name %s", valueSet.Name)
		}
		if _, exists := specs[valueSet.Name]; exists {
			return nil, fmt.Errorf("duplicate value set %s", valueSet.Name)
		}
		if len(valueSet.Values) == 0 {
			return nil, fmt.Errorf("%s value set is empty", valueSet.Name)
		}
		seenValues := map[string]bool{}
		values := make([]string, 0, len(valueSet.Values))
		for _, value := range valueSet.Values {
			if value == "" {
				return nil, fmt.Errorf("%s value set contains an empty value", valueSet.Name)
			}
			if seenValues[value] {
				return nil, fmt.Errorf("%s value set contains duplicate value %q", valueSet.Name, value)
			}
			seenValues[value] = true
			values = append(values, value)
		}
		specs[valueSet.Name] = valueSetSpec{Name: valueSet.Name, Values: values}
	}
	return specs, nil
}

func endpointSpecs(endpoints []httpapi.ContractEndpoint, collector *contractCollector) ([]endpointSpec, error) {
	names := map[string]bool{}
	routes := map[string]bool{}
	specs := make([]endpointSpec, 0, len(endpoints))
	for index, endpoint := range endpoints {
		spec, err := validateEndpoint(index, endpoint, names, routes)
		if err != nil {
			return nil, err
		}
		if err := collector.add(endpoint.Request); err != nil {
			return nil, fmt.Errorf("%s request: %w", endpoint.Name, err)
		}
		if endpoint.Response != nil {
			if err := collector.add(endpoint.Response); err != nil {
				return nil, fmt.Errorf("%s response: %w", endpoint.Name, err)
			}
		}
		specs = append(specs, spec)
	}
	return specs, nil
}

func validateEndpoint(index int, endpoint httpapi.ContractEndpoint, names map[string]bool, routes map[string]bool) (endpointSpec, error) {
	if endpoint.Name == "" {
		return endpointSpec{}, fmt.Errorf("endpoint %d has empty name", index)
	}
	if !isTypeScriptIdentifier(endpoint.Name) || !isUpperASCII(endpoint.Name[0]) {
		return endpointSpec{}, fmt.Errorf("%s has unsupported endpoint name", endpoint.Name)
	}
	if names[endpoint.Name] {
		return endpointSpec{}, fmt.Errorf("duplicate endpoint name %s", endpoint.Name)
	}
	names[endpoint.Name] = true
	if err := validateRoute(endpoint); err != nil {
		return endpointSpec{}, err
	}
	routeKey := endpoint.Method + " " + endpoint.Path
	if routes[routeKey] {
		return endpointSpec{}, fmt.Errorf("duplicate endpoint route %s", routeKey)
	}
	routes[routeKey] = true
	return endpointSpec{
		Method:        endpoint.Method,
		Name:          endpoint.Name,
		OperationName: lowerCamel(endpoint.Name),
		Path:          endpoint.Path,
		Request:       endpoint.Request,
		Response:      endpoint.Response,
		Streaming:     endpoint.Streaming,
	}, nil
}

func validateRoute(endpoint httpapi.ContractEndpoint) error {
	if err := validateRouteShape(endpoint); err != nil {
		return err
	}
	return validateRouteContract(endpoint)
}

func validateRouteShape(endpoint httpapi.ContractEndpoint) error {
	if endpoint.Method != http.MethodGet && endpoint.Method != http.MethodPost {
		return fmt.Errorf("%s has unsupported method %s", endpoint.Name, endpoint.Method)
	}
	if endpoint.Path == "" || !strings.HasPrefix(endpoint.Path, "/") {
		return fmt.Errorf("%s has unsupported path %s", endpoint.Name, endpoint.Path)
	}
	if strings.ContainsAny(endpoint.Path, " \t\r\n") {
		return fmt.Errorf("%s path contains whitespace: %s", endpoint.Name, endpoint.Path)
	}
	return nil
}

func validateRouteContract(endpoint httpapi.ContractEndpoint) error {
	if endpoint.Method == http.MethodGet && endpoint.Request != nil {
		return fmt.Errorf("%s GET endpoint must not declare a request body", endpoint.Name)
	}
	if endpoint.Method == http.MethodPost && endpoint.Request == nil {
		return fmt.Errorf("%s POST endpoint must declare a request body", endpoint.Name)
	}
	if endpoint.Streaming && endpoint.Response != nil {
		return fmt.Errorf("%s streaming endpoint must not declare a response type", endpoint.Name)
	}
	if !endpoint.Streaming && endpoint.Response == nil {
		return fmt.Errorf("%s has empty response type", endpoint.Name)
	}
	return nil
}

func eventSpecs(schema chat.EventContractSchema, collector *contractCollector) ([]eventSpec, error) {
	names := map[string]bool{}
	types := map[string]bool{}
	specs := make([]eventSpec, 0, len(schema.Events))
	for index, event := range schema.Events {
		spec, err := validateEvent(index, event, names, types)
		if err != nil {
			return nil, err
		}
		if err := collector.add(event.Payload); err != nil {
			return nil, fmt.Errorf("%s payload: %w", event.Name, err)
		}
		specs = append(specs, spec)
	}
	return specs, nil
}

func validateEvent(index int, event chat.EventContract, names map[string]bool, types map[string]bool) (eventSpec, error) {
	if event.Name == "" {
		return eventSpec{}, fmt.Errorf("event %d has empty name", index)
	}
	if !isTypeScriptIdentifier(event.Name) || !isUpperASCII(event.Name[0]) {
		return eventSpec{}, fmt.Errorf("%s has unsupported event name", event.Name)
	}
	if names[event.Name] {
		return eventSpec{}, fmt.Errorf("duplicate event name %s", event.Name)
	}
	names[event.Name] = true
	if event.Type == "" {
		return eventSpec{}, fmt.Errorf("%s has empty event type", event.Name)
	}
	if types[event.Type] {
		return eventSpec{}, fmt.Errorf("duplicate event type %s", event.Type)
	}
	types[event.Type] = true
	if event.Payload == nil || event.Payload.Kind() != reflect.Struct || event.Payload.Name() == "" {
		return eventSpec{}, fmt.Errorf("%s has unsupported payload type %s", event.Name, event.Payload)
	}
	return eventSpec{Name: event.Name, Payload: event.Payload, Type: event.Type}, nil
}

func errorResponseSpec(errorResponses []reflect.Type, collector *contractCollector) (reflect.Type, error) {
	if len(errorResponses) != 1 {
		return nil, fmt.Errorf("expected exactly one error response type, got %d", len(errorResponses))
	}
	errorResponse := errorResponses[0]
	if errorResponse == nil {
		return nil, fmt.Errorf("error response 0 has empty type")
	}
	if errorResponse.Kind() != reflect.Struct || errorResponse.Name() != "ErrorResponse" {
		return nil, fmt.Errorf("error response must be named ErrorResponse, got %s", errorResponse)
	}
	if err := collector.add(errorResponse); err != nil {
		return nil, fmt.Errorf("error response 0: %w", err)
	}
	return errorResponse, nil
}

func (collector *contractCollector) add(goType reflect.Type) error {
	if goType == nil {
		return nil
	}
	switch goType.Kind() {
	case reflect.Bool, reflect.Int:
		return nil
	case reflect.String:
		return collector.addStringAlias(goType)
	case reflect.Slice:
		return collector.add(goType.Elem())
	case reflect.Map:
		return collector.addMap(goType)
	case reflect.Pointer:
		return collector.add(goType.Elem())
	case reflect.Struct:
		return collector.addStruct(goType)
	default:
		return fmt.Errorf("unsupported Go type %s", goType)
	}
}

func (collector *contractCollector) addStringAlias(goType reflect.Type) error {
	if goType.Name() == "" || goType.PkgPath() == "" {
		return nil
	}
	spec, ok := collector.valueSets[goType.Name()]
	if !ok {
		return fmt.Errorf("named string contract type %s has no registered value set", goType)
	}
	if collector.usedValueNames[spec.Name] {
		return nil
	}
	collector.usedValueNames[spec.Name] = true
	collector.usedValueSets = append(collector.usedValueSets, spec)
	return nil
}

func (collector *contractCollector) addMap(goType reflect.Type) error {
	if goType.Key().Kind() != reflect.String || goType.Elem().Kind() != reflect.String {
		return fmt.Errorf("unsupported Go map type %s", goType)
	}
	return nil
}

func (collector *contractCollector) addStruct(goType reflect.Type) error {
	name, err := contractTypeName(goType)
	if err != nil {
		return err
	}
	if err := collector.registerStructName(name, goType); err != nil {
		return err
	}
	if done, err := collector.beginStructVisit(goType); done || err != nil {
		return err
	}
	if err := collector.addStructFields(goType); err != nil {
		return err
	}
	collector.states[goType] = visitDone
	collector.specs = append(collector.specs, interfaceSpec{Name: name, Type: goType})
	return nil
}

func contractTypeName(goType reflect.Type) (string, error) {
	name := goType.Name()
	if name == "" {
		return "", fmt.Errorf("unsupported anonymous Go struct %s", goType)
	}
	if !isTypeScriptIdentifier(name) {
		return "", fmt.Errorf("unsupported contract type name %s", name)
	}
	return name, nil
}

func (collector *contractCollector) registerStructName(name string, goType reflect.Type) error {
	if existing, ok := collector.names[name]; ok && existing != goType {
		return fmt.Errorf("contract name %s is used by both %s and %s", name, existing, goType)
	}
	collector.names[name] = goType
	return nil
}

func (collector *contractCollector) beginStructVisit(goType reflect.Type) (bool, error) {
	switch collector.states[goType] {
	case visitDone:
		return true, nil
	case visitInProgress:
		return false, fmt.Errorf("recursive contract type %s is unsupported", goType)
	default:
		collector.states[goType] = visitInProgress
		return false, nil
	}
}

func (collector *contractCollector) addStructFields(goType reflect.Type) error {
	for index := range goType.NumField() {
		field := goType.Field(index)
		name := jsonName(field)
		if skipContractField(field, name) {
			continue
		}
		if !isTypeScriptIdentifier(name) {
			return fmt.Errorf("%s.%s has unsupported JSON field name %s", goType.Name(), field.Name, name)
		}
		if err := collector.add(field.Type); err != nil {
			return fmt.Errorf("%s.%s: %w", goType.Name(), field.Name, err)
		}
	}
	return nil
}

func skipContractField(field reflect.StructField, jsonName string) bool {
	return field.PkgPath != "" || jsonName == "-"
}

func render(buffer *bytes.Buffer, specs contractSpec) error {
	buffer.WriteString("// Code generated by go run ./cmd/generate-contracts; DO NOT EDIT.\n\n")
	renderRuntimeImports(buffer, specs)
	renderValueSets(buffer, specs.ValueSets)
	if err := renderInterfaces(buffer, specs.Interfaces); err != nil {
		return err
	}
	renderEventUnion(buffer, specs.Events)
	renderEndpointDescriptors(buffer, specs.Endpoints)
	if err := renderDecoders(buffer, specs.Interfaces); err != nil {
		return err
	}
	renderEventDecoders(buffer, specs.Events)
	renderClient(buffer, specs)
	return nil
}

func renderValueSets(buffer *bytes.Buffer, specs []valueSetSpec) {
	for _, spec := range specs {
		fmt.Fprintf(buffer, "export type %s = %s;\n\n", spec.Name, literalUnion(spec.Values))
		fmt.Fprintf(buffer, "export function decode%s(value: unknown, label = %q): %s {\n", spec.Name, spec.Name, spec.Name)
		buffer.WriteString("  const decoded = decodeString(value, label);\n")
		buffer.WriteString("  switch (decoded) {\n")
		for _, value := range spec.Values {
			fmt.Fprintf(buffer, "    case %q:\n", value)
			buffer.WriteString("      return decoded;\n")
		}
		buffer.WriteString("    default:\n")
		buffer.WriteString("      throw new Error(label + \" is unsupported: \" + decoded);\n")
		buffer.WriteString("  }\n")
		buffer.WriteString("}\n\n")
	}
}

func literalUnion(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return strings.Join(quoted, " | ")
}

func renderRuntimeImports(buffer *bytes.Buffer, specs contractSpec) {
	helpers := decoderHelperUsage(specs.Interfaces, specs.Events)
	imports := []string{
		"assertKnownFields",
		"assertRecord",
	}
	if helpers.Array {
		imports = append(imports, "decodeArray")
	}
	if helpers.Boolean {
		imports = append(imports, "decodeBoolean")
	}
	if helpers.Integer {
		imports = append(imports, "decodeInteger")
	}
	if helpers.Map {
		imports = append(imports, "decodeStringRecord")
	}
	if helpers.Nullable {
		imports = append(imports, "decodeNullable")
	}
	if helpers.String {
		imports = append(imports, "decodeString")
	}
	imports = append(imports,
		"requestBackend",
		"requireField",
	)
	buffer.WriteString("import {\n")
	for _, name := range imports {
		fmt.Fprintf(buffer, "  %s,\n", name)
	}
	buffer.WriteString("  type BackendFetch,\n")
	buffer.WriteString("} from \"@shared/backend-runtime\";\n\n")
}

func renderInterfaces(buffer *bytes.Buffer, specs []interfaceSpec) error {
	for _, spec := range specs {
		if spec.Type.Kind() != reflect.Struct {
			return fmt.Errorf("%s must be generated from a struct", spec.Name)
		}
		fmt.Fprintf(buffer, "export interface %s {\n", spec.Name)
		for index := range spec.Type.NumField() {
			field := spec.Type.Field(index)
			name := jsonName(field)
			if field.PkgPath != "" || name == "-" {
				continue
			}
			tsType, err := typeScriptType(field.Type)
			if err != nil {
				return fmt.Errorf("%s.%s: %w", spec.Name, field.Name, err)
			}
			fmt.Fprintf(buffer, "  %s: %s;\n", name, tsType)
		}
		buffer.WriteString("}\n\n")
	}
	return nil
}

func renderEventUnion(buffer *bytes.Buffer, events []eventSpec) {
	if len(events) == 0 {
		return
	}
	buffer.WriteString("export type ChatEvent =\n")
	for index, event := range events {
		prefix := "  | "
		if index == 0 {
			prefix = "  "
		}
		fmt.Fprintf(buffer, "%s%s\n", prefix, event.Name)
	}
	buffer.WriteString(";\n\n")
	for _, event := range events {
		fmt.Fprintf(buffer, "export interface %s {\n", event.Name)
		buffer.WriteString("  schemaVersion: number;\n")
		buffer.WriteString("  streamId: string;\n")
		buffer.WriteString("  sequence: number;\n")
		buffer.WriteString("  eventId: string;\n")
		fmt.Fprintf(buffer, "  type: %q;\n", event.Type)
		buffer.WriteString("  emittedAt: string;\n")
		buffer.WriteString("  workspaceId: string;\n")
		buffer.WriteString("  conversationId: string;\n")
		buffer.WriteString("  runId: string;\n")
		fmt.Fprintf(buffer, "  payload: %s;\n", typeName(event.Payload))
		buffer.WriteString("}\n\n")
	}
}

func renderEndpointDescriptors(buffer *bytes.Buffer, endpoints []endpointSpec) {
	buffer.WriteString("export const backendEndpoints = {\n")
	for _, endpoint := range endpoints {
		fmt.Fprintf(buffer, "  %s: {\n", endpoint.Name)
		fmt.Fprintf(buffer, "    method: %q,\n", endpoint.Method)
		fmt.Fprintf(buffer, "    path: %q,\n", endpoint.Path)
		buffer.WriteString("  },\n")
	}
	buffer.WriteString("} as const;\n\n")
}

func renderDecoders(buffer *bytes.Buffer, specs []interfaceSpec) error {
	for _, spec := range specs {
		if err := renderStructDecoder(buffer, spec); err != nil {
			return err
		}
	}
	return nil
}

func renderEventDecoders(buffer *bytes.Buffer, events []eventSpec) {
	if len(events) == 0 {
		return
	}
	buffer.WriteString("export function decodeChatEvent(value: unknown): ChatEvent {\n")
	buffer.WriteString("  const record = assertRecord(value, \"ChatEvent\");\n")
	buffer.WriteString("  const type = decodeString(requireField(record, \"type\", \"ChatEvent\"), \"ChatEvent.type\");\n")
	buffer.WriteString("  switch (type) {\n")
	for _, event := range events {
		fmt.Fprintf(buffer, "    case %q:\n", event.Type)
		fmt.Fprintf(buffer, "      return decode%sFromRecord(record);\n", event.Name)
	}
	buffer.WriteString("    default:\n")
	buffer.WriteString("      throw new Error(\"ChatEvent.type is unsupported: \" + type);\n")
	buffer.WriteString("  }\n")
	buffer.WriteString("}\n\n")
	for _, event := range events {
		renderEventDecoder(buffer, event)
	}
}

func renderEventDecoder(buffer *bytes.Buffer, event eventSpec) {
	fmt.Fprintf(buffer, "export function decode%s(value: unknown): %s {\n", event.Name, event.Name)
	fmt.Fprintf(buffer, "  return decode%sFromRecord(assertRecord(value, %q));\n", event.Name, event.Name)
	buffer.WriteString("}\n\n")
	fmt.Fprintf(buffer, "function decode%sFromRecord(record: Record<string, unknown>): %s {\n", event.Name, event.Name)
	fmt.Fprintf(buffer, "  assertKnownFields(record, %q, [\"schemaVersion\", \"streamId\", \"sequence\", \"eventId\", \"type\", \"emittedAt\", \"workspaceId\", \"conversationId\", \"runId\", \"payload\"]);\n", event.Name)
	buffer.WriteString("  const type = decodeString(requireField(record, \"type\", ")
	fmt.Fprintf(buffer, "%q), %q);\n", event.Name, event.Name+".type")
	fmt.Fprintf(buffer, "  if (type !== %q) {\n", event.Type)
	fmt.Fprintf(buffer, "    throw new Error(%q + type);\n", event.Name+".type must be "+event.Type+", got ")
	buffer.WriteString("  }\n")
	buffer.WriteString("  return {\n")
	buffer.WriteString("    schemaVersion: decodeInteger(requireField(record, \"schemaVersion\", ")
	fmt.Fprintf(buffer, "%q), %q),\n", event.Name, event.Name+".schemaVersion")
	buffer.WriteString("    streamId: decodeString(requireField(record, \"streamId\", ")
	fmt.Fprintf(buffer, "%q), %q),\n", event.Name, event.Name+".streamId")
	buffer.WriteString("    sequence: decodeInteger(requireField(record, \"sequence\", ")
	fmt.Fprintf(buffer, "%q), %q),\n", event.Name, event.Name+".sequence")
	buffer.WriteString("    eventId: decodeString(requireField(record, \"eventId\", ")
	fmt.Fprintf(buffer, "%q), %q),\n", event.Name, event.Name+".eventId")
	fmt.Fprintf(buffer, "    type: %q,\n", event.Type)
	buffer.WriteString("    emittedAt: decodeString(requireField(record, \"emittedAt\", ")
	fmt.Fprintf(buffer, "%q), %q),\n", event.Name, event.Name+".emittedAt")
	buffer.WriteString("    workspaceId: decodeString(requireField(record, \"workspaceId\", ")
	fmt.Fprintf(buffer, "%q), %q),\n", event.Name, event.Name+".workspaceId")
	buffer.WriteString("    conversationId: decodeString(requireField(record, \"conversationId\", ")
	fmt.Fprintf(buffer, "%q), %q),\n", event.Name, event.Name+".conversationId")
	buffer.WriteString("    runId: decodeString(requireField(record, \"runId\", ")
	fmt.Fprintf(buffer, "%q), %q),\n", event.Name, event.Name+".runId")
	fmt.Fprintf(buffer, "    payload: %s(requireField(record, \"payload\", %q)),\n", decoderFunctionName(event.Payload), event.Name)
	buffer.WriteString("  };\n")
	buffer.WriteString("}\n\n")
}

func renderStructDecoder(buffer *bytes.Buffer, spec interfaceSpec) error {
	fmt.Fprintf(buffer, "export function %s(value: unknown): %s {\n", decoderFunctionName(spec.Type), spec.Name)
	fmt.Fprintf(buffer, "  const record = assertRecord(value, %q);\n", spec.Name)
	fmt.Fprintf(buffer, "  assertKnownFields(record, %q, [%s]);\n", spec.Name, fieldNameLiterals(spec.Type))
	buffer.WriteString("  return {\n")
	for index := range spec.Type.NumField() {
		field := spec.Type.Field(index)
		name := jsonName(field)
		if field.PkgPath != "" || name == "-" {
			continue
		}
		valueExpr := fmt.Sprintf("requireField(record, %q, %q)", name, spec.Name)
		decoded, err := decoderExpression(field.Type, valueExpr, spec.Name+"."+name)
		if err != nil {
			return fmt.Errorf("%s.%s: %w", spec.Name, field.Name, err)
		}
		fmt.Fprintf(buffer, "    %s: %s,\n", name, decoded)
	}
	buffer.WriteString("  };\n")
	buffer.WriteString("}\n\n")
	return nil
}

func decoderHelperUsage(specs []interfaceSpec, events []eventSpec) decoderHelpers {
	var helpers decoderHelpers
	for _, spec := range specs {
		for index := range spec.Type.NumField() {
			field := spec.Type.Field(index)
			if field.PkgPath != "" || jsonName(field) == "-" {
				continue
			}
			markDecoderHelperUsage(field.Type, &helpers)
		}
	}
	if len(events) > 0 {
		helpers.Integer = true
		helpers.String = true
	}
	return helpers
}

func markDecoderHelperUsage(goType reflect.Type, helpers *decoderHelpers) {
	switch goType.Kind() {
	case reflect.Bool:
		helpers.Boolean = true
	case reflect.Int:
		helpers.Integer = true
	case reflect.String:
		helpers.String = true
	case reflect.Slice:
		helpers.Array = true
		markDecoderHelperUsage(goType.Elem(), helpers)
	case reflect.Map:
		helpers.Map = true
	case reflect.Pointer:
		helpers.Nullable = true
		markDecoderHelperUsage(goType.Elem(), helpers)
	}
}

func renderClient(buffer *bytes.Buffer, specs contractSpec) {
	buffer.WriteString("export interface BackendClient {\n")
	for _, endpoint := range specs.Endpoints {
		if endpoint.Streaming {
			continue
		}
		renderClientMethod(buffer, endpoint, true)
	}
	buffer.WriteString("}\n\n")
	buffer.WriteString("export function createBackendClient(baseURL: string, fetchImpl: BackendFetch = fetch): BackendClient {\n")
	buffer.WriteString("  return {\n")
	for _, endpoint := range specs.Endpoints {
		if endpoint.Streaming {
			continue
		}
		renderClientOperation(buffer, endpoint, specs.ErrorResponse)
	}
	buffer.WriteString("  };\n")
	buffer.WriteString("}\n\n")
}

func renderClientMethod(buffer *bytes.Buffer, endpoint endpointSpec, semicolon bool) {
	suffix := ""
	if semicolon {
		suffix = ";"
	}
	if endpoint.Request == nil {
		fmt.Fprintf(buffer, "  %s: () => Promise<%s>%s\n", endpoint.OperationName, typeName(endpoint.Response), suffix)
		return
	}
	fmt.Fprintf(buffer, "  %s: (request: %s) => Promise<%s>%s\n", endpoint.OperationName, typeName(endpoint.Request), typeName(endpoint.Response), suffix)
}

func renderClientOperation(buffer *bytes.Buffer, endpoint endpointSpec, errorResponse reflect.Type) {
	if endpoint.Request == nil {
		fmt.Fprintf(buffer, "    %s: () => requestBackend({\n", endpoint.OperationName)
		renderRequestBackendProperties(buffer, endpoint, errorResponse, "undefined")
		return
	}
	fmt.Fprintf(buffer, "    %s: (request) => requestBackend({\n", endpoint.OperationName)
	renderRequestBackendProperties(buffer, endpoint, errorResponse, "request")
}

func renderRequestBackendProperties(buffer *bytes.Buffer, endpoint endpointSpec, errorResponse reflect.Type, requestPayload string) {
	buffer.WriteString("      baseURL,\n")
	fmt.Fprintf(buffer, "      decodeErrorResponse: %s,\n", decoderFunctionName(errorResponse))
	fmt.Fprintf(buffer, "      decodeResponse: %s,\n", decoderFunctionName(endpoint.Response))
	fmt.Fprintf(buffer, "      endpoint: backendEndpoints.%s,\n", endpoint.Name)
	buffer.WriteString("      fetchImpl,\n")
	fmt.Fprintf(buffer, "      requestPayload: %s,\n", requestPayload)
	buffer.WriteString("    }),\n")
}

func decoderExpression(goType reflect.Type, valueExpr string, label string) (string, error) {
	switch goType.Kind() {
	case reflect.Bool, reflect.Int, reflect.String:
		return scalarDecoderExpression(goType, valueExpr, label), nil
	case reflect.Slice:
		return arrayDecoderExpression(goType, valueExpr, label)
	case reflect.Map:
		return mapDecoderExpression(goType, valueExpr, label)
	case reflect.Pointer:
		return pointerDecoderExpression(goType, valueExpr, label)
	case reflect.Struct:
		return structDecoderExpression(goType, valueExpr), nil
	default:
		return "", fmt.Errorf("unsupported Go type %s", goType)
	}
}

func scalarDecoderExpression(goType reflect.Type, valueExpr string, label string) string {
	switch goType.Kind() {
	case reflect.Bool:
		return fmt.Sprintf("decodeBoolean(%s, %q)", valueExpr, label)
	case reflect.Int:
		return fmt.Sprintf("decodeInteger(%s, %q)", valueExpr, label)
	case reflect.String:
		if goType.Name() != "" && goType.PkgPath() != "" {
			return fmt.Sprintf("%s(%s, %q)", decoderFunctionName(goType), valueExpr, label)
		}
		return fmt.Sprintf("decodeString(%s, %q)", valueExpr, label)
	default:
		panic(fmt.Sprintf("unsupported scalar Go type %s", goType))
	}
}

func arrayDecoderExpression(goType reflect.Type, valueExpr string, label string) (string, error) {
	item, err := decoderExpression(goType.Elem(), "item", label+" item")
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("decodeArray(%s, %q, (item) => %s)", valueExpr, label, item), nil
}

func mapDecoderExpression(goType reflect.Type, valueExpr string, label string) (string, error) {
	if goType.Key().Kind() != reflect.String || goType.Elem().Kind() != reflect.String {
		return "", fmt.Errorf("unsupported Go map type %s", goType)
	}
	return fmt.Sprintf("decodeStringRecord(%s, %q)", valueExpr, label), nil
}

func pointerDecoderExpression(goType reflect.Type, valueExpr string, label string) (string, error) {
	item, err := decoderExpression(goType.Elem(), "item", label)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("decodeNullable(%s, %q, (item) => %s)", valueExpr, label, item), nil
}

func structDecoderExpression(goType reflect.Type, valueExpr string) string {
	return fmt.Sprintf("%s(%s)", decoderFunctionName(goType), valueExpr)
}

func fieldNameLiterals(goType reflect.Type) string {
	names := make([]string, 0, goType.NumField())
	for index := range goType.NumField() {
		field := goType.Field(index)
		name := jsonName(field)
		if field.PkgPath != "" || name == "-" {
			continue
		}
		names = append(names, fmt.Sprintf("%q", name))
	}
	return strings.Join(names, ", ")
}

func jsonName(field reflect.StructField) string {
	tag := field.Tag.Get("json")
	if tag == "" {
		return field.Name
	}
	name, _, _ := strings.Cut(tag, ",")
	if name == "" {
		return field.Name
	}
	return name
}

func typeScriptType(goType reflect.Type) (string, error) {
	switch goType.Kind() {
	case reflect.Bool, reflect.Int, reflect.String:
		return scalarTypeScriptType(goType), nil
	case reflect.Slice:
		return arrayTypeScriptType(goType)
	case reflect.Map:
		return mapTypeScriptType(goType)
	case reflect.Pointer:
		return pointerTypeScriptType(goType)
	case reflect.Struct:
		return structTypeScriptType(goType)
	default:
		return "", fmt.Errorf("unsupported Go type %s", goType)
	}
}

func scalarTypeScriptType(goType reflect.Type) string {
	switch goType.Kind() {
	case reflect.Bool:
		return "boolean"
	case reflect.Int:
		return "number"
	case reflect.String:
		if goType.Name() != "" && goType.PkgPath() != "" {
			return goType.Name()
		}
		return "string"
	default:
		panic(fmt.Sprintf("unsupported scalar Go type %s", goType))
	}
}

func arrayTypeScriptType(goType reflect.Type) (string, error) {
	elementType, err := typeScriptType(goType.Elem())
	if err != nil {
		return "", err
	}
	return elementType + "[]", nil
}

func mapTypeScriptType(goType reflect.Type) (string, error) {
	if goType.Key().Kind() != reflect.String || goType.Elem().Kind() != reflect.String {
		return "", fmt.Errorf("unsupported Go map type %s", goType)
	}
	return "Record<string, string>", nil
}

func pointerTypeScriptType(goType reflect.Type) (string, error) {
	elementType, err := typeScriptType(goType.Elem())
	if err != nil {
		return "", err
	}
	return elementType + " | null", nil
}

func structTypeScriptType(goType reflect.Type) (string, error) {
	if goType.Name() == "" {
		return "", fmt.Errorf("unsupported anonymous Go struct %s", goType)
	}
	return goType.Name(), nil
}

func decoderFunctionName(goType reflect.Type) string {
	return "decode" + typeName(goType)
}

func typeName(goType reflect.Type) string {
	if goType == nil || goType.Name() == "" {
		return ""
	}
	return goType.Name()
}

func lowerCamel(value string) string {
	return strings.ToLower(value[:1]) + value[1:]
}

func isTypeScriptIdentifier(value string) bool {
	if value == "" || !isIdentifierStart(value[0]) {
		return false
	}
	for index := 1; index < len(value); index++ {
		if !isIdentifierContinue(value[index]) {
			return false
		}
	}
	return true
}

func isIdentifierStart(value byte) bool {
	return isUpperASCII(value) || (value >= 'a' && value <= 'z') || value == '_' || value == '$'
}

func isIdentifierContinue(value byte) bool {
	return isIdentifierStart(value) || (value >= '0' && value <= '9')
}

func isUpperASCII(value byte) bool {
	return value >= 'A' && value <= 'Z'
}
