package main

import (
	"reflect"
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

func TestContractSpecsCollectsEndpointGraph(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{{
			Name:     "ContractTest",
			Method:   "POST",
			Path:     "/contract-test",
			Request:  reflect.TypeFor[ContractTestRequest](),
			Response: reflect.TypeFor[ContractTestResponse](),
		}},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ContractTestError]()},
	})
	if err != nil {
		t.Fatalf("collect contract specs: %v", err)
	}

	got := specNames(specs)
	want := []string{
		"ContractTestLeaf",
		"ContractTestRequest",
		"ContractTestResponse",
		"ContractTestError",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("spec names = %#v, want %#v", got, want)
	}
}

func specNames(specs []interfaceSpec) []string {
	names := make([]string, 0, len(specs))
	for _, spec := range specs {
		names = append(names, spec.Name)
	}
	return names
}
