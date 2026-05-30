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

	"setta/internal/httpapi"
)

type contractSpec struct {
	Endpoints     []endpointSpec
	ErrorResponse reflect.Type
	Interfaces    []interfaceSpec
}

type endpointSpec struct {
	Method        string
	Name          string
	OperationName string
	Path          string
	Request       reflect.Type
	Response      reflect.Type
}

type interfaceSpec struct {
	Name string
	Type reflect.Type
}

type decoderHelpers struct {
	Array   bool
	Boolean bool
	Integer bool
	String  bool
}

type contractCollector struct {
	specs  []interfaceSpec
	states map[reflect.Type]visitState
	names  map[string]reflect.Type
}

type visitState int

const (
	visitInProgress visitState = iota + 1
	visitDone
)

func main() {
	output := flag.String("out", "desktop/src/generated/backend.ts", "generated TypeScript output path")
	flag.Parse()

	specs, err := contractSpecs(httpapi.Contracts())
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

func contractSpecs(schema httpapi.ContractSchema) (contractSpec, error) {
	collector := contractCollector{
		states: map[reflect.Type]visitState{},
		names:  map[string]reflect.Type{},
	}
	endpoints, err := endpointSpecs(schema.Endpoints, &collector)
	if err != nil {
		return contractSpec{}, err
	}
	errorResponse, err := errorResponseSpec(schema.ErrorResponses, &collector)
	if err != nil {
		return contractSpec{}, err
	}
	return contractSpec{
		Endpoints:     endpoints,
		ErrorResponse: errorResponse,
		Interfaces:    collector.specs,
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
		if err := collector.add(endpoint.Response); err != nil {
			return nil, fmt.Errorf("%s response: %w", endpoint.Name, err)
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
	}, nil
}

func validateRoute(endpoint httpapi.ContractEndpoint) error {
	if endpoint.Method != http.MethodGet && endpoint.Method != http.MethodPost {
		return fmt.Errorf("%s has unsupported method %s", endpoint.Name, endpoint.Method)
	}
	if endpoint.Path == "" || !strings.HasPrefix(endpoint.Path, "/") {
		return fmt.Errorf("%s has unsupported path %s", endpoint.Name, endpoint.Path)
	}
	if strings.ContainsAny(endpoint.Path, " \t\r\n") {
		return fmt.Errorf("%s path contains whitespace: %s", endpoint.Name, endpoint.Path)
	}
	if endpoint.Method == http.MethodGet && endpoint.Request != nil {
		return fmt.Errorf("%s GET endpoint must not declare a request body", endpoint.Name)
	}
	if endpoint.Method == http.MethodPost && endpoint.Request == nil {
		return fmt.Errorf("%s POST endpoint must declare a request body", endpoint.Name)
	}
	if endpoint.Response == nil {
		return fmt.Errorf("%s has empty response type", endpoint.Name)
	}
	return nil
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
	case reflect.Bool, reflect.Int, reflect.String:
		return nil
	case reflect.Slice:
		return collector.add(goType.Elem())
	case reflect.Struct:
		return collector.addStruct(goType)
	default:
		return fmt.Errorf("unsupported Go type %s", goType)
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

func skipContractField(field reflect.StructField, jsonName string) bool {
	return field.PkgPath != "" || jsonName == "-"
}

func render(buffer *bytes.Buffer, specs contractSpec) error {
	buffer.WriteString("// Code generated by go run ./cmd/generate-contracts; DO NOT EDIT.\n\n")
	if err := renderInterfaces(buffer, specs.Interfaces); err != nil {
		return err
	}
	renderEndpointDescriptors(buffer, specs.Endpoints)
	if err := renderDecoders(buffer, specs.Interfaces); err != nil {
		return err
	}
	renderClient(buffer, specs)
	return nil
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
	renderDecoderHelpers(buffer, decoderHelperUsage(specs))
	return nil
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

func renderDecoderHelpers(buffer *bytes.Buffer, helpers decoderHelpers) {
	buffer.WriteString(`function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

function assertKnownFields(record: Record<string, unknown>, label: string, fields: string[]) {
  for (const field of Object.keys(record)) {
    if (!fields.includes(field)) {
      throw new Error(label + " contains unknown field " + field);
    }
  }
}

function requireField(record: Record<string, unknown>, field: string, label: string): unknown {
  if (!(field in record)) {
    throw new Error(label + "." + field + " is required");
  }
  return record[field];
}

`)
	if helpers.Boolean {
		buffer.WriteString(`function decodeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(label + " must be a boolean");
  }
  return value;
}

`)
	}
	if helpers.Integer {
		buffer.WriteString(`function decodeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(label + " must be an integer");
  }
  return value;
}

`)
	}
	if helpers.String {
		buffer.WriteString(`function decodeString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(label + " must be a string");
  }
  return value;
}

`)
	}
	if helpers.Array {
		buffer.WriteString(`function decodeArray<T>(
  value: unknown,
  label: string,
  decodeItem: (value: unknown) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(label + " must be an array");
  }
  return value.map(decodeItem);
}

`)
	}
}

func decoderHelperUsage(specs []interfaceSpec) decoderHelpers {
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
	}
}

func renderClient(buffer *bytes.Buffer, specs contractSpec) {
	buffer.WriteString("type BackendEndpoint = (typeof backendEndpoints)[keyof typeof backendEndpoints];\n")
	buffer.WriteString("type BackendFetch = (input: URL, init: RequestInit) => Promise<Response>;\n\n")
	buffer.WriteString("export interface BackendClient {\n")
	for _, endpoint := range specs.Endpoints {
		renderClientMethod(buffer, endpoint, true)
	}
	buffer.WriteString("}\n\n")
	buffer.WriteString("export function createBackendClient(baseURL: string, fetchImpl: BackendFetch = fetch): BackendClient {\n")
	buffer.WriteString("  return {\n")
	for _, endpoint := range specs.Endpoints {
		renderClientOperation(buffer, endpoint)
	}
	buffer.WriteString("  };\n")
	buffer.WriteString("}\n\n")
	renderRequestBackend(buffer, specs.ErrorResponse)
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

func renderClientOperation(buffer *bytes.Buffer, endpoint endpointSpec) {
	if endpoint.Request == nil {
		fmt.Fprintf(buffer, "    %s: () => requestBackend(baseURL, backendEndpoints.%s, undefined, %s, fetchImpl),\n", endpoint.OperationName, endpoint.Name, decoderFunctionName(endpoint.Response))
		return
	}
	fmt.Fprintf(buffer, "    %s: (request) => requestBackend(baseURL, backendEndpoints.%s, request, %s, fetchImpl),\n", endpoint.OperationName, endpoint.Name, decoderFunctionName(endpoint.Response))
}

func renderRequestBackend(buffer *bytes.Buffer, errorResponse reflect.Type) {
	fmt.Fprintf(buffer, `async function requestBackend<ResponsePayload>(
  baseURL: string,
  endpoint: BackendEndpoint,
  requestPayload: unknown | undefined,
  decodeResponse: (value: unknown) => ResponsePayload,
  fetchImpl: BackendFetch,
): Promise<ResponsePayload> {
  const init: RequestInit = { method: endpoint.method };
  if (requestPayload !== undefined) {
    init.body = JSON.stringify(requestPayload);
    init.headers = { "Content-Type": "application/json" };
  }

  const response = await fetchImpl(new URL(endpoint.path, baseURL), init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(%s(payload).error.message);
  }
  return decodeResponse(payload);
}
`, decoderFunctionName(errorResponse))
}

func decoderExpression(goType reflect.Type, valueExpr string, label string) (string, error) {
	switch goType.Kind() {
	case reflect.Bool:
		return fmt.Sprintf("decodeBoolean(%s, %q)", valueExpr, label), nil
	case reflect.Int:
		return fmt.Sprintf("decodeInteger(%s, %q)", valueExpr, label), nil
	case reflect.String:
		return fmt.Sprintf("decodeString(%s, %q)", valueExpr, label), nil
	case reflect.Slice:
		item, err := decoderExpression(goType.Elem(), "item", label+" item")
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("decodeArray(%s, %q, (item) => %s)", valueExpr, label, item), nil
	case reflect.Struct:
		return fmt.Sprintf("%s(%s)", decoderFunctionName(goType), valueExpr), nil
	default:
		return "", fmt.Errorf("unsupported Go type %s", goType)
	}
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
	case reflect.Bool:
		return "boolean", nil
	case reflect.Int:
		return "number", nil
	case reflect.String:
		return "string", nil
	case reflect.Slice:
		elementType, err := typeScriptType(goType.Elem())
		if err != nil {
			return "", err
		}
		return elementType + "[]", nil
	case reflect.Struct:
		if goType.Name() == "" {
			return "", fmt.Errorf("unsupported anonymous Go struct %s", goType)
		}
		return goType.Name(), nil
	default:
		return "", fmt.Errorf("unsupported Go type %s", goType)
	}
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
