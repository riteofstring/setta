// Package cli provides the machine-readable Python Canvas command line API.
package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"unicode/utf8"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

const cliContractVersion = "v2"

// operation is deliberately closed by operationRegistry. It is decoded before
// the CLI contacts the service, then bound to the current canonical snapshot.
type operation interface {
	mutation(contracts.ProjectSnapshotV2) (mutation, error)
}

type mutation struct {
	path string
	body any
}

type operationDefinition struct {
	name           string
	fields         []fieldSchema
	optionalFields []fieldSchema
	example        json.RawMessage
	decode         func(map[string]json.RawMessage) (operation, error)
}

type fieldSchema struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Reference   string   `json:"reference,omitempty"`
	Description string   `json:"description,omitempty"`
	Values      []string `json:"values,omitempty"`
}

type schemaDocument struct {
	Version      string            `json:"version"`
	Commands     []commandSchema   `json:"commands"`
	Operations   []operationSchema `json:"operations"`
	Results      []resultSchema    `json:"results"`
	Errors       []errorSchema     `json:"errors"`
	V2Vocabulary []vocabularyShape `json:"v2Vocabulary"`
}

// commandSchema describes the public Setta Python Canvas grammar. The Setta
// adapter resolves --project to a verified live session before invoking this
// private native command with its --url escape hatch.
type commandSchema struct {
	Name      string           `json:"name"`
	Summary   string           `json:"summary"`
	Usage     string           `json:"usage"`
	Selectors []fieldSchema    `json:"selectors,omitempty"`
	Options   []fieldSchema    `json:"options,omitempty"`
	Result    string           `json:"result"`
	ExitCodes []exitCodeSchema `json:"exitCodes"`
}

type exitCodeSchema struct {
	Code        int    `json:"code"`
	Description string `json:"description"`
}

type resultSchema struct {
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Fields      []fieldSchema `json:"fields"`
}

type errorSchema struct {
	Code        string `json:"code"`
	ExitCode    int    `json:"exitCode"`
	Description string `json:"description"`
}

type operationSchema struct {
	Name     string          `json:"name"`
	Required []string        `json:"required"`
	Optional []string        `json:"optional"`
	Fields   []fieldSchema   `json:"fields"`
	Example  json.RawMessage `json:"example"`
}

type vocabularyShape struct {
	Name            string                    `json:"name"`
	Description     string                    `json:"description"`
	Fields          []fieldSchema             `json:"fields"`
	DefaultExamples []contracts.ParameterUIV2 `json:"defaultExamples,omitempty"`
}

// operationRegistry is the one authoritative inventory for decoding, schema
// publication, and V2 route/request selection.
var operationRegistry = []operationDefinition{
	{
		name:    "project.rename",
		fields:  []fieldSchema{{Name: "name", Type: "string", Description: "New project display name."}},
		example: json.RawMessage(`{"operation":"project.rename","name":"Renamed project"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			name, err := requiredString(fields, "name")
			return projectRenameOperation{name: name}, err
		},
	},
	{
		name:    "callable.create",
		fields:  []fieldSchema{{Name: "name", Type: "string", Description: "Callable display name."}},
		example: json.RawMessage(`{"operation":"callable.create","name":"math.sqrt"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			name, err := requiredString(fields, "name")
			return callableCreateOperation{name: name}, err
		},
	},
	{
		name: "callable.createConfigured",
		fields: []fieldSchema{
			{Name: "name", Type: "string", Description: "Callable display name."},
			{Name: "authoredExpression", Type: "string", Description: "Callable expression resolved for its provider-owned signature."},
		},
		optionalFields: []fieldSchema{{Name: "parameterValues", Type: "object", Description: "Authored expressions keyed by exact provider parameter name."}},
		example:        json.RawMessage(`{"operation":"callable.createConfigured","name":"Ceiling","authoredExpression":"math.ceil","parameterValues":{"x":"7.25"}}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			name, err := requiredString(fields, "name")
			if err != nil {
				return nil, err
			}
			expression, err := requiredString(fields, "authoredExpression")
			if err != nil {
				return nil, err
			}
			parameterValues := map[string]string{}
			if _, err := optionalStrictField(fields, "parameterValues", &parameterValues); err != nil {
				return nil, err
			}
			return callableCreateConfiguredOperation{name: name, expression: expression, parameterValues: parameterValues}, nil
		},
	},
	{
		name: "callable.rename",
		fields: []fieldSchema{
			{Name: "callableId", Type: "string", Description: "Existing callable stable ID."},
			{Name: "name", Type: "string", Description: "New callable display name."},
		},
		example: json.RawMessage(`{"operation":"callable.rename","callableId":"callable:example","name":"math.cos"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "callableId")
			if err != nil {
				return nil, err
			}
			name, err := requiredString(fields, "name")
			return callableRenameOperation{id: id, name: name}, err
		},
	},
	{
		name:    "callable.delete",
		fields:  []fieldSchema{{Name: "callableId", Type: "string", Description: "Existing callable stable ID."}},
		example: json.RawMessage(`{"operation":"callable.delete","callableId":"callable:example"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "callableId")
			return callableDeleteOperation{id: id}, err
		},
	},
	{
		name: "callable.commit",
		fields: []fieldSchema{
			{Name: "callableId", Type: "string", Description: "Existing callable stable ID."},
			{Name: "authoredExpression", Type: "string", Description: "Complete callable expression."},
		},
		example: json.RawMessage(`{"operation":"callable.commit","callableId":"callable:example","authoredExpression":"math.sqrt"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "callableId")
			if err != nil {
				return nil, err
			}
			expression, err := requiredString(fields, "authoredExpression")
			return callableCommitOperation{id: id, expression: expression}, err
		},
	},
	{
		name:    "callable.parameters.refresh",
		fields:  []fieldSchema{{Name: "callableId", Type: "string", Description: "Existing callable stable ID."}},
		example: json.RawMessage(`{"operation":"callable.parameters.refresh","callableId":"callable:example"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "callableId")
			return callableRefreshParametersOperation{id: id}, err
		},
	},
	{
		name: "callable.parameters.set",
		fields: []fieldSchema{
			{Name: "callableId", Type: "string", Description: "Existing callable stable ID."},
			{Name: "parameters", Type: "array", Reference: "ParameterProposalV2", Description: "Complete parameter proposals."},
		},
		example: json.RawMessage(`{"operation":"callable.parameters.set","callableId":"callable:example","parameters":[{"id":"parameter:scale","name":"scale","authoredExpression":"1","ui":{"type":"CodeParam","configuration":{"disabled":false,"language":"python","placeholder":null,"singleLine":true,"wrapLines":true}}}]}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "callableId")
			if err != nil {
				return nil, err
			}
			var parameters []contracts.ParameterProposalV2
			if err := requiredStrictField(fields, "parameters", &parameters); err != nil {
				return nil, err
			}
			return callableSetParametersOperation{id: id, parameters: parameters}, nil
		},
	},
	{
		name:    "parameterDictionary.create",
		fields:  []fieldSchema{{Name: "name", Type: "string", Description: "Parameter Dictionary display name."}},
		example: json.RawMessage(`{"operation":"parameterDictionary.create","name":"Options"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			name, err := requiredString(fields, "name")
			return parameterDictionaryCreateOperation{name: name}, err
		},
	},
	{
		name: "parameterDictionary.rename",
		fields: []fieldSchema{
			{Name: "dictionaryId", Type: "string", Description: "Existing Parameter Dictionary stable ID."},
			{Name: "name", Type: "string", Description: "New Parameter Dictionary display name."},
		},
		example: json.RawMessage(`{"operation":"parameterDictionary.rename","dictionaryId":"dictionary:example","name":"Settings"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "dictionaryId")
			if err != nil {
				return nil, err
			}
			name, err := requiredString(fields, "name")
			return parameterDictionaryRenameOperation{id: id, name: name}, err
		},
	},
	{
		name:    "parameterDictionary.delete",
		fields:  []fieldSchema{{Name: "dictionaryId", Type: "string", Description: "Existing Parameter Dictionary stable ID."}},
		example: json.RawMessage(`{"operation":"parameterDictionary.delete","dictionaryId":"dictionary:example"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "dictionaryId")
			return parameterDictionaryDeleteOperation{id: id}, err
		},
	},
	{
		name: "parameterDictionary.entries.set",
		fields: []fieldSchema{
			{Name: "dictionaryId", Type: "string", Description: "Existing Parameter Dictionary stable ID."},
			{Name: "entries", Type: "array", Reference: "DictionaryEntryV2", Description: "Complete recursive dictionary entries."},
		},
		example: json.RawMessage(`{"operation":"parameterDictionary.entries.set","dictionaryId":"dictionary:example","entries":[{"kind":"leaf","id":"entry:radius","name":"radius","ui":{"type":"CodeParam","configuration":{"disabled":false,"language":"python","placeholder":null,"singleLine":true,"wrapLines":true}},"authoredExpression":"4"}]}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "dictionaryId")
			if err != nil {
				return nil, err
			}
			var entries []contracts.DictionaryEntryV2
			if err := requiredStrictField(fields, "entries", &entries); err != nil {
				return nil, err
			}
			return parameterDictionarySetEntriesOperation{id: id, entries: entries}, nil
		},
	},
	{
		name:    "list.create",
		fields:  []fieldSchema{{Name: "name", Type: "string", Description: "List of Objects display name."}},
		example: json.RawMessage(`{"operation":"list.create","name":"Objects"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			name, err := requiredString(fields, "name")
			return listCreateOperation{name: name}, err
		},
	},
	{
		name: "list.rename",
		fields: []fieldSchema{
			{Name: "listId", Type: "string", Description: "Existing List of Objects stable ID."},
			{Name: "name", Type: "string", Description: "New List of Objects display name."},
		},
		example: json.RawMessage(`{"operation":"list.rename","listId":"list:example","name":"Shapes"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "listId")
			if err != nil {
				return nil, err
			}
			name, err := requiredString(fields, "name")
			return listRenameOperation{id: id, name: name}, err
		},
	},
	{
		name:    "list.delete",
		fields:  []fieldSchema{{Name: "listId", Type: "string", Description: "Existing List of Objects stable ID."}},
		example: json.RawMessage(`{"operation":"list.delete","listId":"list:example"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "listId")
			return listDeleteOperation{id: id}, err
		},
	},
	{
		name: "list.children.increment",
		fields: []fieldSchema{
			{Name: "listId", Type: "string", Description: "Existing List of Objects stable ID."},
			{Name: "count", Type: "integer", Description: "Positive number of children to add."},
		},
		example: json.RawMessage(`{"operation":"list.children.increment","listId":"list:example","count":1}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "listId")
			if err != nil {
				return nil, err
			}
			count, err := requiredInt(fields, "count")
			return listIncrementOperation{id: id, count: count}, err
		},
	},
	{
		name: "list.children.decrement",
		fields: []fieldSchema{
			{Name: "listId", Type: "string", Description: "Existing List of Objects stable ID."},
			{Name: "count", Type: "integer", Description: "Positive number of children to remove."},
		},
		example: json.RawMessage(`{"operation":"list.children.decrement","listId":"list:example","count":1}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			id, err := requiredString(fields, "listId")
			if err != nil {
				return nil, err
			}
			count, err := requiredInt(fields, "count")
			return listDecrementOperation{id: id, count: count}, err
		},
	},
	{
		name: "forest.replace",
		fields: []fieldSchema{
			{Name: "topLevelSectionIds", Type: "array", Description: "Complete ordered top-level section IDs."},
			{Name: "listChildren", Type: "array", Reference: "ListChildrenV2", Description: "Complete child placement for each list."},
		},
		example: json.RawMessage(`{"operation":"forest.replace","topLevelSectionIds":[],"listChildren":[]}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			var topLevel []string
			if err := requiredStrictField(fields, "topLevelSectionIds", &topLevel); err != nil {
				return nil, err
			}
			var children []contracts.ListChildrenV2
			if err := requiredStrictField(fields, "listChildren", &children); err != nil {
				return nil, err
			}
			return forestReplaceOperation{topLevel: topLevel, listChildren: children}, nil
		},
	},
	{
		name: "pythonTarget.set",
		fields: []fieldSchema{
			{Name: "prefix", Type: "string", Description: "Complete generated Python prefix."},
			{Name: "suffix", Type: "string", Description: "Complete generated Python suffix."},
		},
		example: json.RawMessage(`{"operation":"pythonTarget.set","prefix":"import math","suffix":"state = SettaState()"}`),
		decode: func(fields map[string]json.RawMessage) (operation, error) {
			prefix, err := requiredString(fields, "prefix")
			if err != nil {
				return nil, err
			}
			suffix, err := requiredString(fields, "suffix")
			return pythonTargetSetOperation{prefix: prefix, suffix: suffix}, err
		},
	},
}

func schema() (schemaDocument, error) {
	operations := make([]operationSchema, 0, len(operationRegistry))
	for _, definition := range operationRegistry {
		required := make([]string, 0, len(definition.fields)+1)
		required = append(required, "operation")
		for _, field := range definition.fields {
			required = append(required, field.Name)
		}
		optional := make([]string, 0, len(definition.optionalFields))
		fields := make([]fieldSchema, 0, len(definition.fields)+len(definition.optionalFields))
		fields = append(fields, definition.fields...)
		for _, field := range definition.optionalFields {
			optional = append(optional, field.Name)
			fields = append(fields, field)
		}
		operations = append(operations, operationSchema{
			Name:     definition.name,
			Required: required,
			Optional: optional,
			Fields:   fields,
			Example:  append(json.RawMessage(nil), definition.example...),
		})
	}
	uiTypes := contracts.ParameterUITypesV2()
	uiTypeValues := make([]string, 0, len(uiTypes))
	uiDefaults := make([]contracts.ParameterUIV2, 0, len(uiTypes))
	for _, uiType := range uiTypes {
		uiTypeValues = append(uiTypeValues, string(uiType))
		ui, err := contracts.DefaultParameterUIV2(uiType)
		if err != nil {
			return schemaDocument{}, fmt.Errorf("build default %s UI example: %w", uiType, err)
		}
		uiDefaults = append(uiDefaults, ui)
	}
	return schemaDocument{
		Version:    cliContractVersion,
		Commands:   commandSchemas(),
		Operations: operations,
		Results:    resultSchemas(),
		Errors:     errorSchemas(),
		V2Vocabulary: []vocabularyShape{
			{
				Name:        "ParameterProposalV2",
				Description: "Existing V2 callable-parameter proposal. The complete UI value is preserved.",
				Fields: []fieldSchema{
					{Name: "id", Type: "string"},
					{Name: "name", Type: "string"},
					{Name: "authoredExpression", Type: "string"},
					{Name: "ui", Type: "object", Reference: "ParameterUIV2"},
				},
			},
			{
				Name:            "ParameterUIV2",
				Description:     "Existing V2 parameter presentation envelope; configuration must exactly match the selected UI type.",
				DefaultExamples: uiDefaults,
				Fields: []fieldSchema{
					{Name: "type", Type: "string", Values: uiTypeValues},
					{Name: "configuration", Type: "object", Description: "Exact existing V2 configuration for type."},
				},
			},
			{
				Name:        "DictionaryEntryV2",
				Description: "Existing recursive V2 union: a leaf has authoredExpression; a parent has children and NestedParam UI.",
				Fields: []fieldSchema{
					{Name: "kind", Type: "string", Values: []string{string(contracts.DictionaryEntryKindLeafV2), string(contracts.DictionaryEntryKindParentV2)}},
					{Name: "id", Type: "string"},
					{Name: "name", Type: "string"},
					{Name: "ui", Type: "object", Reference: "ParameterUIV2"},
					{Name: "authoredExpression", Type: "string", Description: "Leaf only."},
					{Name: "children", Type: "array", Reference: "DictionaryEntryV2", Description: "Parent only."},
				},
			},
			{
				Name:        "ListChildrenV2",
				Description: "Existing V2 list-child placement record.",
				Fields: []fieldSchema{
					{Name: "listId", Type: "string"},
					{Name: "childSectionIds", Type: "array"},
				},
			},
		},
	}, nil
}

func commandSchemas() []commandSchema {
	liveSelectors := []fieldSchema{
		{Name: "--project", Type: "path", Description: "Canonical project path resolved to exactly one verified live Python Canvas session."},
		{Name: "--url", Type: "url", Description: "Absolute loopback HTTP URL for expert automation."},
	}
	standardExitCodes := []exitCodeSchema{
		{Code: exitSuccess, Description: "The command completed successfully."},
		{Code: exitInputOrTypedV2Failure, Description: "Input was invalid or the live service returned a typed application error."},
		{Code: exitUnexpectedFailure, Description: "Connection, timeout, malformed response, or an unexpected runtime failure occurred."},
	}
	runExitCodes := append([]exitCodeSchema(nil), standardExitCodes...)
	runExitCodes = append(runExitCodes, exitCodeSchema{Code: exitCompletedPythonFailure, Description: "Generated Python completed with a nonzero exit, signal, timeout, or output limit."})
	return []commandSchema{
		{
			Name:    "schema",
			Summary: "Publish this versioned offline command contract.",
			Usage:   "setta python-canvas schema [--pretty]",
			Options: []fieldSchema{{Name: "--pretty", Type: "boolean", Description: "Indent the JSON document."}},
			Result:  "PythonCanvasCommandSchemaV2",
			ExitCodes: []exitCodeSchema{
				{Code: exitSuccess, Description: "The offline schema was written."},
				{Code: exitInputOrTypedV2Failure, Description: "Input was invalid."},
				{Code: exitUnexpectedFailure, Description: "The schema could not be written."},
			},
		},
		{
			Name:    "open",
			Summary: "Start and foreground-supervise one private live Python Canvas session.",
			Usage:   "setta python-canvas open --project PATH [--create] [--no-open]",
			Options: []fieldSchema{
				{Name: "--project", Type: "path", Description: "Project path canonicalized before session ownership is acquired."},
				{Name: "--create", Type: "boolean", Description: "Create the project only when it is absent."},
				{Name: "--no-open", Type: "boolean", Description: "Do not open the browser after the live session is ready."},
			},
			Result:    "SettaOpenResultV1",
			ExitCodes: append([]exitCodeSchema(nil), standardExitCodes...),
		},
		{
			Name:    "session.inspect",
			Summary: "Inspect one verified live Python Canvas session without changing project bytes.",
			Usage:   "setta python-canvas session inspect --project PATH [--pretty]",
			Options: []fieldSchema{
				{Name: "--project", Type: "path", Description: "Project path canonicalized before locating its live session."},
				{Name: "--pretty", Type: "boolean", Description: "Indent the JSON document."},
			},
			Result:    "LiveSessionV1",
			ExitCodes: append([]exitCodeSchema(nil), standardExitCodes...),
		},
		{
			Name:      "snapshot",
			Summary:   "Read one canonical project snapshot from a verified live session.",
			Usage:     "setta python-canvas snapshot (--project PATH | --url URL) [--wait-diagnostics] [--timeout DURATION] [--pretty]",
			Selectors: append([]fieldSchema(nil), liveSelectors...),
			Options: []fieldSchema{
				{Name: "--wait-diagnostics", Type: "boolean", Description: "Wait until diagnostics match the observed project revision."},
				{Name: "--timeout", Type: "duration", Description: "Diagnostic wait timeout from greater than zero through one minute; requires --wait-diagnostics."},
				{Name: "--pretty", Type: "boolean", Description: "Indent the JSON document."},
			},
			Result:    "ProjectSnapshotV2",
			ExitCodes: append([]exitCodeSchema(nil), standardExitCodes...),
		},
		{
			Name:      "apply",
			Summary:   "Apply exactly one closed authored operation without retrying a revision conflict.",
			Usage:     "setta python-canvas apply (--project PATH | --url URL) --file PATH|- [--wait-diagnostics] [--timeout DURATION] [--pretty]",
			Selectors: append([]fieldSchema(nil), liveSelectors...),
			Options: []fieldSchema{
				{Name: "--file", Type: "path", Description: "One operation JSON document, or - for standard input."},
				{Name: "--wait-diagnostics", Type: "boolean", Description: "Wait until diagnostics match the post-mutation project revision."},
				{Name: "--timeout", Type: "duration", Description: "Diagnostic wait timeout from greater than zero through one minute; requires --wait-diagnostics."},
				{Name: "--pretty", Type: "boolean", Description: "Indent the JSON document."},
			},
			Result:    "ProjectSnapshotV2",
			ExitCodes: append([]exitCodeSchema(nil), standardExitCodes...),
		},
		{
			Name:      "run",
			Summary:   "Run exactly one captured generated Python revision without using the attached terminal.",
			Usage:     "setta python-canvas run (--project PATH | --url URL) [--wait-diagnostics] [--diagnostics-timeout DURATION] [--run-timeout DURATION] [--pretty]",
			Selectors: append([]fieldSchema(nil), liveSelectors...),
			Options: []fieldSchema{
				{Name: "--wait-diagnostics", Type: "boolean", Description: "Wait until diagnostics match the observed project revision."},
				{Name: "--diagnostics-timeout", Type: "duration", Description: "Diagnostic wait timeout from greater than zero through one minute; requires --wait-diagnostics."},
				{Name: "--run-timeout", Type: "duration", Description: "Generated-program timeout from greater than zero through five minutes; defaults to 30 seconds."},
				{Name: "--pretty", Type: "boolean", Description: "Indent the JSON document."},
			},
			Result:    "GeneratedProgramRunResultV2",
			ExitCodes: runExitCodes,
		},
	}
}

func resultSchemas() []resultSchema {
	return []resultSchema{
		{
			Name:        "SettaOpenResultV1",
			Description: "Readiness information printed before the foreground session supervisor waits for its child.",
			Fields: []fieldSchema{
				{Name: "schemaVersion", Type: "string", Values: []string{"setta-open/v1"}},
				{Name: "appId", Type: "string", Values: []string{"python-canvas"}},
				{Name: "projectPath", Type: "path"},
				{Name: "url", Type: "url"},
			},
		},
		{
			Name:        "LiveSessionV1",
			Description: "Verified locator data for one foreground Python Canvas server; it contains no project state.",
			Fields: []fieldSchema{
				{Name: "formatVersion", Type: "string", Values: []string{"setta-live-session/v1"}},
				{Name: "appId", Type: "string", Values: []string{"python-canvas"}},
				{Name: "projectPath", Type: "path"},
				{Name: "url", Type: "url"},
				{Name: "ownerPid", Type: "integer"},
				{Name: "instanceNonce", Type: "string"},
			},
		},
		{
			Name:        "ProjectSnapshotV2",
			Description: "The canonical live coordinator snapshot returned by snapshot and apply.",
			Fields: []fieldSchema{
				{Name: "version", Type: "string", Values: []string{contracts.ProjectSnapshotVersionV2}},
				{Name: "project", Type: "object", Reference: "ProjectV2"},
				{Name: "pythonTarget", Type: "object", Reference: "PythonTargetV2"},
				{Name: "callables", Type: "array", Reference: "CallableV2"},
				{Name: "parameterDictionaries", Type: "array", Reference: "ParameterDictionaryV2"},
				{Name: "lists", Type: "array", Reference: "ListV2"},
				{Name: "topLevelSectionIds", Type: "array"},
				{Name: "generatedCode", Type: "object", Reference: "GeneratedCodeV2"},
				{Name: "diagnostics", Type: "array", Reference: "DiagnosticV2"},
				{Name: "diagnosticsRevision", Type: "integer"},
				{Name: "providerStatus", Type: "object", Reference: "ProviderStatusV2"},
			},
		},
		{
			Name:        "GeneratedProgramRunResultV2",
			Description: "One completed generated Python execution with separately bounded output streams.",
			Fields: []fieldSchema{
				{Name: "projectId", Type: "string"},
				{Name: "revision", Type: "integer", Description: "Exact captured coordinator revision."},
				{Name: "stdout", Type: "string"},
				{Name: "stderr", Type: "string"},
				{Name: "stdoutTruncated", Type: "boolean"},
				{Name: "stderrTruncated", Type: "boolean"},
				{Name: "exitCode", Type: "integer", Description: "Present only when terminationReason is exited."},
				{Name: "terminationReason", Type: "string", Values: []string{
					string(contracts.GeneratedProgramTerminationExitedV2),
					string(contracts.GeneratedProgramTerminationSignaledV2),
					string(contracts.GeneratedProgramTerminationTimedOutV2),
					string(contracts.GeneratedProgramTerminationOutputLimitV2),
				}},
				{Name: "elapsedMilliseconds", Type: "integer"},
			},
		},
		{
			Name:        "ErrorResponseV2",
			Description: "One typed error written to standard error for invalid input, application rejection, or operational failure.",
			Fields: []fieldSchema{
				{Name: "error", Type: "object", Reference: "CLIErrorV2"},
			},
		},
	}
}

func errorSchemas() []errorSchema {
	return []errorSchema{
		{Code: "invalid_input", ExitCode: exitInputOrTypedV2Failure, Description: "The command arguments are invalid."},
		{Code: "invalid_command", ExitCode: exitInputOrTypedV2Failure, Description: "The command is unsupported."},
		{Code: "session_not_found", ExitCode: exitInputOrTypedV2Failure, Description: "No verified live session exists for the selected project."},
		{Code: "session_stale", ExitCode: exitInputOrTypedV2Failure, Description: "The stored live session is stale or failed identity verification."},
		{Code: "session_already_running", ExitCode: exitInputOrTypedV2Failure, Description: "Another foreground owner already holds the project session lease."},
		{Code: "invalid_url", ExitCode: exitInputOrTypedV2Failure, Description: "The URL is outside the absolute loopback service boundary."},
		{Code: "input_too_large", ExitCode: exitInputOrTypedV2Failure, Description: "The operation document exceeds the bounded input size."},
		{Code: "invalid_operation", ExitCode: exitInputOrTypedV2Failure, Description: "The supplied authored operation does not match the closed registry."},
		{Code: "unknown_operation", ExitCode: exitInputOrTypedV2Failure, Description: "The supplied authored operation is unsupported."},
		{Code: string(contracts.APIErrorCodeRevisionConflictV2), ExitCode: exitInputOrTypedV2Failure, Description: "The requested project revision is no longer current."},
		{Code: string(contracts.APIErrorCodeValidationFailedV2), ExitCode: exitInputOrTypedV2Failure, Description: "The service rejected the request validation."},
		{Code: string(contracts.APIErrorCodeNotFoundV2), ExitCode: exitInputOrTypedV2Failure, Description: "The requested project resource does not exist."},
		{Code: string(contracts.APIErrorCodeInvalidRequestV2), ExitCode: exitInputOrTypedV2Failure, Description: "The service rejected the request shape."},
		{Code: string(contracts.APIErrorCodeProviderUnavailableV2), ExitCode: exitInputOrTypedV2Failure, Description: "The configured language provider is unavailable."},
		{Code: string(contracts.APIErrorCodeProviderFailedV2), ExitCode: exitInputOrTypedV2Failure, Description: "The configured language provider failed."},
		{Code: string(contracts.APIErrorCodeRenderFailedV2), ExitCode: exitInputOrTypedV2Failure, Description: "The service could not render generated Python."},
		{Code: string(contracts.APIErrorCodeMaterializationFailedV2), ExitCode: exitInputOrTypedV2Failure, Description: "The service could not materialize generated Python."},
		{Code: string(contracts.APIErrorCodePersistenceFailedV2), ExitCode: exitInputOrTypedV2Failure, Description: "The service could not persist the project."},
		{Code: string(contracts.APIErrorCodeTerminalUnavailableV2), ExitCode: exitInputOrTypedV2Failure, Description: "The attached terminal is unavailable."},
		{Code: string(contracts.APIErrorCodeTerminalFailedV2), ExitCode: exitInputOrTypedV2Failure, Description: "The attached terminal failed."},
		{Code: string(contracts.APIErrorCodeRunnerUnavailableV2), ExitCode: exitInputOrTypedV2Failure, Description: "The generated-program runner was interrupted."},
		{Code: string(contracts.APIErrorCodeRunnerFailedV2), ExitCode: exitInputOrTypedV2Failure, Description: "The generated-program runner failed."},
		{Code: string(contracts.APIErrorCodeMethodNotAllowedV2), ExitCode: exitInputOrTypedV2Failure, Description: "The service rejected the HTTP method."},
		{Code: string(contracts.APIErrorCodeInternalV2), ExitCode: exitInputOrTypedV2Failure, Description: "The service reported an internal typed failure."},
		{Code: "connection_failed", ExitCode: exitUnexpectedFailure, Description: "The Python Canvas service could not be reached."},
		{Code: "request_timeout", ExitCode: exitUnexpectedFailure, Description: "The service request exceeded its client-side deadline."},
		{Code: "request_canceled", ExitCode: exitUnexpectedFailure, Description: "The command context was canceled."},
		{Code: "malformed_response", ExitCode: exitUnexpectedFailure, Description: "The service response did not match its contract."},
		{Code: "response_too_large", ExitCode: exitUnexpectedFailure, Description: "The service response exceeds the bounded output size."},
		{Code: "diagnostics_timeout", ExitCode: exitUnexpectedFailure, Description: "Diagnostics did not settle before the requested deadline."},
		{Code: "runtime_invalid", ExitCode: exitUnexpectedFailure, Description: "The packaged runtime assets are unavailable or invalid."},
		{Code: "runtime_failed", ExitCode: exitUnexpectedFailure, Description: "The packaged runtime could not execute the requested app command."},
		{Code: "internal_error", ExitCode: exitUnexpectedFailure, Description: "The command could not complete an internal boundary."},
	}
}

func decodeOperationDocument(content []byte) (operation, error) {
	fields, err := decodeJSONObject(content)
	if err != nil {
		return nil, err
	}
	name, err := requiredString(fields, "operation")
	if err != nil {
		return nil, err
	}
	definition, ok := operationDefinitionByName(name)
	if !ok {
		return nil, unknownOperationError{name: name}
	}
	if err := requireExactOperationFields(fields, definition); err != nil {
		return nil, err
	}
	result, err := definition.decode(fields)
	if err != nil {
		return nil, err
	}
	if _, err := result.mutation(validationSnapshot()); err != nil {
		return nil, fmt.Errorf("validate operation: %w", err)
	}
	return result, nil
}

func operationDefinitionByName(name string) (operationDefinition, bool) {
	for _, definition := range operationRegistry {
		if definition.name == name {
			return definition, true
		}
	}
	return operationDefinition{}, false
}

func decodeJSONObject(content []byte) (map[string]json.RawMessage, error) {
	if !utf8.Valid(content) {
		return nil, fmt.Errorf("operation document is not valid UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil {
		return nil, fmt.Errorf("operation document is not valid JSON: %w", err)
	}
	if fields == nil {
		return nil, fmt.Errorf("operation document must be an object")
	}
	if err := requireJSONEOF(decoder); err != nil {
		return nil, err
	}
	return fields, nil
}

func requireJSONEOF(decoder *json.Decoder) error {
	var extra any
	err := decoder.Decode(&extra)
	if err == io.EOF {
		return nil
	}
	if err == nil {
		return fmt.Errorf("operation document must contain exactly one JSON value")
	}
	return fmt.Errorf("operation document has invalid trailing JSON: %w", err)
}

func requireExactOperationFields(fields map[string]json.RawMessage, definition operationDefinition) error {
	expected := make(map[string]struct{}, len(definition.fields)+len(definition.optionalFields)+1)
	expected["operation"] = struct{}{}
	for _, field := range definition.fields {
		expected[field.Name] = struct{}{}
	}
	for _, field := range definition.optionalFields {
		expected[field.Name] = struct{}{}
	}
	unknown := make([]string, 0)
	for field := range fields {
		if _, exists := expected[field]; !exists {
			unknown = append(unknown, field)
		}
	}
	if len(unknown) != 0 {
		sort.Strings(unknown)
		return fmt.Errorf("operation document has unknown field %q", unknown[0])
	}
	missing := make([]string, 0, len(definition.fields)+1)
	for _, field := range append([]fieldSchema{{Name: "operation"}}, definition.fields...) {
		if _, exists := fields[field.Name]; !exists {
			missing = append(missing, field.Name)
		}
	}
	if len(missing) != 0 {
		sort.Strings(missing)
		return fmt.Errorf("operation document is missing field %q", missing[0])
	}
	return nil
}

func requiredString(fields map[string]json.RawMessage, name string) (string, error) {
	var value string
	if err := requiredStrictField(fields, name, &value); err != nil {
		return "", err
	}
	return value, nil
}

func requiredInt(fields map[string]json.RawMessage, name string) (int, error) {
	var value int
	if err := requiredStrictField(fields, name, &value); err != nil {
		return 0, err
	}
	return value, nil
}

func requiredStrictField(fields map[string]json.RawMessage, name string, destination any) error {
	content, exists := fields[name]
	if !exists {
		return fmt.Errorf("operation document is missing %s", name)
	}
	if bytes.Equal(bytes.TrimSpace(content), []byte("null")) {
		return fmt.Errorf("operation field %s must not be null", name)
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("operation field %s is invalid: %w", name, err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return fmt.Errorf("operation field %s is invalid: %w", name, err)
	}
	return nil
}

func optionalStrictField(fields map[string]json.RawMessage, name string, destination any) (bool, error) {
	content, exists := fields[name]
	if !exists {
		return false, nil
	}
	if bytes.Equal(bytes.TrimSpace(content), []byte("null")) {
		return false, fmt.Errorf("operation field %s must not be null", name)
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return false, fmt.Errorf("operation field %s is invalid: %w", name, err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return false, fmt.Errorf("operation field %s is invalid: %w", name, err)
	}
	return true, nil
}

func validationSnapshot() contracts.ProjectSnapshotV2 {
	return contracts.ProjectSnapshotV2{Project: contracts.ProjectV2{ID: "project:cli-validation", Revision: 1}}
}

func validatedMutation(path string, body interface{ Validate() error }) (mutation, error) {
	if err := body.Validate(); err != nil {
		return mutation{}, err
	}
	return mutation{path: path, body: body}, nil
}
