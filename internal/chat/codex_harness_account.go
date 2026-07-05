package chat

import "fmt"

var codexAccountAuthModes = map[string]struct{}{
	"agentIdentity":     {},
	"apikey":            {},
	"chatgpt":           {},
	"chatgptAuthTokens": {},
}

var codexAccountPlanTypes = map[string]struct{}{
	"business":                        {},
	"edu":                             {},
	"enterprise":                      {},
	"enterprise_cbp_usage_based":      {},
	"free":                            {},
	"go":                              {},
	"plus":                            {},
	"pro":                             {},
	"prolite":                         {},
	"self_serve_business_usage_based": {},
	"team":                            {},
	"unknown":                         {},
}

func handleCodexAccountUpdated(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex account updated params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	authMode, err := optionalString(params, "authMode", "codex account updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if authMode != "" {
		if _, ok := codexAccountAuthModes[authMode]; !ok {
			return codexNotificationResult{}, fmt.Errorf("unsupported codex account auth mode: %s", authMode)
		}
	}
	planType, err := optionalString(params, "planType", "codex account updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if planType != "" {
		if _, ok := codexAccountPlanTypes[planType]; !ok {
			return codexNotificationResult{}, fmt.Errorf("unsupported codex account plan type: %s", planType)
		}
	}
	return codexNotificationResult{}, sink.Trace("codex_account_updated", codexAccountUpdateTrace(authMode, planType))
}

func codexAccountUpdateTrace(authMode string, planType string) string {
	if authMode == "" && planType == "" {
		return "account updated"
	}
	if authMode == "" {
		return "plan=" + planType
	}
	if planType == "" {
		return "auth=" + authMode
	}
	return "auth=" + authMode + " plan=" + planType
}

func handleCodexAccountRateLimitsUpdated(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex account rate limits params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	rateLimits, err := requireObject(params, "rateLimits", "codex account rate limits")
	if err != nil {
		return codexNotificationResult{}, err
	}
	limitID, err := optionalString(rateLimits, "limitId", "codex account rate limits rateLimits")
	if err != nil {
		return codexNotificationResult{}, err
	}
	limitName, err := optionalString(rateLimits, "limitName", "codex account rate limits rateLimits")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_account_rate_limits_updated", codexAccountRateLimitsTrace(limitID, limitName))
}

func codexAccountRateLimitsTrace(limitID string, limitName string) string {
	if limitID == "" && limitName == "" {
		return "rate limits updated"
	}
	if limitID == "" {
		return limitName
	}
	if limitName == "" {
		return limitID
	}
	return limitID + " " + limitName
}
