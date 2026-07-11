package main

import (
	"bytes"
	"encoding/json"
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
	Endpoints       []endpointSpec
	ErrorResponse   reflect.Type
	Events          []eventSpec
	Interfaces      []interfaceSpec
	ProtocolVersion int
	SchemaHash      string
	Unions          []unionSpec
	ValueSets       []valueSetSpec
}

type endpointSpec struct {
	Method                string
	Name                  string
	OperationName         string
	Path                  string
	Request               reflect.Type
	Response              reflect.Type
	StreamEvent           reflect.Type
	Streaming             bool
	RequestBodyLimitBytes int64
}

type interfaceSpec struct {
	Name          string
	Type          reflect.Type
	FieldLiterals map[string]string
}

type unionSpec struct {
	Discriminator string
	Name          string
	Type          reflect.Type
	Variants      []unionVariantSpec
}

type unionVariantSpec struct {
	KindValue string
	Name      string
	Type      reflect.Type
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

type contractCollector struct {
	specs          []interfaceSpec
	states         map[reflect.Type]visitState
	names          map[string]reflect.Type
	unionRegistry  map[reflect.Type]unionSpec
	unions         []unionSpec
	usedUnions     map[reflect.Type]bool
	valueSets      map[string]valueSetSpec
	usedValueSets  []valueSetSpec
	usedValueNames map[string]bool
	fieldLiterals  map[reflect.Type]map[string]string
}

type visitState int

const (
	visitInProgress visitState = iota + 1
	visitDone
)

func main() {
	output := flag.String("out", "desktop/src/generated/backend.ts", "generated TypeScript output path")
	protocolSnapshotPath := flag.String("protocol-snapshot", "internal/httpapi/contract_schema_snapshot.json", "generated protocol schema snapshot path")
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
	if err := writeProtocolSnapshot(*protocolSnapshotPath, specs); err != nil {
		fmt.Fprintf(os.Stderr, "write protocol snapshot: %v\n", err)
		os.Exit(1)
	}
}

func contractSpecs(schema httpapi.ContractSchema, eventSchema chat.EventContractSchema) (contractSpec, error) {
	schemaHash, err := httpapi.ContractSchemaHash(schema)
	if err != nil {
		return contractSpec{}, err
	}
	valueSets, err := valueSetSpecs(contractValueSets())
	if err != nil {
		return contractSpec{}, err
	}
	collector := contractCollector{
		states:         map[reflect.Type]visitState{},
		names:          map[string]reflect.Type{},
		unionRegistry:  contractUnions(),
		usedUnions:     map[reflect.Type]bool{},
		valueSets:      valueSets,
		usedValueNames: map[string]bool{},
		fieldLiterals:  map[reflect.Type]map[string]string{},
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
	collector.attachFieldLiterals()
	return contractSpec{
		Endpoints:       endpoints,
		ErrorResponse:   errorResponse,
		Events:          events,
		Interfaces:      collector.specs,
		ProtocolVersion: httpapi.ProtocolVersion,
		SchemaHash:      schemaHash,
		Unions:          collector.unions,
		ValueSets:       collector.usedValueSets,
	}, nil
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
		if endpoint.StreamEvent != nil {
			if err := collector.add(endpoint.StreamEvent); err != nil {
				return nil, fmt.Errorf("%s stream event: %w", endpoint.Name, err)
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
		Method:                endpoint.Method,
		Name:                  endpoint.Name,
		OperationName:         lowerCamel(endpoint.Name),
		Path:                  endpoint.Path,
		Request:               endpoint.Request,
		Response:              endpoint.Response,
		StreamEvent:           endpoint.StreamEvent,
		Streaming:             endpoint.Streaming,
		RequestBodyLimitBytes: endpoint.RequestBodyLimitBytes,
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
	if err := validateRouteRequestContract(endpoint); err != nil {
		return err
	}
	if err := validateRouteStreamContract(endpoint); err != nil {
		return err
	}
	return validateRouteResponseContract(endpoint)
}

func validateRouteRequestContract(endpoint httpapi.ContractEndpoint) error {
	if endpoint.Method == http.MethodGet && endpoint.RequestBodyLimitBytes != 0 {
		return fmt.Errorf("%s GET endpoint must not declare a request body limit", endpoint.Name)
	}
	if endpoint.Method == http.MethodPost && endpoint.Request == nil {
		return fmt.Errorf("%s POST endpoint must declare a request body", endpoint.Name)
	}
	if endpoint.Method == http.MethodPost && endpoint.RequestBodyLimitBytes <= 0 {
		return fmt.Errorf("%s POST endpoint must declare a positive request body limit", endpoint.Name)
	}
	return nil
}

func validateRouteStreamContract(endpoint httpapi.ContractEndpoint) error {
	if endpoint.Streaming && endpoint.Response != nil {
		return fmt.Errorf("%s streaming endpoint must not declare a response type", endpoint.Name)
	}
	if !endpoint.Streaming && endpoint.StreamEvent != nil {
		return fmt.Errorf("%s non-streaming endpoint must not declare a stream event type", endpoint.Name)
	}
	if endpoint.Streaming && endpoint.StreamEvent != nil {
		if endpoint.StreamEvent.Kind() != reflect.Struct || endpoint.StreamEvent.Name() == "" {
			return fmt.Errorf("%s has unsupported stream event type %s", endpoint.Name, endpoint.StreamEvent)
		}
	}
	return nil
}

func validateRouteResponseContract(endpoint httpapi.ContractEndpoint) error {
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
	if isJSONRawMessage(goType) {
		return nil
	}
	if _, ok := collector.unionRegistry[goType]; ok {
		return collector.addUnion(goType)
	}
	switch goType.Kind() {
	case reflect.Bool, reflect.Float32, reflect.Float64, reflect.Int:
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
	case reflect.Interface:
		return collector.addUnion(goType)
	default:
		return fmt.Errorf("unsupported Go type %s (kind %s, name %q, package %q)", goType, goType.Kind(), goType.Name(), goType.PkgPath())
	}
}

func (collector *contractCollector) addUnion(goType reflect.Type) error {
	spec, ok := collector.unionRegistry[goType]
	if !ok {
		return fmt.Errorf("unsupported Go interface contract type %s", goType)
	}
	if err := collector.registerStructName(spec.Name, goType); err != nil {
		return err
	}
	if collector.usedUnions[goType] {
		return nil
	}
	collector.usedUnions[goType] = true
	for _, variant := range spec.Variants {
		if err := collector.registerUnionVariantDiscriminator(spec, variant); err != nil {
			return err
		}
		if err := collector.add(variant.Type); err != nil {
			return fmt.Errorf("%s.%s variant: %w", spec.Name, variant.Name, err)
		}
	}
	collector.unions = append(collector.unions, spec)
	return nil
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
	if goType.Key().Kind() != reflect.String {
		return fmt.Errorf("unsupported Go map type %s", goType)
	}
	switch goType.Elem().Kind() {
	case reflect.Int, reflect.String:
		return nil
	default:
		return fmt.Errorf("unsupported Go map type %s", goType)
	}
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

func render(buffer *bytes.Buffer, specs contractSpec) error {
	buffer.WriteString("// Code generated by go run ./cmd/generate-contracts; DO NOT EDIT.\n\n")
	renderRuntimeImports(buffer, specs)
	renderProtocolMetadata(buffer, specs)
	renderValueSets(buffer, specs.ValueSets)
	renderContractLiteralDecoder(buffer, specs.Interfaces)
	if err := renderInterfaces(buffer, specs.Interfaces); err != nil {
		return err
	}
	renderUnions(buffer, specs.Unions)
	renderEventUnion(buffer, specs.Events)
	renderEndpointDescriptors(buffer, specs.Endpoints)
	if err := renderDecoders(buffer, specs.Interfaces); err != nil {
		return err
	}
	renderUnionDecoders(buffer, specs.Unions)
	renderEventDecoders(buffer, specs.Events)
	renderClient(buffer, specs)
	return nil
}

func renderProtocolMetadata(buffer *bytes.Buffer, specs contractSpec) {
	fmt.Fprintf(buffer, "export const backendProtocolVersion = %d;\n", specs.ProtocolVersion)
	fmt.Fprintf(buffer, "export const backendContractSchemaHash = %q;\n\n", specs.SchemaHash)
}

func renderValueSets(buffer *bytes.Buffer, specs []valueSetSpec) {
	for _, spec := range specs {
		fmt.Fprintf(buffer, "export type %s = %s;\n\n", spec.Name, literalUnion(spec.Values))
		fmt.Fprintf(buffer, "export const %sValues = [%s] as const satisfies readonly %s[];\n\n", lowerCamel(spec.Name), literalList(spec.Values), spec.Name)
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

func literalList(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return strings.Join(quoted, ", ")
}

func literalUnion(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return strings.Join(quoted, " | ")
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
			tsType := ""
			if literal, ok := spec.FieldLiterals[name]; ok {
				tsType = fmt.Sprintf("%q", literal)
			} else {
				var err error
				tsType, err = typeScriptType(field.Type)
				if err != nil {
					return fmt.Errorf("%s.%s: %w", spec.Name, field.Name, err)
				}
			}
			fmt.Fprintf(buffer, "  %s: %s;\n", name, tsType)
		}
		buffer.WriteString("}\n\n")
	}
	return nil
}

func renderUnions(buffer *bytes.Buffer, specs []unionSpec) {
	for _, spec := range specs {
		fmt.Fprintf(buffer, "export type %s =\n", spec.Name)
		for index, variant := range spec.Variants {
			prefix := "  | "
			if index == 0 {
				prefix = "  "
			}
			fmt.Fprintf(buffer, "%s%s\n", prefix, variant.Name)
		}
		buffer.WriteString(";\n\n")
	}
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

func renderDecoders(buffer *bytes.Buffer, specs []interfaceSpec) error {
	for _, spec := range specs {
		if err := renderStructDecoder(buffer, spec); err != nil {
			return err
		}
	}
	return nil
}

func renderUnionDecoders(buffer *bytes.Buffer, specs []unionSpec) {
	for _, spec := range specs {
		fmt.Fprintf(buffer, "export function %s(value: unknown): %s {\n", decoderFunctionName(spec.Type), spec.Name)
		fmt.Fprintf(buffer, "  const record = assertRecord(value, %q);\n", spec.Name)
		fmt.Fprintf(buffer, "  const discriminator = decodeString(requireField(record, %q, %q), %q);\n", spec.Discriminator, spec.Name, spec.Name+"."+spec.Discriminator)
		buffer.WriteString("  switch (discriminator) {\n")
		for _, variant := range spec.Variants {
			fmt.Fprintf(buffer, "    case %q:\n", variant.KindValue)
			fmt.Fprintf(buffer, "      return %s(value);\n", decoderFunctionName(variant.Type))
		}
		buffer.WriteString("    default:\n")
		fmt.Fprintf(buffer, "      throw new Error(%q + \" is unsupported: \" + discriminator);\n", spec.Name+"."+spec.Discriminator)
		buffer.WriteString("  }\n")
		buffer.WriteString("}\n\n")
	}
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
	fmt.Fprintf(buffer, "  const base = decodeBackendEventBase(record, %q, %q);\n", event.Name, event.Type)
	buffer.WriteString("  return {\n")
	buffer.WriteString("    ...base,\n")
	fmt.Fprintf(buffer, "    payload: %s(requireField(record, \"payload\", %q)),\n", decoderFunctionName(event.Payload), event.Name)
	buffer.WriteString("  };\n")
	buffer.WriteString("}\n\n")
}

func renderStructDecoder(buffer *bytes.Buffer, spec interfaceSpec) error {
	fmt.Fprintf(buffer, "export function %s(value: unknown): %s {\n", decoderFunctionName(spec.Type), spec.Name)
	fmt.Fprintf(buffer, "  const record = assertRecord(value, %q);\n", spec.Name)
	fmt.Fprintf(buffer, "  assertKnownFields(record, %q, [%s]);\n", spec.Name, fieldNameLiterals(spec.Type))
	taggedUnion, isTagged := contractTaggedUnionForType(spec.Type)
	if !isTagged {
		buffer.WriteString("  return {\n")
		if err := renderStructDecoderFields(buffer, spec); err != nil {
			return err
		}
		buffer.WriteString("  };\n}\n\n")
		return nil
	}
	fmt.Fprintf(buffer, "  const result: %s = {\n", spec.Name)
	if err := renderStructDecoderFields(buffer, spec); err != nil {
		return err
	}
	buffer.WriteString("  };\n")
	renderTaggedUnionAssertion(buffer, spec.Name, taggedUnion)
	buffer.WriteString("  return result;\n}\n\n")
	return nil
}

func renderStructDecoderFields(buffer *bytes.Buffer, spec interfaceSpec) error {
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
		if literal, ok := spec.FieldLiterals[name]; ok {
			decoded = fmt.Sprintf("decodeContractLiteral(%s, %q, %q)", decoded, literal, spec.Name+"."+name)
		}
		fmt.Fprintf(buffer, "    %s: %s,\n", name, decoded)
	}
	return nil
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
		fmt.Fprintf(buffer, "  %s: (options?: BackendRequestOptions) => Promise<%s>%s\n", endpoint.OperationName, typeName(endpoint.Response), suffix)
		return
	}
	fmt.Fprintf(buffer, "  %s: (request: %s, options?: BackendRequestOptions) => Promise<%s>%s\n", endpoint.OperationName, typeName(endpoint.Request), typeName(endpoint.Response), suffix)
}

func renderClientOperation(buffer *bytes.Buffer, endpoint endpointSpec, errorResponse reflect.Type) {
	if endpoint.Request == nil {
		fmt.Fprintf(buffer, "    %s: (options) => requestBackend({\n", endpoint.OperationName)
		renderRequestBackendProperties(buffer, endpoint, errorResponse, "undefined")
		return
	}
	fmt.Fprintf(buffer, "    %s: (request, options) => requestBackend({\n", endpoint.OperationName)
	renderRequestBackendProperties(buffer, endpoint, errorResponse, "request")
}

func renderRequestBackendProperties(buffer *bytes.Buffer, endpoint endpointSpec, errorResponse reflect.Type, requestPayload string) {
	buffer.WriteString("      baseURL,\n")
	fmt.Fprintf(buffer, "      decodeErrorResponse: %s,\n", decoderFunctionName(errorResponse))
	fmt.Fprintf(buffer, "      decodeResponse: %s,\n", decoderFunctionName(endpoint.Response))
	fmt.Fprintf(buffer, "      endpoint: backendEndpoints.%s,\n", endpoint.Name)
	buffer.WriteString("      fetchImpl,\n")
	fmt.Fprintf(buffer, "      requestPayload: %s,\n", requestPayload)
	buffer.WriteString("      signal: options?.signal,\n")
	buffer.WriteString("    }),\n")
}

func decoderExpression(goType reflect.Type, valueExpr string, label string) (string, error) {
	if isJSONRawMessage(goType) {
		return fmt.Sprintf("decodeUnknown(%s, %q)", valueExpr, label), nil
	}
	if _, ok := contractUnionForType(goType); ok {
		return unionDecoderExpression(goType, valueExpr)
	}
	switch goType.Kind() {
	case reflect.Bool, reflect.Float32, reflect.Float64, reflect.Int, reflect.String:
		return scalarDecoderExpression(goType, valueExpr, label), nil
	case reflect.Slice:
		return arrayDecoderExpression(goType, valueExpr, label)
	case reflect.Map:
		return mapDecoderExpression(goType, valueExpr, label)
	case reflect.Pointer:
		return pointerDecoderExpression(goType, valueExpr, label)
	case reflect.Struct:
		return structDecoderExpression(goType, valueExpr), nil
	case reflect.Interface:
		return unionDecoderExpression(goType, valueExpr)
	default:
		return "", fmt.Errorf("unsupported Go type %s (kind %s, name %q, package %q)", goType, goType.Kind(), goType.Name(), goType.PkgPath())
	}
}

func scalarDecoderExpression(goType reflect.Type, valueExpr string, label string) string {
	switch goType.Kind() {
	case reflect.Bool:
		return fmt.Sprintf("decodeBoolean(%s, %q)", valueExpr, label)
	case reflect.Float32, reflect.Float64:
		return fmt.Sprintf("decodeNumber(%s, %q)", valueExpr, label)
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
	if goType.Key().Kind() != reflect.String {
		return "", fmt.Errorf("unsupported Go map type %s", goType)
	}
	switch goType.Elem().Kind() {
	case reflect.Int:
		return fmt.Sprintf("decodeIntegerRecord(%s, %q)", valueExpr, label), nil
	case reflect.String:
		return fmt.Sprintf("decodeStringRecord(%s, %q)", valueExpr, label), nil
	default:
		return "", fmt.Errorf("unsupported Go map type %s", goType)
	}
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

func unionDecoderExpression(goType reflect.Type, valueExpr string) (string, error) {
	if _, ok := contractUnionForType(goType); !ok {
		return "", fmt.Errorf("unsupported Go interface contract type %s", goType)
	}
	return fmt.Sprintf("%s(%s)", decoderFunctionName(goType), valueExpr), nil
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
	if isJSONRawMessage(goType) {
		return "unknown", nil
	}
	if _, ok := contractUnionForType(goType); ok {
		return unionTypeScriptType(goType)
	}
	switch goType.Kind() {
	case reflect.Bool, reflect.Float32, reflect.Float64, reflect.Int, reflect.String:
		return scalarTypeScriptType(goType), nil
	case reflect.Slice:
		return arrayTypeScriptType(goType)
	case reflect.Map:
		return mapTypeScriptType(goType)
	case reflect.Pointer:
		return pointerTypeScriptType(goType)
	case reflect.Struct:
		return structTypeScriptType(goType)
	case reflect.Interface:
		return unionTypeScriptType(goType)
	default:
		return "", fmt.Errorf("unsupported Go type %s (kind %s, name %q, package %q)", goType, goType.Kind(), goType.Name(), goType.PkgPath())
	}
}

func scalarTypeScriptType(goType reflect.Type) string {
	switch goType.Kind() {
	case reflect.Bool:
		return "boolean"
	case reflect.Float32, reflect.Float64:
		return "number"
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
	if goType.Key().Kind() != reflect.String {
		return "", fmt.Errorf("unsupported Go map type %s", goType)
	}
	switch goType.Elem().Kind() {
	case reflect.Int:
		return "Record<string, number>", nil
	case reflect.String:
		return "Record<string, string>", nil
	default:
		return "", fmt.Errorf("unsupported Go map type %s", goType)
	}
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

func unionTypeScriptType(goType reflect.Type) (string, error) {
	spec, ok := contractUnionForType(goType)
	if !ok {
		return "", fmt.Errorf("unsupported Go interface contract type %s", goType)
	}
	return spec.Name, nil
}

func contractUnionForType(goType reflect.Type) (unionSpec, bool) {
	spec, ok := contractUnions()[goType]
	return spec, ok
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

func isJSONRawMessage(goType reflect.Type) bool {
	return goType == reflect.TypeFor[json.RawMessage]()
}
