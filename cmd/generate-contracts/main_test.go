package main

import (
	"bytes"
	"reflect"
	"strings"
	"testing"

	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/httpapi"
)

type ContractTestLeaf struct {
	Value string `json:"value"`
}

type ContractTestRequest struct {
	Leaf ContractTestLeaf `json:"leaf"`
}

type ContractTestResponse struct {
	Items  []ContractTestLeaf `json:"items"`
	Labels map[string]string  `json:"labels"`
	Counts map[string]int     `json:"counts"`
	Score  *float64           `json:"score"`
}

type ContractTestError struct {
	Message string `json:"message"`
}

type ErrorResponse struct {
	Error ContractTestError `json:"error"`
}

func TestContractSpecsCollectsEndpointGraph(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{{
			Name:     "ContractTest",
			Method:   "POST",
			Path:     "/contract-test",
			Request:  reflect.TypeFor[ContractTestRequest](),
			Response: reflect.TypeFor[ContractTestResponse](),
		}},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	}, chat.EventContractSchema{})
	if err != nil {
		t.Fatalf("collect contract specs: %v", err)
	}

	got := specNames(specs.Interfaces)
	want := []string{
		"ContractTestLeaf",
		"ContractTestRequest",
		"ContractTestResponse",
		"ContractTestError",
		"ErrorResponse",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("spec names = %#v, want %#v", got, want)
	}
	if specs.Endpoints[0].OperationName != "contractTest" {
		t.Fatalf("operation name = %q, want contractTest", specs.Endpoints[0].OperationName)
	}
}

func TestContractSpecsRejectsDuplicateEndpointNames(t *testing.T) {
	_, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{
			contractEndpoint("ContractTest", "/contract-test"),
			contractEndpoint("ContractTest", "/contract-test-again"),
		},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	}, chat.EventContractSchema{})

	if err == nil {
		t.Fatal("collect contracts succeeded, want duplicate name error")
	}
	if !strings.Contains(err.Error(), "duplicate endpoint name ContractTest") {
		t.Fatalf("error = %q, want duplicate endpoint name", err)
	}
}

func TestContractSpecsRejectsDuplicateEndpointRoutes(t *testing.T) {
	_, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{
			contractEndpoint("ContractTest", "/contract-test"),
			contractEndpoint("ContractTestAgain", "/contract-test"),
		},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	}, chat.EventContractSchema{})

	if err == nil {
		t.Fatal("collect contracts succeeded, want duplicate route error")
	}
	if !strings.Contains(err.Error(), "duplicate endpoint route POST /contract-test") {
		t.Fatalf("error = %q, want duplicate endpoint route", err)
	}
}

func TestContractSpecsCollectEndpointEventAndValueSetSemantics(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{
			contractEndpoint("ContractTest", "/contract-test"),
			{
				Name:     "ContractTestHealth",
				Method:   "GET",
				Path:     "/contract-test/health",
				Response: reflect.TypeFor[ContractTestLeaf](),
			},
			{
				Name:     "ContractTestRun",
				Method:   "GET",
				Path:     "/contract-test/run",
				Response: reflect.TypeFor[chat.Run](),
			},
			{
				Name:     "ContractTestCodexAccount",
				Method:   "GET",
				Path:     "/contract-test/codex-account",
				Response: reflect.TypeFor[codexaccount.CodexAccountState](),
			},
		},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	}, chat.EventContractSchema{
		Events: []chat.EventContract{{
			Name:    "ChatContractTestEvent",
			Type:    "chat.contract_test",
			Payload: reflect.TypeFor[ContractTestResponse](),
		}},
	})
	if err != nil {
		t.Fatalf("collect contracts: %v", err)
	}

	if specs.Endpoints[0].OperationName != "contractTest" ||
		specs.Endpoints[1].OperationName != "contractTestHealth" {
		t.Fatalf("endpoints = %+v, want lower-camel operation names", specs.Endpoints)
	}
	if len(specs.Events) != 1 || specs.Events[0].Type != "chat.contract_test" ||
		specs.Events[0].Payload != reflect.TypeFor[ContractTestResponse]() {
		t.Fatalf("events = %+v, want contract test event payload", specs.Events)
	}
	helpers := decoderHelperUsage(specs.Interfaces, specs.Events)
	if !helpers.Array || !helpers.Integer || !helpers.IntegerMap || !helpers.Map || !helpers.Nullable || !helpers.Number || !helpers.String {
		t.Fatalf("decoder helpers = %+v, want semantic helper usage for test graph", helpers)
	}
	for _, valueSet := range []struct {
		name  string
		value string
	}{
		{name: "RunStatus", value: string(chat.RunStatusCompleted)},
		{name: "ApprovalKind", value: string(chat.ApprovalKindPermission)},
		{name: "CodexAccountStatus", value: string(codexaccount.AccountStatusSignedIn)},
		{name: "CodexLoginType", value: string(codexaccount.LoginTypeChatGPT)},
		{name: "CodexChatGPTPlanType", value: string(codexaccount.ChatGPTPlanPlus)},
	} {
		if !valueSetContains(specs.ValueSets, valueSet.name, valueSet.value) {
			t.Fatalf("value sets = %+v, want %s containing %q", specs.ValueSets, valueSet.name, valueSet.value)
		}
	}
}

func TestRenderProducesGeneratedClientSmoke(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints:      []httpapi.ContractEndpoint{contractEndpoint("ContractTest", "/contract-test")},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	}, chat.EventContractSchema{})
	if err != nil {
		t.Fatalf("collect contracts: %v", err)
	}

	var buffer bytes.Buffer
	if err := render(&buffer, specs); err != nil {
		t.Fatalf("render contracts: %v", err)
	}
	output := buffer.String()
	if !strings.HasPrefix(output, "// Code generated by go run ./cmd/generate-contracts; DO NOT EDIT.") ||
		!strings.Contains(output, "export const backendEndpoints = {") ||
		!strings.Contains(output, "export function createBackendClient(") {
		t.Fatalf("generated output does not look like a generated backend client:\n%s", output)
	}
	for _, runtimeBlock := range []string{
		"function assertRecord",
		"function decodeArray",
		"async function requestBackend",
	} {
		if strings.Contains(output, runtimeBlock) {
			t.Fatalf("generated output contains stable runtime block %q:\n%s", runtimeBlock, output)
		}
	}
}

func specNames(specs []interfaceSpec) []string {
	names := make([]string, 0, len(specs))
	for _, spec := range specs {
		names = append(names, spec.Name)
	}
	return names
}

func valueSetContains(specs []valueSetSpec, name string, value string) bool {
	for _, spec := range specs {
		if spec.Name != name {
			continue
		}
		for _, candidate := range spec.Values {
			if candidate == value {
				return true
			}
		}
	}
	return false
}

func contractEndpoint(name string, path string) httpapi.ContractEndpoint {
	return httpapi.ContractEndpoint{
		Name:     name,
		Method:   "POST",
		Path:     path,
		Request:  reflect.TypeFor[ContractTestRequest](),
		Response: reflect.TypeFor[ContractTestResponse](),
	}
}
