package externalagents

import (
	"fmt"
	"strings"
)

func buildCodexTurnParams(request StartRequest, prompt string, threadID string, workingDir string) (map[string]any, error) {
	params := map[string]any{
		"threadId": threadID,
		"input": []any{
			map[string]any{
				"type": "text",
				"text": prompt,
			},
		},
		"cwd": workingDir,
	}
	if model := strings.TrimSpace(stringValue(request.Inputs["model"])); model != "" {
		params["model"] = model
	} else if model := strings.TrimSpace(derefOptionalString(request.ExternalConfig.DefaultModel)); model != "" {
		params["model"] = model
	}
	if effort := strings.TrimSpace(stringValue(request.Inputs["effort"])); effort != "" {
		params["effort"] = effort
	}
	if summary := strings.TrimSpace(stringValue(request.Inputs["summary"])); summary != "" {
		params["summary"] = summary
	}
	if approvalPolicy := strings.TrimSpace(mapCodexApprovalPolicy(stringValue(request.Inputs["approvalPolicy"]), derefOptionalString(request.ExternalConfig.ApprovalPolicy))); approvalPolicy != "" {
		params["approvalPolicy"] = approvalPolicy
	}
	if sandboxPolicy := buildCodexSandboxPolicy(stringValue(request.Inputs["sandboxPolicy"]), derefOptionalString(request.ExternalConfig.SandboxPolicy)); sandboxPolicy != nil {
		params["sandboxPolicy"] = sandboxPolicy
	}
	if rawOutputSchema, ok := request.Inputs["outputSchema"]; ok && rawOutputSchema != nil {
		outputSchema, ok := rawOutputSchema.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("codex outputSchema must be a JSON object")
		}
		params["outputSchema"] = cloneAnyMap(outputSchema)
	}
	return params, nil
}

func captureCodexTokenUsageEvent(eventState *codexEventState, payload map[string]any) map[string]any {
	if strings.TrimSpace(stringValue(payload["method"])) != codexTokenUsageMethod {
		return nil
	}
	usagePayload := normalizeCodexUsageNotificationPayload(payload)
	if usagePayload == nil {
		return nil
	}
	if eventState != nil && !eventState.setUsagePayload(usagePayload) {
		return nil
	}
	return usagePayload
}

func normalizeCodexUsageNotificationPayload(payload map[string]any) map[string]any {
	if payload == nil {
		return nil
	}
	if params, ok := mapValue(payload["params"]); ok && params != nil {
		if normalized := normalizeCodexUsagePayloadMap(params); normalized != nil {
			return normalized
		}
	}
	return normalizeCodexUsagePayloadMap(payload)
}

func normalizeCodexUsagePayloadMap(candidate map[string]any) map[string]any {
	if candidate == nil {
		return nil
	}
	if tokenUsage, ok := mapValue(candidate["tokenUsage"]); ok && tokenUsage != nil {
		return normalizeCodexTokenUsage(tokenUsage)
	}
	if usage, ok := mapValue(candidate["usage"]); ok && usage != nil {
		return cloneAnyMap(usage)
	}

	normalized := map[string]any{}
	for _, key := range []string{
		"usedTokens",
		"windowTokens",
		"inputTokens",
		"promptTokens",
		"completionTokens",
		"outputTokens",
		"totalTokens",
		"contextUsedTokens",
		"contextWindowTokens",
	} {
		if value := deepCloneJSONValue(candidate[key]); value != nil {
			normalized[key] = value
		}
	}
	if normalized["contextWindowTokens"] == nil {
		if value := deepCloneJSONValue(candidate["modelContextWindow"]); value != nil {
			normalized["contextWindowTokens"] = value
		}
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func normalizeCodexTokenUsage(tokenUsage map[string]any) map[string]any {
	if tokenUsage == nil {
		return nil
	}
	normalized := map[string]any{}
	if total, ok := mapValue(tokenUsage["total"]); ok && total != nil {
		copyClonedTokenUsageValues(
			normalized,
			total,
			"inputTokens",
			"promptTokens",
			"outputTokens",
			"completionTokens",
			"totalTokens",
		)
	}
	if last, ok := mapValue(tokenUsage["last"]); ok && last != nil {
		copyFirstClonedTokenUsageValue(
			normalized,
			last,
			"contextUsedTokens",
			"contextUsedTokens",
			"inputTokens",
			"promptTokens",
			"usedTokens",
		)
	}
	copyFirstClonedTokenUsageValue(
		normalized,
		tokenUsage,
		"contextWindowTokens",
		"contextWindowTokens",
		"windowTokens",
		"modelContextWindow",
	)
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func copyClonedTokenUsageValues(destination map[string]any, source map[string]any, keys ...string) {
	for _, key := range keys {
		if value := deepCloneJSONValue(source[key]); value != nil {
			destination[key] = value
		}
	}
}

func copyFirstClonedTokenUsageValue(
	destination map[string]any,
	source map[string]any,
	destinationKey string,
	sourceKeys ...string,
) {
	if destination[destinationKey] != nil {
		return
	}
	for _, key := range sourceKeys {
		if value := deepCloneJSONValue(source[key]); value != nil {
			destination[destinationKey] = value
			return
		}
	}
}
