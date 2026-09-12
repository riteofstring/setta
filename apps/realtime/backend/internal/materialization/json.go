package materialization

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"

	"github.com/setta/realtime/backend/internal/contracts"
)

const (
	maximumJSONDepth             = 32
	maximumOutputBytes           = 8 << 20
	maximumOutputCollectionBytes = 8 << 20
	maximumOutputs               = 128
	maximumStringBytes           = 1 << 20
)

var outputNamePattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)

func prepareOutputs(outputs map[string]json.RawMessage) (map[string]json.RawMessage, []contracts.ContentReference, error) {
	if outputs == nil || len(outputs) > maximumOutputs {
		return nil, nil, errors.New("outputs are missing or exceed the limit")
	}
	cloned := make(map[string]json.RawMessage, len(outputs))
	references := make(map[string]contracts.ContentReference)
	ordered := make([]contracts.ContentReference, 0)
	totalBytes := 0
	for _, name := range sortedKeys(outputs) {
		if !outputNamePattern.MatchString(name) {
			return nil, nil, fmt.Errorf("output name %q is invalid", name)
		}
		raw := outputs[name]
		if len(raw) == 0 || len(raw) > maximumOutputBytes {
			return nil, nil, fmt.Errorf("output %q is missing or exceeds the byte limit", name)
		}
		totalBytes += len(raw)
		if totalBytes > maximumOutputCollectionBytes {
			return nil, nil, errors.New("outputs exceed the combined byte limit")
		}
		value, err := decodeValue(raw)
		if err != nil {
			return nil, nil, fmt.Errorf("output %q: %w", name, err)
		}
		if err := discoverReferences(value, 0, references, &ordered); err != nil {
			return nil, nil, fmt.Errorf("output %q: %w", name, err)
		}
		cloned[name] = append(json.RawMessage(nil), raw...)
	}
	if len(ordered) > maximumReferences {
		return nil, nil, errors.New("referenced content exceeds the record limit")
	}
	return cloned, ordered, nil
}

func decodeValue(raw json.RawMessage) (any, error) {
	var checked any
	if err := contracts.DecodeStrict(raw, &checked); err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("multiple JSON values")
		}
		return nil, err
	}
	if err := validateValue(value, 0); err != nil {
		return nil, err
	}
	return value, nil
}

func validateValue(value any, depth int) error {
	if depth > maximumJSONDepth {
		return errors.New("JSON exceeds the depth limit")
	}
	switch typed := value.(type) {
	case string:
		if len(typed) > maximumStringBytes {
			return errors.New("JSON string exceeds the byte limit")
		}
	case []any:
		for _, item := range typed {
			if err := validateValue(item, depth+1); err != nil {
				return err
			}
		}
	case map[string]any:
		for key, item := range typed {
			if len(key) > maximumStringBytes {
				return errors.New("JSON field exceeds the byte limit")
			}
			if err := validateValue(item, depth+1); err != nil {
				return err
			}
		}
	}
	return nil
}

func discoverReferences(value any, depth int, known map[string]contracts.ContentReference, ordered *[]contracts.ContentReference) error {
	if depth > maximumJSONDepth {
		return errors.New("JSON exceeds the depth limit")
	}
	switch typed := value.(type) {
	case []any:
		return discoverReferenceList(typed, depth, known, ordered)
	case map[string]any:
		return discoverReferenceMap(typed, depth, known, ordered)
	}
	return nil
}

func discoverReferenceList(values []any, depth int, known map[string]contracts.ContentReference, ordered *[]contracts.ContentReference) error {
	for _, item := range values {
		if err := discoverReferences(item, depth+1, known, ordered); err != nil {
			return err
		}
	}
	return nil
}

func discoverReferenceMap(value map[string]any, depth int, known map[string]contracts.ContentReference, ordered *[]contracts.ContentReference) error {
	reference, exact, err := contentReferenceValue(value)
	if err != nil {
		return err
	}
	if exact {
		return appendReference(reference, known, ordered)
	}
	for _, key := range sortedKeys(value) {
		if err := discoverReferences(value[key], depth+1, known, ordered); err != nil {
			return err
		}
	}
	return nil
}

func appendReference(reference contracts.ContentReference, known map[string]contracts.ContentReference, ordered *[]contracts.ContentReference) error {
	existing, found := known[reference.ID]
	if found && existing != reference {
		return errors.New("content reference identity is ambiguous")
	}
	if !found {
		known[reference.ID] = reference
		*ordered = append(*ordered, reference)
	}
	return nil
}

func contentReferenceValue(value map[string]any) (contracts.ContentReference, bool, error) {
	if len(value) != 5 {
		return contracts.ContentReference{}, false, nil
	}
	for _, key := range []string{"id", "mediaType", "byteLength", "sha256", "invocationId"} {
		if _, exists := value[key]; !exists {
			return contracts.ContentReference{}, false, nil
		}
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return contracts.ContentReference{}, true, err
	}
	var reference contracts.ContentReference
	if err := contracts.DecodeStrict(encoded, &reference); err != nil {
		return contracts.ContentReference{}, true, err
	}
	if err := reference.Validate(); err != nil {
		return contracts.ContentReference{}, true, err
	}
	return reference, true, nil
}

func rewriteOutputs(outputs map[string]json.RawMessage, references map[string]contracts.ContentReference) (map[string]json.RawMessage, error) {
	rewritten := make(map[string]json.RawMessage, len(outputs))
	for _, name := range sortedKeys(outputs) {
		value, err := decodeValue(outputs[name])
		if err != nil {
			return nil, err
		}
		value, err = rewriteValue(value, 0, references)
		if err != nil {
			return nil, err
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		rewritten[name] = encoded
	}
	return rewritten, nil
}

func rewriteValue(value any, depth int, references map[string]contracts.ContentReference) (any, error) {
	if depth > maximumJSONDepth {
		return nil, errors.New("JSON exceeds the depth limit")
	}
	switch typed := value.(type) {
	case []any:
		for index, item := range typed {
			rewritten, err := rewriteValue(item, depth+1, references)
			if err != nil {
				return nil, err
			}
			typed[index] = rewritten
		}
		return typed, nil
	case map[string]any:
		reference, exact, err := contentReferenceValue(typed)
		if err != nil {
			return nil, err
		}
		if exact {
			fresh, exists := references[reference.ID]
			if !exists {
				return nil, fmt.Errorf("content reference %q has no restored value", reference.ID)
			}
			return referenceValue(fresh), nil
		}
		for key, item := range typed {
			rewritten, err := rewriteValue(item, depth+1, references)
			if err != nil {
				return nil, err
			}
			typed[key] = rewritten
		}
		return typed, nil
	default:
		return value, nil
	}
}

func referenceValue(reference contracts.ContentReference) map[string]any {
	return map[string]any{
		"id":           reference.ID,
		"mediaType":    reference.MediaType,
		"byteLength":   json.Number(strconv.FormatInt(reference.ByteLength, 10)),
		"sha256":       reference.SHA256,
		"invocationId": reference.InvocationID,
	}
}
