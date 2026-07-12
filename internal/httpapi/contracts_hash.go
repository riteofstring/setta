package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"setta/internal/chat"
	"setta/internal/terminal"
)

type contractUnion struct {
	Discriminator string
	Name          string
	Type          reflect.Type
	Variants      []contractUnionVariant
}

type contractUnionVariant struct {
	KindValue string
	Name      string
	Type      reflect.Type
}

type contractSchemaHashInput struct {
	Endpoints      []contractEndpointHashInput `json:"endpoints"`
	ErrorResponses []contractTypeHashInput     `json:"errorResponses"`
}

type contractEndpointHashInput struct {
	Method              string                 `json:"method"`
	Name                string                 `json:"name"`
	Path                string                 `json:"path"`
	Request             *contractTypeHashInput `json:"request,omitempty"`
	Response            *contractTypeHashInput `json:"response,omitempty"`
	StreamEvent         *contractTypeHashInput `json:"streamEvent,omitempty"`
	Streaming           bool                   `json:"streaming"`
	Duplex              bool                   `json:"duplex"`
	DuplexClientMessage *contractTypeHashInput `json:"duplexClientMessage,omitempty"`
	DuplexServerMessage *contractTypeHashInput `json:"duplexServerMessage,omitempty"`
}

type contractTypeHashInput struct {
	Discriminator string                          `json:"discriminator,omitempty"`
	Elem          *contractTypeHashInput          `json:"elem,omitempty"`
	Fields        []contractFieldHashInput        `json:"fields,omitempty"`
	Key           *contractTypeHashInput          `json:"key,omitempty"`
	Kind          string                          `json:"kind"`
	Name          string                          `json:"name,omitempty"`
	PkgPath       string                          `json:"pkgPath,omitempty"`
	Variants      []contractUnionVariantHashInput `json:"variants,omitempty"`
}

type contractUnionVariantHashInput struct {
	KindValue string                `json:"kindValue"`
	Name      string                `json:"name"`
	Type      contractTypeHashInput `json:"type"`
}

type contractFieldHashInput struct {
	Name string                `json:"name"`
	Type contractTypeHashInput `json:"type"`
}

func ContractSchemaHash(schema ContractSchema) (string, error) {
	input, err := contractSchemaHashInputFor(schema)
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(input)
	if err != nil {
		return "", fmt.Errorf("marshal contract schema hash input: %w", err)
	}
	sum := sha256.Sum256(payload)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func contractSchemaHashInputFor(schema ContractSchema) (contractSchemaHashInput, error) {
	input := contractSchemaHashInput{
		Endpoints:      make([]contractEndpointHashInput, 0, len(schema.Endpoints)),
		ErrorResponses: make([]contractTypeHashInput, 0, len(schema.ErrorResponses)),
	}
	for _, endpoint := range schema.Endpoints {
		hashInput, err := contractEndpointHashInputFor(endpoint)
		if err != nil {
			return contractSchemaHashInput{}, err
		}
		input.Endpoints = append(input.Endpoints, hashInput)
	}
	for _, errorResponse := range schema.ErrorResponses {
		hashInput, err := contractTypeHashInputFor(errorResponse, map[reflect.Type]bool{})
		if err != nil {
			return contractSchemaHashInput{}, fmt.Errorf("error response %s: %w", errorResponse, err)
		}
		input.ErrorResponses = append(input.ErrorResponses, hashInput)
	}
	return input, nil
}

func contractEndpointHashInputFor(endpoint ContractEndpoint) (contractEndpointHashInput, error) {
	request, err := optionalContractTypeHashInput(endpoint.Request)
	if err != nil {
		return contractEndpointHashInput{}, fmt.Errorf("%s request: %w", endpoint.Name, err)
	}
	response, err := optionalContractTypeHashInput(endpoint.Response)
	if err != nil {
		return contractEndpointHashInput{}, fmt.Errorf("%s response: %w", endpoint.Name, err)
	}
	streamEvent, err := optionalContractTypeHashInput(endpoint.StreamEvent)
	if err != nil {
		return contractEndpointHashInput{}, fmt.Errorf("%s stream event: %w", endpoint.Name, err)
	}
	duplexClientMessage, err := optionalContractTypeHashInput(endpoint.DuplexClientMessage)
	if err != nil {
		return contractEndpointHashInput{}, fmt.Errorf("%s duplex client message: %w", endpoint.Name, err)
	}
	duplexServerMessage, err := optionalContractTypeHashInput(endpoint.DuplexServerMessage)
	if err != nil {
		return contractEndpointHashInput{}, fmt.Errorf("%s duplex server message: %w", endpoint.Name, err)
	}
	return contractEndpointHashInput{
		Method:              endpoint.Method,
		Name:                endpoint.Name,
		Path:                endpoint.Path,
		Request:             request,
		Response:            response,
		StreamEvent:         streamEvent,
		Streaming:           endpoint.Streaming,
		Duplex:              endpoint.Duplex,
		DuplexClientMessage: duplexClientMessage,
		DuplexServerMessage: duplexServerMessage,
	}, nil
}

func optionalContractTypeHashInput(goType reflect.Type) (*contractTypeHashInput, error) {
	if goType == nil {
		return nil, nil
	}
	hashInput, err := contractTypeHashInputFor(goType, map[reflect.Type]bool{})
	if err != nil {
		return nil, err
	}
	return &hashInput, nil
}

func contractTypeHashInputFor(
	goType reflect.Type,
	stack map[reflect.Type]bool,
) (contractTypeHashInput, error) {
	if goType == nil {
		return contractTypeHashInput{}, fmt.Errorf("type is nil")
	}
	if goType == reflect.TypeFor[json.RawMessage]() {
		return contractTypeHashInput{Kind: "raw_json"}, nil
	}
	if _, ok := contractUnionForType(goType); ok {
		return unionContractTypeHashInput(goType, stack)
	}
	switch goType.Kind() {
	case reflect.Bool, reflect.Float32, reflect.Float64, reflect.Int, reflect.String:
		return scalarContractTypeHashInput(goType), nil
	case reflect.Slice, reflect.Pointer:
		return unaryContractTypeHashInput(goType, stack)
	case reflect.Map:
		return mapContractTypeHashInput(goType, stack)
	case reflect.Struct:
		return structContractTypeHashInput(goType, stack)
	case reflect.Interface:
		return unionContractTypeHashInput(goType, stack)
	default:
		return contractTypeHashInput{}, fmt.Errorf("unsupported Go type %s", goType)
	}
}

func scalarContractTypeHashInput(goType reflect.Type) contractTypeHashInput {
	return contractTypeHashInput{
		Kind:    goType.Kind().String(),
		Name:    goType.Name(),
		PkgPath: goType.PkgPath(),
	}
}

func unaryContractTypeHashInput(
	goType reflect.Type,
	stack map[reflect.Type]bool,
) (contractTypeHashInput, error) {
	elem, err := contractTypeHashInputFor(goType.Elem(), stack)
	if err != nil {
		return contractTypeHashInput{}, err
	}
	return contractTypeHashInput{
		Kind: goType.Kind().String(),
		Elem: &elem,
	}, nil
}

func mapContractTypeHashInput(
	goType reflect.Type,
	stack map[reflect.Type]bool,
) (contractTypeHashInput, error) {
	key, err := contractTypeHashInputFor(goType.Key(), stack)
	if err != nil {
		return contractTypeHashInput{}, fmt.Errorf("map key: %w", err)
	}
	elem, err := contractTypeHashInputFor(goType.Elem(), stack)
	if err != nil {
		return contractTypeHashInput{}, fmt.Errorf("map value: %w", err)
	}
	return contractTypeHashInput{
		Kind: goType.Kind().String(),
		Key:  &key,
		Elem: &elem,
	}, nil
}

func unionContractTypeHashInput(
	goType reflect.Type,
	stack map[reflect.Type]bool,
) (contractTypeHashInput, error) {
	union, ok := contractUnionForType(goType)
	if !ok {
		return contractTypeHashInput{}, fmt.Errorf("unsupported Go interface contract type %s", goType)
	}
	if stack[goType] {
		return contractTypeHashInput{}, fmt.Errorf("recursive contract type %s is unsupported", goType)
	}
	stack[goType] = true
	defer delete(stack, goType)
	variants := make([]contractUnionVariantHashInput, 0, len(union.Variants))
	for _, variant := range union.Variants {
		variantType, err := contractTypeHashInputFor(variant.Type, stack)
		if err != nil {
			return contractTypeHashInput{}, fmt.Errorf("%s.%s variant: %w", union.Name, variant.Name, err)
		}
		variants = append(variants, contractUnionVariantHashInput{
			KindValue: variant.KindValue,
			Name:      variant.Name,
			Type:      variantType,
		})
	}
	return contractTypeHashInput{
		Discriminator: union.Discriminator,
		Kind:          goType.Kind().String(),
		Name:          goType.Name(),
		PkgPath:       goType.PkgPath(),
		Variants:      variants,
	}, nil
}

func contractUnionForType(goType reflect.Type) (contractUnion, bool) {
	for _, union := range chat.ContractUnions() {
		if union.Type == goType {
			variants := make([]contractUnionVariant, 0, len(union.Variants))
			for _, variant := range union.Variants {
				variants = append(variants, contractUnionVariant(variant))
			}
			return contractUnion{Discriminator: union.Discriminator, Name: union.Name, Type: union.Type, Variants: variants}, true
		}
	}
	for _, union := range terminal.ContractUnions() {
		if union.Type == goType {
			variants := make([]contractUnionVariant, 0, len(union.Variants))
			for _, variant := range union.Variants {
				variants = append(variants, contractUnionVariant(variant))
			}
			return contractUnion{Discriminator: union.Discriminator, Name: union.Name, Type: union.Type, Variants: variants}, true
		}
	}
	return contractUnion{}, false
}

func structContractTypeHashInput(
	goType reflect.Type,
	stack map[reflect.Type]bool,
) (contractTypeHashInput, error) {
	if stack[goType] {
		return contractTypeHashInput{}, fmt.Errorf("recursive contract type %s is unsupported", goType)
	}
	stack[goType] = true
	defer delete(stack, goType)
	fields, err := contractFieldHashInputs(goType, stack)
	if err != nil {
		return contractTypeHashInput{}, err
	}
	return contractTypeHashInput{
		Kind:    goType.Kind().String(),
		Name:    goType.Name(),
		PkgPath: goType.PkgPath(),
		Fields:  fields,
	}, nil
}

func contractFieldHashInputs(
	goType reflect.Type,
	stack map[reflect.Type]bool,
) ([]contractFieldHashInput, error) {
	fields := make([]contractFieldHashInput, 0, goType.NumField())
	for index := range goType.NumField() {
		field := goType.Field(index)
		name := contractJSONName(field)
		if field.PkgPath != "" || name == "-" {
			continue
		}
		hashInput, err := contractTypeHashInputFor(field.Type, stack)
		if err != nil {
			return nil, fmt.Errorf("%s.%s: %w", goType.Name(), field.Name, err)
		}
		fields = append(fields, contractFieldHashInput{Name: name, Type: hashInput})
	}
	return fields, nil
}

func contractJSONName(field reflect.StructField) string {
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
