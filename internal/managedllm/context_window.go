package managedllm

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	"google.golang.org/genai"
	"setta/internal/agentruns"
)

const contextWindowLookupTimeout = 3 * time.Second

var (
	contextWindowTokenAliases = []string{
		"contextWindowTokens",
		"context_window_tokens",
		"context_window",
		"modelContextWindow",
		"model_context_window",
		"windowTokens",
		"contextLength",
		"context_length",
		"maxInputTokens",
		"max_input_tokens",
		"inputTokenLimit",
		"input_token_limit",
	}
	contextUsedTokenAliases = []string{
		"contextUsedTokens",
		"context_used_tokens",
		"usedTokens",
		"used_tokens",
	}
)

type cachedContextWindow struct {
	resolved bool
	value    *int
}

type contextWindowCache struct {
	mu     sync.RWMutex
	values map[string]cachedContextWindow
}

func newContextWindowCache() *contextWindowCache {
	return &contextWindowCache{
		values: map[string]cachedContextWindow{},
	}
}

func (c *contextWindowCache) Load(key string) (cachedContextWindow, bool) {
	if c == nil {
		return cachedContextWindow{}, false
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.values[key]
	if !ok {
		return cachedContextWindow{}, false
	}
	return cachedContextWindow{
		resolved: entry.resolved,
		value:    cloneIntPointer(entry.value),
	}, true
}

func (c *contextWindowCache) Store(key string, value *int) {
	if c == nil || strings.TrimSpace(key) == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.values[key] = cachedContextWindow{
		resolved: true,
		value:    cloneIntPointer(value),
	}
}

func appendContextUsageFromRawJSON(payload map[string]any, rawJSON string) map[string]any {
	if payload == nil || strings.TrimSpace(rawJSON) == "" {
		return payload
	}
	if contextUsedTokens := extractTokenCountFromRawJSON(rawJSON, contextUsedTokenAliases, true); contextUsedTokens != nil {
		payload["contextUsedTokens"] = *contextUsedTokens
	}
	if contextWindowTokens := extractTokenCountFromRawJSON(rawJSON, contextWindowTokenAliases, false); contextWindowTokens != nil {
		payload["contextWindowTokens"] = *contextWindowTokens
	}
	return payload
}

func (e *Executor) finalizeUsagePayload(
	ctx context.Context,
	prepared preparedExecution,
	request agentruns.ExecutionRequest,
	usage map[string]any,
) map[string]any {
	if usage == nil {
		return nil
	}
	payload := cloneAnyMap(usage)
	if contextUsedTokens := extractTokenCountFromMap(payload, contextUsedTokenAliases, true); contextUsedTokens != nil {
		payload["contextUsedTokens"] = *contextUsedTokens
	}
	if contextWindowTokens := extractTokenCountFromMap(payload, contextWindowTokenAliases, false); contextWindowTokens != nil {
		payload["contextWindowTokens"] = *contextWindowTokens
		return payload
	}
	if contextWindowTokens := e.lookupAuthoritativeContextWindow(ctx, prepared, request); contextWindowTokens != nil {
		payload["contextWindowTokens"] = *contextWindowTokens
	}
	return payload
}

func (e *Executor) lookupAuthoritativeContextWindow(
	ctx context.Context,
	prepared preparedExecution,
	request agentruns.ExecutionRequest,
) *int {
	cacheKey := contextWindowCacheKey(prepared, request)
	if cacheKey != "" && e != nil && e.contextWindows != nil {
		if cached, ok := e.contextWindows.Load(cacheKey); ok && cached.resolved {
			return cloneIntPointer(cached.value)
		}
	}
	contextWindowTokens, cacheable := fetchAuthoritativeContextWindow(ctx, prepared, request)
	if cacheable && cacheKey != "" && e != nil && e.contextWindows != nil {
		e.contextWindows.Store(cacheKey, contextWindowTokens)
	}
	return cloneIntPointer(contextWindowTokens)
}

func contextWindowCacheKey(prepared preparedExecution, request agentruns.ExecutionRequest) string {
	model := strings.TrimSpace(prepared.model)
	if model == "" {
		return ""
	}
	switch prepared.provider {
	case openAIProvider:
		if isAzureOpenAIProvider(resolveProviderHint(request)) {
			return ""
		}
		return fmt.Sprintf("%s|%s|%s", prepared.provider, resolveOpenAIBaseURL(request), model)
	case anthropicProvider:
		return fmt.Sprintf("%s|%s|%s", prepared.provider, resolveAnthropicBaseURL(request), model)
	case geminiProvider:
		return fmt.Sprintf("%s|%s|%s", prepared.provider, resolveGeminiBaseURL(request), model)
	default:
		return ""
	}
}

func fetchAuthoritativeContextWindow(
	ctx context.Context,
	prepared preparedExecution,
	request agentruns.ExecutionRequest,
) (*int, bool) {
	if strings.TrimSpace(prepared.model) == "" {
		return nil, true
	}
	lookupCtx, cancel := context.WithTimeout(ctx, contextWindowLookupTimeout)
	defer cancel()
	switch prepared.provider {
	case openAIProvider:
		return fetchOpenAIContextWindow(lookupCtx, prepared, request)
	case anthropicProvider:
		return fetchAnthropicContextWindow(lookupCtx, prepared)
	case geminiProvider:
		return fetchGeminiContextWindow(lookupCtx, prepared)
	default:
		return nil, true
	}
}

func fetchOpenAIContextWindow(
	ctx context.Context,
	prepared preparedExecution,
	request agentruns.ExecutionRequest,
) (*int, bool) {
	if isAzureOpenAIProvider(resolveProviderHint(request)) ||
		isNormalizedProviderBaseURL(resolveOpenAIBaseURL(request), defaultOpenAIBaseURL) {
		return nil, true
	}
	model, err := prepared.openAIClient.Models.Get(ctx, prepared.model)
	if err != nil || model == nil {
		return nil, false
	}
	return extractTokenCountFromRawJSON(model.RawJSON(), contextWindowTokenAliases, false), true
}

func fetchAnthropicContextWindow(ctx context.Context, prepared preparedExecution) (*int, bool) {
	model, err := prepared.anthropicClient.Models.Get(
		ctx,
		prepared.model,
		anthropic.ModelGetParams{},
	)
	if err != nil || model == nil {
		return nil, false
	}
	return extractTokenCountFromRawJSON(model.RawJSON(), contextWindowTokenAliases, false), true
}

func fetchGeminiContextWindow(ctx context.Context, prepared preparedExecution) (*int, bool) {
	if prepared.geminiClient == nil {
		return nil, true
	}
	model, err := prepared.geminiClient.Models.Get(ctx, prepared.model, &genai.GetModelConfig{})
	if err != nil || model == nil {
		return nil, false
	}
	if model.InputTokenLimit > 0 {
		value := int(model.InputTokenLimit)
		return &value, true
	}
	return extractTokenCountFromMap(cloneAnyMap(mustJSONMap(model)), contextWindowTokenAliases, false), true
}

func extractTokenCountFromRawJSON(rawJSON string, aliases []string, allowZero bool) *int {
	trimmed := strings.TrimSpace(rawJSON)
	if trimmed == "" {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(trimmed), &payload); err != nil {
		return nil
	}
	return extractTokenCountFromMap(payload, aliases, allowZero)
}

func extractTokenCountFromMap(payload map[string]any, aliases []string, allowZero bool) *int {
	if payload == nil {
		return nil
	}
	for _, alias := range aliases {
		value, ok := payload[alias]
		if !ok {
			continue
		}
		parsed := extractNonNegativeUsageInt(value)
		if parsed == nil {
			continue
		}
		if !allowZero && *parsed <= 0 {
			continue
		}
		return parsed
	}
	return nil
}

func extractNonNegativeUsageInt(raw any) *int {
	switch value := raw.(type) {
	case bool:
		return nil
	case int:
		return pointerIfNonNegative(value)
	case int32:
		return pointerIfNonNegative(int(value))
	case int64:
		return pointerIfNonNegative(int(value))
	case float64:
		return nonNegativeIntegralFloat(value)
	case string:
		return nonNegativeStringInt(value)
	default:
		return nil
	}
}

func pointerIfNonNegative(value int) *int {
	if value < 0 {
		return nil
	}
	return &value
}

func nonNegativeIntegralFloat(value float64) *int {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || math.Trunc(value) != value {
		return nil
	}
	return pointerIfNonNegative(int(value))
}

func nonNegativeStringInt(value string) *int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	parsed, err := strconv.Atoi(trimmed)
	if err != nil {
		return nil
	}
	return pointerIfNonNegative(parsed)
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func mustJSONMap(value any) map[string]any {
	content, err := json.Marshal(value)
	if err != nil {
		return map[string]any{}
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return map[string]any{}
	}
	return payload
}

func isNormalizedProviderBaseURL(actual string, expected string) bool {
	normalizedActual := strings.TrimRight(strings.TrimSpace(actual), "/")
	normalizedExpected := strings.TrimRight(strings.TrimSpace(expected), "/")
	if normalizedActual == "" || normalizedExpected == "" {
		return false
	}
	return normalizedActual == normalizedExpected
}
