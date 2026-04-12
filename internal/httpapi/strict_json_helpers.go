package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type strictJSONFieldRequirement struct {
	Field     string
	AllowNull bool
}

type strictJSONMissingFieldError struct {
	Field string
}

func (e *strictJSONMissingFieldError) Error() string {
	if e == nil || strings.TrimSpace(e.Field) == "" {
		return "Field required."
	}
	return fmt.Sprintf("%s: Field required", e.Field)
}

func decodeStrictJSONBodyWithRequiredFields[T any](
	r *http.Request,
	requirements ...strictJSONFieldRequirement,
) (T, error) {
	var zero T
	trimmedBody, err := readStrictJSONRequestBody(r, requirements)
	if err != nil {
		return zero, err
	}
	if err := validateStrictJSONRequestBody[T](trimmedBody, requirements); err != nil {
		return zero, err
	}
	return decodeStrictJSONPayload[T](trimmedBody)
}

func readStrictJSONRequestBody(
	r *http.Request,
	requirements []strictJSONFieldRequirement,
) ([]byte, error) {
	if r.Body == nil {
		return strictJSONBodyForNilRequest(requirements)
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, err
	}
	return normalizeStrictJSONBody(body), nil
}

func strictJSONBodyForNilRequest(requirements []strictJSONFieldRequirement) ([]byte, error) {
	if len(requirements) == 0 {
		return []byte("{}"), nil
	}
	return nil, &strictJSONMissingFieldError{Field: requirements[0].Field}
}

func normalizeStrictJSONBody(body []byte) []byte {
	trimmedBody := bytes.TrimSpace(body)
	if len(trimmedBody) == 0 {
		return []byte("{}")
	}
	return trimmedBody
}

func validateStrictJSONRequestBody[T any](
	trimmedBody []byte,
	requirements []strictJSONFieldRequirement,
) error {
	if field, ok := detectUnknownTopLevelJSONField[T](trimmedBody); ok {
		return &strictJSONUnknownFieldError{Field: field}
	}
	return validateStrictJSONRequiredFields(trimmedBody, requirements)
}

func validateStrictJSONRequiredFields(
	trimmedBody []byte,
	requirements []strictJSONFieldRequirement,
) error {
	if len(requirements) == 0 {
		return nil
	}
	fields, err := decodeStrictJSONFields(trimmedBody)
	if err != nil {
		return err
	}
	for _, requirement := range requirements {
		if err := validateStrictJSONRequiredField(fields, requirement); err != nil {
			return err
		}
	}
	return nil
}

func decodeStrictJSONFields(trimmedBody []byte) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(trimmedBody, &fields); err != nil {
		return nil, err
	}
	return fields, nil
}

func validateStrictJSONRequiredField(
	fields map[string]json.RawMessage,
	requirement strictJSONFieldRequirement,
) error {
	value, ok := fields[requirement.Field]
	if !ok {
		return &strictJSONMissingFieldError{Field: requirement.Field}
	}
	if requirement.AllowNull || !bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return nil
	}
	return &strictJSONMissingFieldError{Field: requirement.Field}
}

func decodeStrictJSONPayload[T any](trimmedBody []byte) (T, error) {
	var payload T
	decoder := json.NewDecoder(bytes.NewReader(trimmedBody))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		if errors.Is(err, io.EOF) {
			return payload, nil
		}
		return payload, err
	}
	if err := decoder.Decode(&struct{}{}); err == nil {
		return payload, fmt.Errorf("unexpected trailing JSON content")
	} else if err != io.EOF {
		return payload, err
	}
	return payload, nil
}
