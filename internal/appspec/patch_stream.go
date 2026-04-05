package appspec

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

var allowedPatchOps = map[string]struct{}{
	"set":     {},
	"add":     {},
	"replace": {},
	"remove":  {},
}

type PatchOp struct {
	Op       string
	Path     string
	Value    any
	HasValue bool
}

func ParsePatchLine(line string) *PatchOp {
	patch, err := ParsePatchLineWithError(line)
	if err != nil {
		return nil
	}
	return patch
}

func ParsePatchLineWithError(line string) (*PatchOp, error) {
	return parsePatchLineCore(line)
}

func ParsePatchLines(patches string) ([]PatchOp, error) {
	ops := make([]PatchOp, 0)
	for _, rawLine := range strings.Split(patches, "\n") {
		patch, err := parsePatchLineCore(rawLine)
		if err != nil {
			return nil, err
		}
		if patch == nil {
			continue
		}
		ops = append(ops, *patch)
	}
	return ops, nil
}

func ApplyPatchOps(ops []PatchOp, initialSpec map[string]any) (map[string]any, error) {
	spec := map[string]any{
		"root":     "",
		"elements": map[string]any{},
	}
	if initialSpec != nil {
		cloned, ok := clonePatchJSONValue(initialSpec).(map[string]any)
		if !ok {
			return nil, fmt.Errorf("App spec must be an object")
		}
		spec = cloned
	}
	for _, op := range ops {
		if err := ApplyPatchOp(spec, op); err != nil {
			return nil, err
		}
	}
	return spec, nil
}

func ApplyPatchOp(spec map[string]any, op PatchOp) error {
	if spec == nil {
		return fmt.Errorf("App spec must be an object")
	}
	if _, ok := allowedPatchOps[op.Op]; !ok {
		return fmt.Errorf("Unsupported patch op: %q", op.Op)
	}
	if op.Path == "" {
		return fmt.Errorf("Patch path must be a string.")
	}
	if op.Path != "/root" && !strings.HasPrefix(op.Path, "/elements/") {
		return fmt.Errorf("Unsupported patch path: %q", op.Path)
	}

	if op.Path == "/root" {
		if op.Op == "remove" {
			spec["root"] = ""
			return nil
		}
		value, ok := op.Value.(string)
		if !ok {
			return fmt.Errorf("Patch /root value must be a string element key.")
		}
		spec["root"] = value
		return nil
	}

	tokens, err := decodePointerTokens(op.Path)
	if err != nil {
		return err
	}
	if len(tokens) == 0 || tokens[0] != "elements" {
		return fmt.Errorf("Unsupported patch path: %q", op.Path)
	}

	if len(tokens) == 2 {
		elements, err := patchElementsObject(spec)
		if err != nil {
			return err
		}
		updatedElements, err := applyPatchToContainer(elements, tokens[1:], op, op.Op != "remove")
		if err != nil {
			return err
		}
		spec["elements"] = updatedElements
		return nil
	}

	elements, err := patchElementsObject(spec)
	if err != nil {
		return err
	}
	elementKey := tokens[1]
	element, ok := elements[elementKey].(map[string]any)
	if !ok {
		return fmt.Errorf("Element %q must exist before patching nested fields.", elementKey)
	}
	updatedElement, err := applyPatchToContainer(element, tokens[2:], op, op.Op != "remove")
	if err != nil {
		return err
	}
	elements[elementKey] = updatedElement
	return nil
}

func parsePatchLineCore(line string) (*PatchOp, error) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || strings.HasPrefix(trimmed, "//") {
		return nil, nil
	}

	var payload any
	if err := json.Unmarshal([]byte(trimmed), &payload); err != nil {
		return nil, fmt.Errorf("Invalid patch JSON line: %q (%v)", line, err)
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("Patch line must be a JSON object.")
	}
	rawOp, ok := object["op"].(string)
	if !ok {
		return nil, fmt.Errorf("Unsupported patch op: %v", object["op"])
	}
	if _, ok := allowedPatchOps[rawOp]; !ok {
		return nil, fmt.Errorf("Unsupported patch op: %q", rawOp)
	}
	rawPath, ok := object["path"].(string)
	if !ok {
		return nil, fmt.Errorf("Patch path must be a string.")
	}
	if rawPath != "/root" && !strings.HasPrefix(rawPath, "/elements/") {
		return nil, fmt.Errorf("Unsupported patch path: %q", rawPath)
	}

	value, hasValue := object["value"]
	if rawOp != "remove" && !hasValue {
		return nil, fmt.Errorf("Patch line missing required 'value'.")
	}

	return &PatchOp{
		Op:       rawOp,
		Path:     rawPath,
		Value:    value,
		HasValue: hasValue,
	}, nil
}

func patchElementsObject(spec map[string]any) (map[string]any, error) {
	elements, ok := spec["elements"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("Spec elements must be an object.")
	}
	return elements, nil
}

func decodePointerTokens(path string) ([]string, error) {
	if !strings.HasPrefix(path, "/") {
		return nil, fmt.Errorf("Patch path must be a JSON Pointer starting with '/'.")
	}
	rawTokens := strings.Split(path, "/")[1:]
	tokens := make([]string, 0, len(rawTokens))
	for _, token := range rawTokens {
		if token == "" {
			continue
		}
		tokens = append(tokens, decodePointerToken(token))
	}
	return tokens, nil
}

func decodePointerToken(token string) string {
	return strings.ReplaceAll(strings.ReplaceAll(token, "~1", "/"), "~0", "~")
}

func applyPatchToContainer(container any, tokens []string, op PatchOp, create bool) (any, error) {
	if len(tokens) == 0 {
		return nil, fmt.Errorf("Patch path cannot be empty.")
	}
	if len(tokens) == 1 {
		return applyPatchToLeaf(container, tokens[0], op)
	}

	token := tokens[0]
	nextToken := tokens[1]
	switch typed := container.(type) {
	case map[string]any:
		next, ok := typed[token]
		if !ok || next == nil {
			if !create {
				return nil, fmt.Errorf("Missing path segment: %s", token)
			}
			next = inferContainer(nextToken)
		}
		updatedChild, err := applyPatchToContainer(next, tokens[1:], op, create)
		if err != nil {
			return nil, err
		}
		typed[token] = updatedChild
		return typed, nil
	case []any:
		index, err := resolveArrayIndex(token, len(typed), create)
		if err != nil {
			return nil, err
		}
		if index == len(typed) {
			if !create {
				return nil, fmt.Errorf("Array index out of range.")
			}
			typed = append(typed, inferContainer(nextToken))
		}
		updatedChild, err := applyPatchToContainer(typed[index], tokens[1:], op, create)
		if err != nil {
			return nil, err
		}
		typed[index] = updatedChild
		return typed, nil
	default:
		return nil, fmt.Errorf("Patch path traversed into a non-container value.")
	}
}

func inferContainer(nextToken string) any {
	if nextToken == "-" || isDigits(nextToken) {
		return []any{}
	}
	return map[string]any{}
}

func resolveArrayIndex(token string, length int, create bool) (int, error) {
	if token == "-" {
		if !create {
			return 0, fmt.Errorf("'-' array index is only valid for add/set.")
		}
		return length, nil
	}
	index, err := parseArrayIndex(token)
	if err != nil {
		return 0, err
	}
	if index > length {
		return 0, fmt.Errorf("Array index out of range.")
	}
	return index, nil
}

func parseArrayIndex(token string) (int, error) {
	if !isDigits(token) {
		return 0, fmt.Errorf("Array index must be a non-negative integer.")
	}
	index, err := strconv.Atoi(token)
	if err != nil {
		return 0, fmt.Errorf("Array index must be a non-negative integer.")
	}
	return index, nil
}

func isDigits(token string) bool {
	if token == "" {
		return false
	}
	for _, ch := range token {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func applyPatchToLeaf(container any, key string, op PatchOp) (any, error) {
	switch typed := container.(type) {
	case map[string]any:
		if op.Op == "replace" {
			if _, ok := typed[key]; !ok {
				return nil, fmt.Errorf("Cannot replace missing key: %s", key)
			}
		}
		if op.Op == "remove" {
			delete(typed, key)
		} else {
			typed[key] = op.Value
		}
		return typed, nil
	case []any:
		return applyPatchToArrayLeaf(typed, key, op)
	default:
		if op.Op == "remove" {
			return nil, fmt.Errorf("Patch remove target is not a container.")
		}
		return nil, fmt.Errorf("Patch set target is not a container.")
	}
}

func applyPatchToArrayLeaf(items []any, key string, op PatchOp) ([]any, error) {
	if op.Op == "remove" {
		if key == "-" {
			return items, nil
		}
		index, err := parseArrayIndex(key)
		if err != nil {
			return nil, err
		}
		if index < 0 || index >= len(items) {
			return items, nil
		}
		return append(items[:index], items[index+1:]...), nil
	}

	if key == "-" {
		if op.Op == "replace" {
			return nil, fmt.Errorf("Cannot replace missing array index.")
		}
		return append(items, op.Value), nil
	}

	index, err := parseArrayIndex(key)
	if err != nil {
		return nil, err
	}
	if index > len(items) {
		return nil, fmt.Errorf("Array index out of range.")
	}
	if op.Op == "replace" && index >= len(items) {
		return nil, fmt.Errorf("Cannot replace missing array index.")
	}
	if index == len(items) {
		return append(items, op.Value), nil
	}
	items[index] = op.Value
	return items, nil
}

func clonePatchJSONValue(value any) any {
	switch typed := value.(type) {
	case nil, bool, string, float64, float32, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return typed
	case []any:
		cloned := make([]any, len(typed))
		for index, item := range typed {
			cloned[index] = clonePatchJSONValue(item)
		}
		return cloned
	case map[string]any:
		cloned := make(map[string]any, len(typed))
		for key, item := range typed {
			cloned[key] = clonePatchJSONValue(item)
		}
		return cloned
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return typed
		}
		var cloned any
		if err := json.Unmarshal(encoded, &cloned); err != nil {
			return typed
		}
		return cloned
	}
}
