package managedchat

import (
	"math"
	"reflect"
	"strconv"
	"strings"

	"setta/internal/agentruns"
)

func resolveContextUsage(run agentruns.Run) *ChatContextUsage {
	usagePayload := extractRunUsagePayload(run)
	contextWindowTokens := resolveContextWindowTokens(usagePayload)
	contextUsedTokens := resolveContextUsedTokens(usagePayload)
	if contextWindowTokens == nil && contextUsedTokens == nil {
		return nil
	}
	return &ChatContextUsage{
		ContextWindowTokens: contextWindowTokens,
		ContextUsedTokens:   contextUsedTokens,
		Estimated:           contextWindowTokens == nil,
	}
}

func extractRunUsagePayload(run agentruns.Run) map[string]int {
	if run.Outputs == nil {
		return nil
	}
	return normalizeUsagePayload(run.Outputs["usage"])
}

func normalizeUsagePayload(raw any) map[string]int {
	payload, ok := raw.(map[string]any)
	if !ok {
		return nil
	}
	normalized := collectUsageAliasValues(payload)
	populateDerivedUsageValues(normalized)
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func collectUsageAliasValues(payload map[string]any) map[string]int {
	normalized := map[string]int{}
	for key, aliases := range usageKeyAliases() {
		if value, ok := readUsageAliasValue(payload, aliases); ok {
			normalized[key] = value
		}
	}
	return normalized
}

func readUsageAliasValue(payload map[string]any, aliases []string) (int, bool) {
	for _, alias := range aliases {
		value, ok := payload[alias]
		if !ok {
			continue
		}
		parsed := extractNonNegativeInt(value)
		if parsed != nil {
			return *parsed, true
		}
	}
	return 0, false
}

func populateDerivedUsageValues(normalized map[string]int) {
	copyUsageValue(normalized, "promptTokens", "inputTokens")
	copyUsageValue(normalized, "completionTokens", "outputTokens")

	if _, ok := normalized["totalTokens"]; ok {
		return
	}
	promptTokens, hasPrompt := normalized["promptTokens"]
	completionTokens, hasCompletion := normalized["completionTokens"]
	if hasPrompt && hasCompletion {
		normalized["totalTokens"] = promptTokens + completionTokens
	}
}

func copyUsageValue(normalized map[string]int, target string, source string) {
	if _, ok := normalized[target]; ok {
		return
	}
	if value, ok := normalized[source]; ok {
		normalized[target] = value
	}
}

func usageKeyAliases() map[string][]string {
	return map[string][]string{
		"promptTokens":          {"promptTokens", "prompt_tokens", "inputTokens", "input_tokens", "usedTokens"},
		"completionTokens":      {"completionTokens", "completion_tokens", "outputTokens", "output_tokens"},
		"totalTokens":           {"totalTokens", "total_tokens"},
		"inputTokens":           {"inputTokens", "input_tokens", "usedTokens"},
		"outputTokens":          {"outputTokens", "output_tokens"},
		"cachedInputTokens":     {"cachedInputTokens", "cached_input_tokens"},
		"reasoningOutputTokens": {"reasoningOutputTokens", "reasoning_output_tokens"},
		"contextWindowTokens":   {"contextWindowTokens", "context_window_tokens", "model_context_window", "modelContextWindow", "windowTokens"},
		"contextUsedTokens":     {"contextUsedTokens", "context_used_tokens"},
	}
}

func extractNonNegativeInt(raw any) *int {
	switch value := raw.(type) {
	case nil, bool:
		return nil
	case float32:
		return extractWholeNonNegativeFloat(float64(value))
	case float64:
		return extractWholeNonNegativeFloat(value)
	case string:
		return parseNonNegativeIntString(value)
	default:
		return extractReflectedNonNegativeInt(raw)
	}
}

func extractWholeNonNegativeFloat(value float64) *int {
	if math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value {
		return nil
	}
	return buildNonNegativeInt(value)
}

func parseNonNegativeIntString(value string) *int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	parsed, err := strconv.Atoi(trimmed)
	if err != nil {
		return nil
	}
	return buildNonNegativeInt(parsed)
}

func extractReflectedNonNegativeInt(raw any) *int {
	reflected := reflect.ValueOf(raw)
	switch reflected.Kind() {
	case reflect.Bool:
		return nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return buildNonNegativeInt(reflected.Int())
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return buildUnsignedInt(reflected.Uint())
	default:
		return nil
	}
}

func buildNonNegativeInt[T ~int | ~int64 | ~float64](value T) *int {
	if value < 0 {
		return nil
	}
	parsed := int(value)
	if T(parsed) != value {
		return nil
	}
	return &parsed
}

func buildUnsignedInt(value uint64) *int {
	parsed := int(value)
	if uint64(parsed) != value {
		return nil
	}
	return &parsed
}

func resolveContextWindowTokens(usagePayload map[string]int) *int {
	if usagePayload == nil {
		return nil
	}
	contextWindowTokens, ok := usagePayload["contextWindowTokens"]
	if !ok || contextWindowTokens <= 0 {
		return nil
	}
	return &contextWindowTokens
}

func resolveContextUsedTokens(usagePayload map[string]int) *int {
	if usagePayload == nil {
		return nil
	}
	if contextUsedTokens, ok := usagePayload["contextUsedTokens"]; ok {
		return &contextUsedTokens
	}
	if promptTokens, ok := usagePayload["promptTokens"]; ok {
		return &promptTokens
	}
	if inputTokens, ok := usagePayload["inputTokens"]; ok {
		return &inputTokens
	}
	return nil
}
