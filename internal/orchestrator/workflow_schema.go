package orchestrator

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"

	"setta/internal/chat"
)

const workflowGraphJSONSchemaDraft = "http://json-schema.org/draft-07/schema#"

type WorkflowSchema struct {
	SchemaVersion     int                         `json:"schemaVersion"`
	GraphType         string                      `json:"graphType"`
	GraphSchema       json.RawMessage             `json:"graphSchema"`
	ValueSets         []WorkflowSchemaValueSet    `json:"valueSets"`
	Actions           []WorkflowActionSchema      `json:"actions"`
	PermissionPresets []chat.ChatPermissionPreset `json:"permissionPresets"`
}

type WorkflowSchemaValueSet struct {
	Name   string   `json:"name"`
	Values []string `json:"values"`
}

type WorkflowActionSchema struct {
	Kind         WorkflowActionKind `json:"kind"`
	ConfigType   string             `json:"configType"`
	Capabilities RunnerCapabilities `json:"capabilities"`
}

type workflowJSONSchema struct {
	Schema               string                        `json:"$schema,omitempty"`
	Ref                  string                        `json:"$ref,omitempty"`
	Definitions          map[string]workflowJSONSchema `json:"definitions,omitempty"`
	Type                 string                        `json:"type,omitempty"`
	Enum                 []string                      `json:"enum,omitempty"`
	Properties           map[string]workflowJSONSchema `json:"properties,omitempty"`
	Required             []string                      `json:"required,omitempty"`
	Items                *workflowJSONSchema           `json:"items,omitempty"`
	AdditionalProperties any                           `json:"additionalProperties,omitempty"`
	AnyOf                []workflowJSONSchema          `json:"anyOf,omitempty"`
}

type workflowJSONSchemaBuilder struct {
	definitions   map[string]workflowJSONSchema
	states        map[reflect.Type]workflowSchemaVisitState
	usedValueSets map[string]bool
	valueSets     map[string]WorkflowSchemaValueSet
}

type workflowSchemaVisitState int

const (
	workflowSchemaVisitInProgress workflowSchemaVisitState = iota + 1
	workflowSchemaVisitDone
)

func (service *Service) WorkflowSchema() (WorkflowSchema, error) {
	service.mu.Lock()
	registry := service.runnerRegistry
	service.mu.Unlock()

	return BuildWorkflowSchema(registry)
}

func BuildWorkflowSchema(registry RunnerRegistry) (WorkflowSchema, error) {
	builder, err := newWorkflowJSONSchemaBuilder()
	if err != nil {
		return WorkflowSchema{}, err
	}
	graphSchema, err := builder.RootSchema(reflect.TypeFor[WorkflowGraph]())
	if err != nil {
		return WorkflowSchema{}, err
	}
	graphSchemaJSON, err := json.Marshal(graphSchema)
	if err != nil {
		return WorkflowSchema{}, fmt.Errorf("encode workflow graph schema: %w", err)
	}
	actions, err := workflowActionSchemas(registry)
	if err != nil {
		return WorkflowSchema{}, err
	}
	return WorkflowSchema{
		SchemaVersion:     SchemaVersion,
		GraphType:         "WorkflowGraph",
		GraphSchema:       graphSchemaJSON,
		ValueSets:         builder.UsedValueSets(),
		Actions:           actions,
		PermissionPresets: chat.BuiltinChatPermissionPresets(),
	}, nil
}

func workflowActionSchemas(registry RunnerRegistry) ([]WorkflowActionSchema, error) {
	kinds := registry.ActionKinds()
	schemas := make([]WorkflowActionSchema, 0, len(kinds))
	for _, kind := range kinds {
		descriptor, ok := registry.Descriptor(kind)
		if !ok {
			return nil, fmt.Errorf("workflow action kind %s has no descriptor", kind)
		}
		config := WorkflowActionConfig{Kind: kind}
		switch kind {
		case ActionKindAgentCodex:
			config.Codex = &WorkflowCodexActionConfig{}
		default:
			return nil, fmt.Errorf("workflow action kind %s has no schema config builder", kind)
		}
		capabilities, err := descriptor.Capabilities(config)
		if err != nil {
			return nil, fmt.Errorf("build %s capabilities: %w", kind, err)
		}
		schemas = append(schemas, WorkflowActionSchema{
			Kind:         kind,
			ConfigType:   workflowActionConfigType(kind),
			Capabilities: capabilities,
		})
	}
	return schemas, nil
}

func workflowActionConfigType(kind WorkflowActionKind) string {
	switch kind {
	case ActionKindAgentCodex:
		return "WorkflowCodexActionConfig"
	default:
		return ""
	}
}

func (registry RunnerRegistry) ActionKinds() []WorkflowActionKind {
	kinds := make([]WorkflowActionKind, 0, len(registry.actionKinds))
	for kind := range registry.actionKinds {
		kinds = append(kinds, kind)
	}
	sort.Slice(kinds, func(i int, j int) bool {
		return kinds[i] < kinds[j]
	})
	return kinds
}

func newWorkflowJSONSchemaBuilder() (*workflowJSONSchemaBuilder, error) {
	valueSets, err := workflowSchemaValueSets()
	if err != nil {
		return nil, err
	}
	return &workflowJSONSchemaBuilder{
		definitions:   map[string]workflowJSONSchema{},
		states:        map[reflect.Type]workflowSchemaVisitState{},
		usedValueSets: map[string]bool{},
		valueSets:     valueSets,
	}, nil
}

func workflowSchemaValueSets() (map[string]WorkflowSchemaValueSet, error) {
	sets := map[string]WorkflowSchemaValueSet{}
	for _, set := range ContractValueSets() {
		if err := registerWorkflowSchemaValueSet(sets, set.Name, set.Values); err != nil {
			return nil, err
		}
	}
	for _, set := range chat.ContractValueSets() {
		if err := registerWorkflowSchemaValueSet(sets, set.Name, set.Values); err != nil {
			return nil, err
		}
	}
	return sets, nil
}

func registerWorkflowSchemaValueSet(sets map[string]WorkflowSchemaValueSet, name string, values []string) error {
	if name == "" {
		return errors.New("workflow schema value set name is required")
	}
	if len(values) == 0 {
		return fmt.Errorf("workflow schema value set %s is empty", name)
	}
	copied := append([]string{}, values...)
	if existing, ok := sets[name]; ok {
		if !stringSlicesEqual(existing.Values, copied) {
			return fmt.Errorf("workflow schema value set %s has conflicting values", name)
		}
		return nil
	}
	sets[name] = WorkflowSchemaValueSet{Name: name, Values: copied}
	return nil
}

func stringSlicesEqual(first []string, second []string) bool {
	if len(first) != len(second) {
		return false
	}
	for index := range first {
		if first[index] != second[index] {
			return false
		}
	}
	return true
}

func (builder *workflowJSONSchemaBuilder) RootSchema(goType reflect.Type) (workflowJSONSchema, error) {
	root, err := builder.schemaFor(goType)
	if err != nil {
		return workflowJSONSchema{}, err
	}
	root.Schema = workflowGraphJSONSchemaDraft
	root.Definitions = builder.definitions
	return root, nil
}

func (builder *workflowJSONSchemaBuilder) UsedValueSets() []WorkflowSchemaValueSet {
	names := make([]string, 0, len(builder.usedValueSets))
	for name := range builder.usedValueSets {
		names = append(names, name)
	}
	sort.Strings(names)
	sets := make([]WorkflowSchemaValueSet, 0, len(names))
	for _, name := range names {
		set := builder.valueSets[name]
		set.Values = append([]string{}, set.Values...)
		sets = append(sets, set)
	}
	return sets
}

func (builder *workflowJSONSchemaBuilder) schemaFor(goType reflect.Type) (workflowJSONSchema, error) {
	if goType == reflect.TypeFor[json.RawMessage]() {
		return workflowJSONSchema{}, nil
	}
	if valueSet, ok := builder.namedStringValueSet(goType); ok {
		return workflowJSONSchema{Type: "string", Enum: valueSet.Values}, nil
	}
	switch goType.Kind() {
	case reflect.Bool, reflect.Float32, reflect.Float64, reflect.Int, reflect.String:
		return scalarWorkflowJSONSchema(goType)
	case reflect.Slice, reflect.Map, reflect.Pointer:
		return builder.compositeSchemaFor(goType)
	case reflect.Struct:
		return builder.schemaForStruct(goType)
	default:
		return workflowJSONSchema{}, fmt.Errorf("unsupported workflow schema type %s", goType)
	}
}

func scalarWorkflowJSONSchema(goType reflect.Type) (workflowJSONSchema, error) {
	switch goType.Kind() {
	case reflect.Bool:
		return workflowJSONSchema{Type: "boolean"}, nil
	case reflect.Float32, reflect.Float64:
		return workflowJSONSchema{Type: "number"}, nil
	case reflect.Int:
		return workflowJSONSchema{Type: "integer"}, nil
	case reflect.String:
		return workflowJSONSchema{Type: "string"}, nil
	default:
		return workflowJSONSchema{}, fmt.Errorf("unsupported scalar workflow schema type %s", goType)
	}
}

func (builder *workflowJSONSchemaBuilder) compositeSchemaFor(goType reflect.Type) (workflowJSONSchema, error) {
	switch goType.Kind() {
	case reflect.Slice:
		item, err := builder.schemaFor(goType.Elem())
		if err != nil {
			return workflowJSONSchema{}, err
		}
		return workflowJSONSchema{Type: "array", Items: &item}, nil
	case reflect.Map:
		if goType.Key().Kind() != reflect.String {
			return workflowJSONSchema{}, fmt.Errorf("unsupported workflow schema map key type %s", goType.Key())
		}
		value, err := builder.schemaFor(goType.Elem())
		if err != nil {
			return workflowJSONSchema{}, err
		}
		return workflowJSONSchema{Type: "object", AdditionalProperties: value}, nil
	case reflect.Pointer:
		item, err := builder.schemaFor(goType.Elem())
		if err != nil {
			return workflowJSONSchema{}, err
		}
		return workflowJSONSchema{AnyOf: []workflowJSONSchema{item, {Type: "null"}}}, nil
	default:
		return workflowJSONSchema{}, fmt.Errorf("unsupported composite workflow schema type %s", goType)
	}
}

func (builder *workflowJSONSchemaBuilder) namedStringValueSet(goType reflect.Type) (WorkflowSchemaValueSet, bool) {
	if goType.Kind() != reflect.String || goType.Name() == "" || goType.PkgPath() == "" {
		return WorkflowSchemaValueSet{}, false
	}
	valueSet, ok := builder.valueSets[goType.Name()]
	if !ok {
		return WorkflowSchemaValueSet{}, false
	}
	builder.usedValueSets[valueSet.Name] = true
	valueSet.Values = append([]string{}, valueSet.Values...)
	return valueSet, true
}

func (builder *workflowJSONSchemaBuilder) schemaForStruct(goType reflect.Type) (workflowJSONSchema, error) {
	name := goType.Name()
	if name == "" {
		return workflowJSONSchema{}, fmt.Errorf("unsupported anonymous workflow schema struct %s", goType)
	}
	if err := builder.ensureStructDefinition(goType, name); err != nil {
		return workflowJSONSchema{}, err
	}
	return workflowJSONSchema{Ref: "#/definitions/" + name}, nil
}

func (builder *workflowJSONSchemaBuilder) ensureStructDefinition(goType reflect.Type, name string) error {
	switch builder.states[goType] {
	case workflowSchemaVisitDone, workflowSchemaVisitInProgress:
		return nil
	}
	builder.states[goType] = workflowSchemaVisitInProgress
	properties := map[string]workflowJSONSchema{}
	required := []string{}
	for index := range goType.NumField() {
		field := goType.Field(index)
		name := workflowSchemaJSONName(field)
		if field.PkgPath != "" || name == "-" {
			continue
		}
		fieldSchema, err := builder.schemaFor(field.Type)
		if err != nil {
			return fmt.Errorf("%s.%s: %w", goType.Name(), field.Name, err)
		}
		properties[name] = fieldSchema
		required = append(required, name)
	}
	sort.Strings(required)
	builder.definitions[name] = workflowJSONSchema{
		Type:                 "object",
		Properties:           properties,
		Required:             required,
		AdditionalProperties: false,
	}
	builder.states[goType] = workflowSchemaVisitDone
	return nil
}

func workflowSchemaJSONName(field reflect.StructField) string {
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
