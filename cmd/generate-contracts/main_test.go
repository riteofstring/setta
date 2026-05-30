package main

import (
	"bytes"
	"reflect"
	"strings"
	"testing"

	"setta/internal/httpapi"
)

type ContractTestLeaf struct {
	Value string `json:"value"`
}

type ContractTestRequest struct {
	Leaf ContractTestLeaf `json:"leaf"`
}

type ContractTestResponse struct {
	Items []ContractTestLeaf `json:"items"`
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
	})
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
	})

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
	})

	if err == nil {
		t.Fatal("collect contracts succeeded, want duplicate route error")
	}
	if !strings.Contains(err.Error(), "duplicate endpoint route POST /contract-test") {
		t.Fatalf("error = %q, want duplicate endpoint route", err)
	}
}

func TestRenderIncludesEndpointDescriptorsDecodersAndClient(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{
			contractEndpoint("ContractTest", "/contract-test"),
			{
				Name:     "ContractTestHealth",
				Method:   "GET",
				Path:     "/contract-test/health",
				Response: reflect.TypeFor[ContractTestLeaf](),
			},
		},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})
	if err != nil {
		t.Fatalf("collect contracts: %v", err)
	}

	var buffer bytes.Buffer
	if err := render(&buffer, specs); err != nil {
		t.Fatalf("render contracts: %v", err)
	}
	output := buffer.String()

	for _, expected := range []string{
		"export const backendEndpoints = {",
		"ContractTest: {",
		"method: \"POST\"",
		"path: \"/contract-test\"",
		"export function decodeContractTestResponse(value: unknown): ContractTestResponse",
		"contractTest: (request: ContractTestRequest) => Promise<ContractTestResponse>;",
		"contractTestHealth: () => Promise<ContractTestLeaf>;",
		"requestBackend(baseURL, backendEndpoints.ContractTest, request, decodeContractTestResponse, fetchImpl)",
		"requestBackend(baseURL, backendEndpoints.ContractTestHealth, undefined, decodeContractTestLeaf, fetchImpl)",
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("generated output missing %q:\n%s", expected, output)
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

func contractEndpoint(name string, path string) httpapi.ContractEndpoint {
	return httpapi.ContractEndpoint{
		Name:     name,
		Method:   "POST",
		Path:     path,
		Request:  reflect.TypeFor[ContractTestRequest](),
		Response: reflect.TypeFor[ContractTestResponse](),
	}
}
