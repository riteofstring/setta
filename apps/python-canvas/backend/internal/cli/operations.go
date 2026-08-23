// Package cli provides the machine-readable Python Canvas command line API.
package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

const cliContractVersion = "v1"

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
	name    string
	fields  []fieldSchema
	example json.RawMessage
	decode  func(map[string]json.RawMessage) (operation, error)
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
	Operations   []operationSchema `json:"operations"`
	V2Vocabulary []vocabularyShape `json:"v2Vocabulary"`
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
		operations = append(operations, operationSchema{
			Name:     definition.name,
			Required: required,
			Optional: []string{},
			Fields:   append([]fieldSchema(nil), definition.fields...),
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
		Operations: operations,
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
	expected := make(map[string]struct{}, len(definition.fields)+1)
	expected["operation"] = struct{}{}
	for _, field := range definition.fields {
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
	missing := make([]string, 0)
	for field := range expected {
		if _, exists := fields[field]; !exists {
			missing = append(missing, field)
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

func validationSnapshot() contracts.ProjectSnapshotV2 {
	return contracts.ProjectSnapshotV2{Project: contracts.ProjectV2{ID: "project:cli-validation", Revision: 1}}
}

func validatedMutation(path string, body interface{ Validate() error }) (mutation, error) {
	if err := body.Validate(); err != nil {
		return mutation{}, err
	}
	return mutation{path: path, body: body}, nil
}

func stableID(value string) error {
	if strings.TrimSpace(value) == "" || value != strings.TrimSpace(value) || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return fmt.Errorf("stable ID is invalid")
	}
	return nil
}

func sectionRoute(collectionPath string, id string, action string) (string, error) {
	if err := stableID(id); err != nil {
		return "", err
	}
	return collectionPath + "/" + url.PathEscape(id) + "/" + action, nil
}

type unknownOperationError struct{ name string }

func (unknownOperationError) Error() string { return "operation name is not supported" }

type projectRenameOperation struct{ name string }

func (operation projectRenameOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectRenamePathV2, contracts.RenameProjectRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type callableCreateOperation struct{ name string }

func (operation callableCreateOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectCallablesPathV2, contracts.CreateCallableRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type callableRenameOperation struct{ id, name string }

func (operation callableRenameOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "rename")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.RenameCallableRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type callableDeleteOperation struct{ id string }

func (operation callableDeleteOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "delete")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.DeleteCallableRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision})
}

type callableCommitOperation struct{ id, expression string }

func (operation callableCommitOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "commit")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.CommitCallableRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, AuthoredExpression: operation.expression})
}

type callableRefreshParametersOperation struct{ id string }

func (operation callableRefreshParametersOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "refresh-parameters")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.RefreshCallableParametersRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision})
}

type callableSetParametersOperation struct {
	id         string
	parameters []contracts.ParameterProposalV2
}

func (operation callableSetParametersOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "parameters")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.SetCallableParametersRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Parameters: operation.parameters})
}

type parameterDictionaryCreateOperation struct{ name string }

func (operation parameterDictionaryCreateOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectParameterDictionariesPathV2, contracts.CreateParameterDictionaryRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type parameterDictionaryRenameOperation struct{ id, name string }

func (operation parameterDictionaryRenameOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectParameterDictionariesPathV2, operation.id, "rename")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.RenameParameterDictionaryRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type parameterDictionaryDeleteOperation struct{ id string }

func (operation parameterDictionaryDeleteOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectParameterDictionariesPathV2, operation.id, "delete")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.DeleteParameterDictionaryRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision})
}

type parameterDictionarySetEntriesOperation struct {
	id      string
	entries []contracts.DictionaryEntryV2
}

func (operation parameterDictionarySetEntriesOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectParameterDictionariesPathV2, operation.id, "entries")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.SetParameterDictionaryEntriesRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Entries: operation.entries})
}

type listCreateOperation struct{ name string }

func (operation listCreateOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectListsPathV2, contracts.CreateListRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type listRenameOperation struct{ id, name string }

func (operation listRenameOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectListsPathV2, operation.id, "rename")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.RenameListRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type listDeleteOperation struct{ id string }

func (operation listDeleteOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectListsPathV2, operation.id, "delete")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.DeleteListRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision})
}

type listIncrementOperation struct {
	id    string
	count int
}

func (operation listIncrementOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectListsPathV2, operation.id, "increment")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.IncrementListChildrenRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Count: operation.count})
}

type listDecrementOperation struct {
	id    string
	count int
}

func (operation listDecrementOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectListsPathV2, operation.id, "decrement")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.DecrementListChildrenRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Count: operation.count})
}

type forestReplaceOperation struct {
	topLevel     []string
	listChildren []contracts.ListChildrenV2
}

func (operation forestReplaceOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectForestPathV2, contracts.ReplaceSectionForestRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, TopLevelSectionIDs: operation.topLevel, ListChildren: operation.listChildren})
}

type pythonTargetSetOperation struct{ prefix, suffix string }

func (operation pythonTargetSetOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectTargetPathV2, contracts.SetPythonTargetRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Prefix: operation.prefix, Suffix: operation.suffix})
}
