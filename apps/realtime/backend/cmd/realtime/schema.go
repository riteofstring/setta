package main

import (
	"encoding/json"

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
)

type schemaCommand struct {
	Summary   string `json:"summary"`
	Usage     string `json:"usage"`
	Input     string `json:"input,omitempty"`
	Result    string `json:"result"`
	ExitCodes []int  `json:"exitCodes"`
}

type schemaError struct {
	Code        string `json:"code"`
	ExitCode    int    `json:"exitCode"`
	Description string `json:"description"`
}

type schemaOperation struct {
	Name     string          `json:"name"`
	Required []string        `json:"required"`
	Optional []string        `json:"optional"`
	Example  json.RawMessage `json:"example"`
}

type schemaResult struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Fields      []string `json:"fields"`
}

type schemas struct {
	ApplyRequest              map[string]any `json:"applyRequest"`
	ApplyRuntimeSourceRequest map[string]any `json:"applyRuntimeSourceRequest"`
	ApplyRuntimeSourceResult  map[string]any `json:"applyRuntimeSourceResult"`
	ContentReference          map[string]any `json:"contentReference"`
	DirectInvokeRequest       map[string]any `json:"directInvokeRequest"`
	Project                   map[string]any `json:"project"`
	Runtime                   map[string]any `json:"runtime"`
	RuntimeCommand            map[string]any `json:"runtimeCommand"`
	RuntimeSource             map[string]any `json:"runtimeSource"`
	Worker                    map[string]any `json:"worker"`
}

type cliSchemaDocument struct {
	SchemaVersion string                   `json:"schemaVersion"`
	Commands      map[string]schemaCommand `json:"commands"`
	Operations    []schemaOperation        `json:"operations"`
	Inputs        []schemaResult           `json:"inputs"`
	Results       []schemaResult           `json:"results"`
	Errors        []schemaError            `json:"errors"`
	Schemas       schemas                  `json:"schemas"`
}

func schemaDocument() cliSchemaDocument {
	return cliSchemaDocument{
		SchemaVersion: "setta-realtime-schema/v2",
		Commands: map[string]schemaCommand{
			"apply": {
				Summary: "Apply one revision-checked mutation envelope.",
				Usage:   "apply --project-root PATH --file PATH|- [--pretty]", Input: "ApplyRequestV2", Result: "ProjectV2", ExitCodes: []int{0, 1, 2},
			},
			"invoke": {
				Summary: "Reload the current entrypoint and invoke one named handler.",
				Usage:   "invoke --project-root PATH --handler NAME [--file PATH|-] [--pretty]", Input: "DirectInvokeRequestV1", Result: "InvokeResultV2", ExitCodes: []int{0, 1, 2},
			},
			"reload": {
				Summary: "Validate and start the current runtime entrypoint.",
				Usage:   "reload --project-root PATH [--pretty]", Result: "InitializeResultV2", ExitCodes: []int{0, 1, 2},
			},
			"schema": {
				Summary: "Publish this versioned offline command contract.",
				Usage:   "schema [--pretty]", Result: "RealtimeCommandSchemaV2", ExitCodes: []int{0, 1, 2},
			},
			"snapshot": {
				Summary: "Read the canonical project and current runtime status.",
				Usage:   "snapshot --project-root PATH [--pretty]", Result: "RealtimeSnapshotV2", ExitCodes: []int{0, 1, 2},
			},
		},
		Operations: []schemaOperation{
			{Name: "setName", Required: []string{"op", "name"}, Optional: []string{}, Example: json.RawMessage(`{"op":"setName","name":"Counter"}`)},
			{Name: "setRuntime", Required: []string{"op", "runtime"}, Optional: []string{}, Example: json.RawMessage(`{"op":"setRuntime","runtime":{"kind":"python","entrypoint":"app.py"}}`)},
			{Name: "upsertSection", Required: []string{"op", "section", "layout"}, Optional: []string{}, Example: json.RawMessage(`{"op":"upsertSection","section":{"id":"counter","kind":"output","name":"Counter","width":"auto","height":"auto","overflowMode":false,"positionAndSizeLocked":false,"isHorizontalOrientation":false,"styleColor":null,"tagColor":null,"children":[],"data":{"value":0}},"layout":{"x":0,"y":0,"width":null,"height":null,"zIndex":0}}`)},
			{Name: "deleteSection", Required: []string{"op", "sectionId"}, Optional: []string{}, Example: json.RawMessage(`{"op":"deleteSection","sectionId":"counter"}`)},
			{Name: "setBinding", Required: []string{"op", "binding"}, Optional: []string{}, Example: json.RawMessage(`{"op":"setBinding","binding":{"id":"increment","trigger":{"kind":"event","sectionId":"button","event":"press"},"handler":"increment","arguments":{},"scheduling":{"mode":"once","debounceMilliseconds":0,"concurrencyGroup":"default","concurrencyLimit":1},"outputs":{"result":{"target":{"sectionId":"counter","field":"value"}}}}}`)},
			{Name: "deleteBinding", Required: []string{"op", "bindingId"}, Optional: []string{}, Example: json.RawMessage(`{"op":"deleteBinding","bindingId":"increment"}`)},
			{Name: "setConfiguration", Required: []string{"op", "configuration"}, Optional: []string{}, Example: json.RawMessage(`{"op":"setConfiguration","configuration":{}}`)},
			{Name: "setViewport", Required: []string{"op", "viewport"}, Optional: []string{}, Example: json.RawMessage(`{"op":"setViewport","viewport":{"x":0,"y":0,"zoom":1}}`)},
		},
		Inputs: []schemaResult{
			{Name: "ApplyRequestV2", Description: "One project identity, expected revision, and nonempty closed operation sequence.", Fields: []string{"projectId", "expectedRevision", "operations"}},
			{Name: "DirectInvokeRequestV1", Description: "Named JSON arguments and validated content references for one direct invocation.", Fields: []string{"arguments", "content"}},
		},
		Results: []schemaResult{
			{Name: "RealtimeCommandSchemaV2", Description: "The closed offline command, operation, input, result, error, and JSON Schema contract.", Fields: []string{"schemaVersion", "commands", "operations", "inputs", "results", "errors", "schemas"}},
			{Name: "RealtimeSnapshotV2", Description: "One canonical authored project and ephemeral runtime snapshot.", Fields: []string{"project", "runtime"}},
			{Name: "ProjectV2", Description: "The canonical authored project after an accepted mutation.", Fields: []string{"version", "id", "revision", "name", "runtime", "sections", "layout", "bindings", "configuration"}},
			{Name: "InitializeResultV2", Description: "The worker protocol version, runtime kind, handler names, and structured load error.", Fields: []string{"protocolVersion", "runtimeKind", "handlers", "loadError"}},
			{Name: "InvokeResultV2", Description: "The named outputs, emitted update count, and structured handler error from one invocation.", Fields: []string{"outputs", "updateCount", "error"}},
		},
		Errors: []schemaError{
			{Code: "invalid_input", ExitCode: 2, Description: "Command arguments or input failed strict validation."},
			{Code: "runtime_failed", ExitCode: 1, Description: "The coordinator or runtime operation failed."},
		},
		Schemas: schemas{
			ApplyRequest:              contracts.ApplyRequestSchema(),
			ApplyRuntimeSourceRequest: contracts.ApplyRuntimeSourceRequestSchema(),
			ApplyRuntimeSourceResult:  contracts.ApplyRuntimeSourceResultSchema(),
			ContentReference:          contracts.ContentReferenceSchema(),
			DirectInvokeRequest:       contracts.DirectInvokeRequestSchema(),
			Project:                   contracts.ProjectSchema(),
			Runtime:                   contracts.RuntimeSchema(),
			RuntimeCommand:            contracts.RuntimeCommandSchema(),
			RuntimeSource:             contracts.RuntimeSourceDocumentSchema(),
			Worker:                    contracts.WorkerSchema(),
		},
	}
}
