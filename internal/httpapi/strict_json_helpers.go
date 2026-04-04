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
	var payload T
	if r.Body == nil {
		if len(requirements) != 0 {
			return payload, &strictJSONMissingFieldError{Field: requirements[0].Field}
		}
		return payload, nil
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return payload, err
	}
	trimmedBody := bytes.TrimSpace(body)
	if len(trimmedBody) == 0 {
		trimmedBody = []byte("{}")
	}
	if field, ok := detectUnknownTopLevelJSONField[T](trimmedBody); ok {
		return payload, &strictJSONUnknownFieldError{Field: field}
	}

	if len(requirements) != 0 {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(trimmedBody, &fields); err != nil {
			return payload, err
		}
		for _, requirement := range requirements {
			value, ok := fields[requirement.Field]
			if !ok {
				return payload, &strictJSONMissingFieldError{Field: requirement.Field}
			}
			if !requirement.AllowNull && bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				return payload, &strictJSONMissingFieldError{Field: requirement.Field}
			}
		}
	}

	decoder := json.NewDecoder(bytes.NewReader(trimmedBody))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		if errors.Is(err, io.EOF) {
			return payload, nil
		}
		return payload, err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return payload, fmt.Errorf("unexpected trailing JSON content")
		}
		return payload, err
	}
	return payload, nil
}
