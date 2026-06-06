package settacli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"

	"setta/internal/httpapi"
	"setta/internal/settahttpclient"
)

type apiEndpointsOutput struct {
	Endpoints []apiEndpointOutput `json:"endpoints"`
}

type apiEndpointOutput struct {
	Name           string `json:"name"`
	Method         string `json:"method"`
	Path           string `json:"path"`
	Streaming      bool   `json:"streaming"`
	RequestSchema  string `json:"requestSchema"`
	ResponseSchema string `json:"responseSchema"`
}

type apiSchemaOutput struct {
	Operation      string            `json:"operation"`
	Endpoint       apiEndpointOutput `json:"endpoint"`
	RequestSchema  map[string]any    `json:"requestSchema"`
	ResponseSchema map[string]any    `json:"responseSchema"`
}

func apiEndpointsSpec() CommandSpec {
	return CommandSpec{
		Path:             []string{"api", "endpoints"},
		Summary:          "List backend endpoint operations derived from the Go endpoint registry.",
		Usage:            "setta api endpoints --json",
		OutputSchemaName: "APIEndpoints",
		Examples:         []string{"setta api endpoints --json"},
		handler:          handleAPIEndpoints,
	}
}

func apiSchemaSpec() CommandSpec {
	return CommandSpec{
		Path:             []string{"api", "schema"},
		Summary:          "Print request and response JSON Schemas for a backend operation.",
		Usage:            "setta api schema OPERATION --json",
		RequiredFlags:    []string{"OPERATION"},
		OutputSchemaName: "APISchema",
		Examples:         []string{"setta api schema OpenWorkspace --json"},
		handler:          handleAPISchema,
	}
}

func apiCallSpec() CommandSpec {
	return CommandSpec{
		Path:             []string{"api", "call"},
		Summary:          "Call a backend operation with a raw JSON request body.",
		Usage:            "setta api call OPERATION --input request.json --json",
		Mutates:          true,
		RequiresBackend:  true,
		OutputSchemaName: "CLISuccess",
		OptionalFlags:    []string{"--input"},
		Examples:         []string{"setta api call OpenWorkspace --input request.json --json", "setta api call ListConversations --input - --json"},
		handler:          handleAPICall,
	}
}

func apiStreamSpec() CommandSpec {
	return CommandSpec{
		Path:             []string{"api", "stream"},
		Summary:          "Stream a backend streaming operation as newline-delimited JSON.",
		Usage:            "setta api stream EventStream --cursor STREAM:SEQUENCE --ndjson",
		RequiresBackend:  true,
		SupportsNDJSON:   true,
		OutputSchemaName: "ChatEvent",
		OptionalFlags:    []string{"--cursor", "--limit"},
		Examples:         []string{"setta api stream EventStream --cursor event_stream_1:42 --ndjson"},
		handler:          handleAPIStream,
	}
}

func handleAPIEndpoints(context *Context, args []string) error {
	if len(args) != 0 {
		return invalidError("api endpoints does not accept positional arguments")
	}
	endpoints := make([]apiEndpointOutput, 0, len(settahttpclient.Endpoints()))
	for _, endpoint := range settahttpclient.Endpoints() {
		endpoints = append(endpoints, apiEndpoint(endpoint))
	}
	sort.Slice(endpoints, func(left int, right int) bool {
		return endpoints[left].Name < endpoints[right].Name
	})
	return context.writeCommandData([]string{"api", "endpoints"}, apiEndpointsOutput{Endpoints: endpoints})
}

func handleAPISchema(context *Context, args []string) error {
	if len(args) != 1 {
		return invalidError("api schema requires OPERATION")
	}
	endpoint, ok := endpointByName(args[0])
	if !ok {
		return invalidError("unknown backend operation: " + args[0])
	}
	requestSchema, err := schemaForEndpointType(endpoint.Request)
	if err != nil {
		return err
	}
	responseSchema, err := schemaForEndpointType(endpoint.Response)
	if err != nil {
		return err
	}
	return context.writeCommandData([]string{"api", "schema"}, apiSchemaOutput{
		Endpoint:       apiEndpoint(endpoint),
		Operation:      endpoint.Name,
		RequestSchema:  requestSchema,
		ResponseSchema: responseSchema,
	})
}

func handleAPICall(context *Context, args []string) error {
	endpoint, input, err := parseAPICallArgs(args)
	if err != nil {
		return err
	}
	body, err := apiCallBody(context, endpoint, input)
	if err != nil {
		return err
	}
	return executeAPICall(context, endpoint, body)
}

func parseAPICallArgs(args []string) (httpapi.ContractEndpoint, string, error) {
	flags := newFlagSet("api call")
	input := flags.String("input", "", "request JSON file or - for stdin")
	if err := flags.Parse(args); err != nil {
		return httpapi.ContractEndpoint{}, "", invalidError(err.Error())
	}
	if flags.NArg() != 1 {
		return httpapi.ContractEndpoint{}, "", invalidError("api call requires OPERATION")
	}
	endpoint, ok := endpointByName(flags.Arg(0))
	if !ok {
		return httpapi.ContractEndpoint{}, "", invalidError("unknown backend operation: " + flags.Arg(0))
	}
	if endpoint.Streaming {
		return httpapi.ContractEndpoint{}, "", invalidError("api call cannot call streaming operation " + endpoint.Name)
	}
	return endpoint, *input, nil
}

func apiCallBody(context *Context, endpoint httpapi.ContractEndpoint, input string) ([]byte, error) {
	if endpoint.Request == nil {
		if input != "" {
			return nil, invalidError("api call " + endpoint.Name + " does not accept --input")
		}
		return nil, nil
	}
	if input == "" {
		return nil, invalidError("api call " + endpoint.Name + " requires --input")
	}
	raw, err := readTextFile(context, input)
	if err != nil {
		return nil, err
	}
	body := []byte(raw)
	if err := validateJSON(body); err != nil {
		return nil, err
	}
	return body, nil
}

func executeAPICall(context *Context, endpoint httpapi.ContractEndpoint, body []byte) error {
	client, err := context.client()
	if err != nil {
		return err
	}
	ctx, cancel := context.commandContext()
	defer cancel()
	response, err := client.CallRaw(ctx, endpoint, body)
	if err != nil {
		return err
	}
	var data any
	if err := json.Unmarshal(response, &data); err != nil {
		return fmt.Errorf("decode %s response: %w", endpoint.Name, err)
	}
	return context.writeCommandData([]string{"api", "call"}, data)
}

func handleAPIStream(context *Context, args []string) error {
	flags := newFlagSet("api stream")
	cursor := flags.String("cursor", "", "last event ID cursor")
	ndjson := flags.Bool("ndjson", false, "write newline-delimited JSON")
	limit := flags.Int("limit", 0, "maximum events to read")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 1 {
		return invalidError("api stream requires OPERATION")
	}
	endpoint, ok := endpointByName(flags.Arg(0))
	if !ok {
		return invalidError("unknown backend operation: " + flags.Arg(0))
	}
	if !endpoint.Streaming {
		return invalidError("api stream requires a streaming operation")
	}
	if endpoint.Name != "EventStream" {
		return invalidError("unsupported streaming operation: " + endpoint.Name)
	}
	if !*ndjson {
		return invalidError("api stream requires --ndjson")
	}
	return streamEvents(context, *cursor, *limit)
}

func endpointByName(name string) (httpapi.ContractEndpoint, bool) {
	for _, endpoint := range settahttpclient.Endpoints() {
		if endpoint.Name == name {
			return endpoint, true
		}
	}
	return httpapi.ContractEndpoint{}, false
}

func apiEndpoint(endpoint httpapi.ContractEndpoint) apiEndpointOutput {
	requestName := ""
	if endpoint.Request != nil {
		requestName = endpoint.Request.Name()
	}
	responseName := ""
	if endpoint.Response != nil {
		responseName = endpoint.Response.Name()
	}
	return apiEndpointOutput{
		Method:         endpoint.Method,
		Name:           endpoint.Name,
		Path:           endpoint.Path,
		RequestSchema:  requestName,
		ResponseSchema: responseName,
		Streaming:      endpoint.Streaming,
	}
}

func schemaForEndpointType(schemaType interface{ Name() string }) (map[string]any, error) {
	if schemaType == nil {
		return map[string]any{"type": "null"}, nil
	}
	schema, ok, err := schemaByName(schemaType.Name())
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("schema not found: %s", schemaType.Name())
	}
	return schema, nil
}

func validateJSON(raw []byte) error {
	var decoded any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if err := decoder.Decode(&decoded); err != nil {
		return validationError(fmt.Sprintf("input must be valid JSON: %v", err))
	}
	var extra any
	if err := decoder.Decode(&extra); err == nil {
		return validationError("input must contain exactly one JSON value")
	} else if err != io.EOF {
		return validationError(fmt.Sprintf("input must contain exactly one JSON value: %v", err))
	}
	return nil
}

func endpointRequestSchemaName(operation string) string {
	endpoint, ok := endpointByName(operation)
	if !ok || endpoint.Request == nil || endpoint.Method == http.MethodGet {
		return ""
	}
	return endpoint.Request.Name()
}
