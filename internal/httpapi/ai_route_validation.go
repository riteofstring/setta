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

type llmResponseValidationError struct {
	message string
}

var getLLMResponseMessageRoles = map[string]struct{}{
	"system":    {},
	"assistant": {},
	"user":      {},
	"tool":      {},
}

const getLLMResponseMessageRoleExpectedTags = "<ChatRole.system: 'system'>, <ChatRole.assistant: 'assistant'>, <ChatRole.user: 'user'>, <ChatRole.tool: 'tool'>"

var getLLMResponseRequiredFields = []string{
	"message",
	"engineConfigId",
	"thinking",
	"projectConfigId",
	"permissionMode",
	"searchEnabled",
}

var getLLMResponseNullFieldValidationMessages = map[string]string{
	"message":         "message: Input should be a valid dictionary",
	"engineConfigId":  "engineConfigId: Input should be a valid string",
	"thinking":        "thinking: Input should be a valid boolean",
	"projectConfigId": "projectConfigId: Input should be a valid string",
	"permissionMode":  "permissionMode: Input should be 'minimal', 'yolo' or 'config_toml_custom'",
	"searchEnabled":   "searchEnabled: Input should be a valid boolean",
}

func (e *llmResponseValidationError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func invalidGetLLMResponseMessageRoleError(value any) error {
	tag := "None"
	switch typed := value.(type) {
	case nil:
	case bool:
		if typed {
			tag = "True"
		} else {
			tag = "False"
		}
	default:
		tag = fmt.Sprint(typed)
	}
	return &llmResponseValidationError{
		message: "message: Input tag '" + tag + "' found using 'role' does not match any of the expected tags: " + getLLMResponseMessageRoleExpectedTags,
	}
}

func decodeGetLLMResponseRequest(r *http.Request) (GetLLMResponseRequest, error) {
	trimmedBody, err := readGetLLMResponseRequestBody(r)
	if err != nil {
		return GetLLMResponseRequest{}, err
	}
	fields, err := decodeGetLLMResponseRequestFields(trimmedBody)
	if err != nil {
		return GetLLMResponseRequest{}, err
	}
	if err := validateGetLLMResponseRequiredFields(fields); err != nil {
		return GetLLMResponseRequest{}, err
	}
	if err := validateGetLLMResponseMessage(fields["message"]); err != nil {
		return GetLLMResponseRequest{}, err
	}
	return decodeGetLLMResponsePayload(trimmedBody)
}

func readGetLLMResponseRequestBody(r *http.Request) ([]byte, error) {
	if r.Body == nil {
		return nil, &strictJSONMissingFieldError{Field: "message"}
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, err
	}
	trimmedBody := bytes.TrimSpace(body)
	if len(trimmedBody) == 0 {
		trimmedBody = []byte("{}")
	}
	if field, ok := detectUnknownTopLevelJSONField[GetLLMResponseRequest](trimmedBody); ok {
		return nil, &strictJSONUnknownFieldError{Field: field}
	}
	return trimmedBody, nil
}

func decodeGetLLMResponseRequestFields(trimmedBody []byte) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(trimmedBody, &fields); err != nil {
		return nil, err
	}
	return fields, nil
}

func validateGetLLMResponseRequiredFields(fields map[string]json.RawMessage) error {
	for _, field := range getLLMResponseRequiredFields {
		if err := validateGetLLMResponseRequiredField(fields, field); err != nil {
			return err
		}
	}
	return nil
}

func validateGetLLMResponseRequiredField(fields map[string]json.RawMessage, field string) error {
	value, ok := fields[field]
	if !ok {
		return &strictJSONMissingFieldError{Field: field}
	}
	if !bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return nil
	}
	return &llmResponseValidationError{message: getLLMResponseNullFieldValidationMessages[field]}
}

func decodeGetLLMResponsePayload(trimmedBody []byte) (GetLLMResponseRequest, error) {
	var payload GetLLMResponseRequest
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

func formatGetLLMResponseValidationMessage(err error) string {
	var missingFieldErr *strictJSONMissingFieldError
	if errors.As(err, &missingFieldErr) {
		return missingFieldErr.Error()
	}

	var unknownFieldErr *strictJSONUnknownFieldError
	if errors.As(err, &unknownFieldErr) {
		field := strings.TrimSpace(unknownFieldErr.Field)
		if field == "" {
			return "Extra inputs are not permitted"
		}
		return field + ": Extra inputs are not permitted"
	}

	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		switch strings.TrimSpace(typeErr.Field) {
		case "message":
			return "message: Input should be a valid dictionary"
		case "engineConfigId", "projectConfigId":
			return strings.TrimSpace(typeErr.Field) + ": Input should be a valid string"
		case "thinking", "searchEnabled":
			return strings.TrimSpace(typeErr.Field) + ": Input should be a valid boolean"
		case "permissionMode":
			return "permissionMode: Input should be 'minimal', 'yolo' or 'config_toml_custom'"
		}
	}

	var validationErr *llmResponseValidationError
	if errors.As(err, &validationErr) {
		return validationErr.Error()
	}

	return err.Error()
}

func validateGetLLMResponseMessage(raw json.RawMessage) error {
	fields, err := decodeGetLLMResponseMessageFields(raw)
	if err != nil {
		return err
	}

	role, err := resolveGetLLMResponseMessageRole(fields)
	if err != nil {
		return err
	}
	if role != "tool" {
		return nil
	}
	return validateGetLLMResponseToolMessage(fields)
}

func decodeGetLLMResponseMessageFields(raw json.RawMessage) (map[string]json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil, &llmResponseValidationError{
			message: "message: Input should be a valid dictionary",
		}
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &fields); err != nil {
		return nil, &llmResponseValidationError{
			message: "message: Input should be a valid dictionary",
		}
	}
	return fields, nil
}

func resolveGetLLMResponseMessageRole(fields map[string]json.RawMessage) (string, error) {
	roleRaw, ok := fields["role"]
	if !ok {
		return "", &llmResponseValidationError{
			message: "message: Unable to extract tag using discriminator 'role'",
		}
	}

	var roleValue any
	if err := json.Unmarshal(roleRaw, &roleValue); err != nil {
		return "", &llmResponseValidationError{message: "message: Unable to extract tag using discriminator 'role'"}
	}

	role, ok := roleValue.(string)
	if !ok {
		return "", invalidGetLLMResponseMessageRoleError(roleValue)
	}

	if _, ok := getLLMResponseMessageRoles[role]; !ok {
		return "", invalidGetLLMResponseMessageRoleError(role)
	}
	return role, nil
}

func validateGetLLMResponseToolMessage(fields map[string]json.RawMessage) error {
	toolCallIDRaw, ok := fields["tool_call_id"]
	if !ok {
		return &llmResponseValidationError{
			message: "message.tool.tool_call_id: Field required",
		}
	}

	var toolCallID any
	if err := json.Unmarshal(toolCallIDRaw, &toolCallID); err != nil {
		return &llmResponseValidationError{
			message: "message.tool.tool_call_id: Input should be a valid string",
		}
	}
	if _, ok := toolCallID.(string); !ok {
		return &llmResponseValidationError{
			message: "message.tool.tool_call_id: Input should be a valid string",
		}
	}
	return nil
}

func writeChatHydrationDecodeError(w http.ResponseWriter, r *http.Request, err error) {
	var missingFieldErr *strictJSONMissingFieldError
	if errors.As(err, &missingFieldErr) && missingFieldErr.Field == "projectConfigId" {
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
		return
	}
	writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
}
