package mcpx

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/projectview"
	"setta/internal/tools"
)

const (
	AgenticContextProjectConfigIDHeader  = "x-setta-project-config-id"
	AgenticContextChatIDHeader           = "x-setta-chat-id"
	AgenticContextSectionIDHeader        = "x-setta-section-id"
	AgenticContextFrontendAffinityHeader = "x-setta-frontend-affinity-token"
	AgenticContextAllowUnscopedHeader    = "x-setta-allow-unscoped"
	scopeViolationErrorCode              = "scope_violation"
	projectNotFoundErrorCode             = "project_not_found"
	agenticEdgeKindChatChat              = "chat_chat"
	agenticEdgeKindSectionChat           = "section_chat"
	agenticEdgeKindChatSection           = "chat_section"
)

type AgenticContext struct {
	ProjectConfigID       string `json:"projectConfigId"`
	ChatID                string `json:"chatId,omitempty"`
	SectionID             string `json:"sectionId,omitempty"`
	FrontendAffinityToken string `json:"frontendAffinityToken,omitempty"`
	AllowUnscoped         bool   `json:"allowUnscoped,omitempty"`
}

type AgenticScope struct {
	ReadSectionIDs     map[string]struct{}
	WriteSectionIDs    map[string]struct{}
	ContextSectionIDs  map[string]struct{}
	PeerChatSectionIDs map[string]struct{}
	StructuralAllowed  bool
}

type ToolInvocationContext struct {
	SessionKey     string
	AgenticContext *AgenticContext
	Scope          *AgenticScope
	ProjectView    *projectview.SingleConfig
}

type ToolRequestContext struct {
	SessionKey string
	Headers    http.Header
	Meta       map[string]any
}

type scopeCheckResult struct {
	Allowed           bool
	Reason            string
	TargetSectionIDs  []string
	BlockedSectionIDs []string
}

type toolInvocationContextKey struct{}

func contextWithToolInvocation(ctx context.Context, invocation ToolInvocationContext) context.Context {
	return context.WithValue(ctx, toolInvocationContextKey{}, invocation)
}

func ToolInvocationFromContext(ctx context.Context) (ToolInvocationContext, bool) {
	if ctx == nil {
		return ToolInvocationContext{}, false
	}
	invocation, ok := ctx.Value(toolInvocationContextKey{}).(ToolInvocationContext)
	return invocation, ok
}

func requestContextFromSDK(req *sdkmcp.CallToolRequest) ToolRequestContext {
	requestContext := ToolRequestContext{
		Headers: http.Header{},
		Meta:    map[string]any{},
	}
	if req == nil {
		return requestContext
	}
	if req.Session != nil {
		requestContext.SessionKey = sessionKey(req.Session)
	}
	if req.Params != nil && req.Params.Meta != nil {
		requestContext.Meta = copyMetaMap(req.Params.Meta)
	}
	if req.GetExtra() != nil && req.GetExtra().Header != nil {
		requestContext.Headers = req.GetExtra().Header.Clone()
	}
	return requestContext
}

func copyMetaMap(source map[string]any) map[string]any {
	if len(source) == 0 {
		return map[string]any{}
	}
	copied := make(map[string]any, len(source))
	for key, value := range source {
		copied[key] = value
	}
	return copied
}

func sessionKey(session *sdkmcp.ServerSession) string {
	if session == nil {
		return ""
	}
	if id := strings.TrimSpace(session.ID()); id != "" {
		return id
	}
	return fmt.Sprintf("session:%p", session)
}

func resolveAgenticContext(requestContext ToolRequestContext, sessionContext *AgenticContext) (*AgenticContext, error) {
	projectConfigID, err := resolveAgenticContextString(
		requestContext.Meta,
		"projectConfigId",
		requestContext.Headers,
		AgenticContextProjectConfigIDHeader,
		sessionContextField(sessionContext, func(value AgenticContext) string { return value.ProjectConfigID }),
		false,
	)
	if err != nil {
		return nil, err
	}
	chatID, err := resolveAgenticContextString(
		requestContext.Meta,
		"chatId",
		requestContext.Headers,
		AgenticContextChatIDHeader,
		sessionContextField(sessionContext, func(value AgenticContext) string { return value.ChatID }),
		false,
	)
	if err != nil {
		return nil, err
	}
	sectionID, err := resolveAgenticContextString(
		requestContext.Meta,
		"sectionId",
		requestContext.Headers,
		AgenticContextSectionIDHeader,
		sessionContextField(sessionContext, func(value AgenticContext) string { return value.SectionID }),
		false,
	)
	if err != nil {
		return nil, err
	}
	frontendAffinityToken, err := resolveAgenticContextString(
		requestContext.Meta,
		"frontendAffinityToken",
		requestContext.Headers,
		AgenticContextFrontendAffinityHeader,
		sessionContextField(sessionContext, func(value AgenticContext) string { return value.FrontendAffinityToken }),
		true,
	)
	if err != nil {
		return nil, err
	}
	allowUnscoped, err := resolveAllowUnscoped(
		requestContext.Meta,
		requestContext.Headers,
		sessionContextBool(sessionContext, func(value AgenticContext) bool { return value.AllowUnscoped }),
	)
	if err != nil {
		return nil, err
	}

	if projectConfigID == "" && chatID == "" && sectionID == "" && frontendAffinityToken == "" && !allowUnscoped {
		return nil, nil
	}
	return &AgenticContext{
		ProjectConfigID:       projectConfigID,
		ChatID:                chatID,
		SectionID:             sectionID,
		FrontendAffinityToken: frontendAffinityToken,
		AllowUnscoped:         allowUnscoped,
	}, nil
}

func resolveAgenticContextString(
	meta map[string]any,
	metaKey string,
	headers http.Header,
	headerKey string,
	sessionValue string,
	rejectBlank bool,
) (string, error) {
	if metaValue, ok, err := readMetaString(meta, metaKey, rejectBlank); ok || err != nil {
		return metaValue, err
	}
	if headerValue, ok, err := readHeaderString(headers, headerKey, rejectBlank); ok || err != nil {
		return headerValue, err
	}
	return strings.TrimSpace(sessionValue), nil
}

func resolveAllowUnscoped(meta map[string]any, headers http.Header, sessionValue bool) (bool, error) {
	if value, ok, err := readMetaBool(meta, "allowUnscoped"); ok || err != nil {
		return value, err
	}
	if value, ok, err := readHeaderBool(headers, AgenticContextAllowUnscopedHeader); ok || err != nil {
		return value, err
	}
	return sessionValue, nil
}

func readMetaString(meta map[string]any, key string, rejectBlank bool) (string, bool, error) {
	if len(meta) == 0 {
		return "", false, nil
	}
	rawValue, ok := meta[key]
	if !ok || rawValue == nil {
		return "", false, nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", true, newToolError("invalid_arguments", "%s metadata must be a string", key)
	}
	trimmed := strings.TrimSpace(value)
	if rejectBlank && trimmed == "" {
		return "", true, newToolError("invalid_arguments", "%s must be a non-empty string when provided", key)
	}
	return trimmed, true, nil
}

func readHeaderString(headers http.Header, key string, rejectBlank bool) (string, bool, error) {
	if headers == nil {
		return "", false, nil
	}
	value := strings.TrimSpace(headers.Get(key))
	if value == "" {
		return "", false, nil
	}
	if rejectBlank && value == "" {
		return "", true, newToolError("invalid_arguments", "%s must be a non-empty string when provided", key)
	}
	return value, true, nil
}

func readMetaBool(meta map[string]any, key string) (bool, bool, error) {
	if len(meta) == 0 {
		return false, false, nil
	}
	rawValue, ok := meta[key]
	if !ok || rawValue == nil {
		return false, false, nil
	}
	switch typed := rawValue.(type) {
	case bool:
		return typed, true, nil
	case string:
		return parseBoolString(typed, key+" metadata")
	default:
		return false, true, newToolError("invalid_arguments", "%s metadata must be a boolean", key)
	}
}

func readHeaderBool(headers http.Header, key string) (bool, bool, error) {
	if headers == nil {
		return false, false, nil
	}
	value := strings.TrimSpace(headers.Get(key))
	if value == "" {
		return false, false, nil
	}
	parsed, _, err := parseBoolString(value, key+" header")
	return parsed, true, err
}

func parseBoolString(value string, label string) (bool, bool, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes":
		return true, true, nil
	case "false", "0", "no":
		return false, true, nil
	default:
		return false, true, newToolError("invalid_arguments", "%s must be true or false", label)
	}
}

func sessionContextField(session *AgenticContext, getter func(AgenticContext) string) string {
	if session == nil {
		return ""
	}
	return getter(*session)
}

func sessionContextBool(session *AgenticContext, getter func(AgenticContext) bool) bool {
	if session == nil {
		return false
	}
	return getter(*session)
}

func resolveAgenticScope(projectState projectview.SingleConfig, chatSectionID string, allowUnscoped bool) (AgenticScope, error) {
	if strings.TrimSpace(chatSectionID) == "" {
		if !allowUnscoped {
			return AgenticScope{}, nil
		}
		allSectionIDs := make(map[string]struct{}, len(projectState.Sections))
		peerChatSectionIDs := map[string]struct{}{}
		for sectionID := range projectState.Sections {
			allSectionIDs[sectionID] = struct{}{}
		}
		for _, edge := range projectState.ProjectConfig.AgenticEdges {
			if edge.Kind == agenticEdgeKindChatChat {
				if _, ok := projectState.Sections[edge.SourceSectionID]; ok {
					peerChatSectionIDs[edge.SourceSectionID] = struct{}{}
				}
				if _, ok := projectState.Sections[edge.TargetSectionID]; ok {
					peerChatSectionIDs[edge.TargetSectionID] = struct{}{}
				}
			}
		}
		return AgenticScope{
			ReadSectionIDs:     allSectionIDs,
			WriteSectionIDs:    cloneStringSet(allSectionIDs),
			ContextSectionIDs:  cloneStringSet(allSectionIDs),
			PeerChatSectionIDs: peerChatSectionIDs,
			StructuralAllowed:  true,
		}, nil
	}
	if _, ok := projectState.Sections[chatSectionID]; !ok {
		return AgenticScope{}, newToolErrorWithData(
			scopeViolationErrorCode,
			"Chat section %q was not found in project %q.",
			map[string]any{
				"reason":           "unknown_chat_section",
				"targetSectionIds": []string{chatSectionID},
			},
			chatSectionID,
			projectState.ProjectConfig.ID,
		)
	}

	scope := AgenticScope{
		ReadSectionIDs:     map[string]struct{}{},
		WriteSectionIDs:    map[string]struct{}{},
		ContextSectionIDs:  map[string]struct{}{},
		PeerChatSectionIDs: map[string]struct{}{},
	}
	for _, edge := range projectState.ProjectConfig.AgenticEdges {
		switch edge.Kind {
		case agenticEdgeKindSectionChat:
			if edge.TargetSectionID != chatSectionID {
				continue
			}
			scope.ReadSectionIDs[edge.SourceSectionID] = struct{}{}
			scope.ContextSectionIDs[edge.SourceSectionID] = struct{}{}
		case agenticEdgeKindChatSection:
			if edge.SourceSectionID != chatSectionID {
				continue
			}
			scope.ReadSectionIDs[edge.TargetSectionID] = struct{}{}
			scope.WriteSectionIDs[edge.TargetSectionID] = struct{}{}
		case agenticEdgeKindChatChat:
			if edge.SourceSectionID == chatSectionID {
				scope.PeerChatSectionIDs[edge.TargetSectionID] = struct{}{}
				continue
			}
			if edge.TargetSectionID == chatSectionID {
				scope.PeerChatSectionIDs[edge.SourceSectionID] = struct{}{}
			}
		}
	}
	return scope, nil
}

func (s AgenticScope) effectiveReadSectionIDs() map[string]struct{} {
	effective := cloneStringSet(s.ReadSectionIDs)
	for sectionID := range s.PeerChatSectionIDs {
		effective[sectionID] = struct{}{}
	}
	return effective
}

func cloneStringSet(values map[string]struct{}) map[string]struct{} {
	if len(values) == 0 {
		return map[string]struct{}{}
	}
	cloned := make(map[string]struct{}, len(values))
	for key := range values {
		cloned[key] = struct{}{}
	}
	return cloned
}

func checkAgenticScope(metadata tools.Metadata, scope AgenticScope, arguments map[string]any) scopeCheckResult {
	targetSectionIDs := extractedTargetSectionIDs(metadata, arguments)
	switch metadata.AccessType {
	case tools.AccessTypeStructural:
		if scope.StructuralAllowed {
			return scopeCheckResult{
				Allowed:          true,
				Reason:           "structural",
				TargetSectionIDs: targetSectionIDs,
			}
		}
		return scopeCheckResult{
			Allowed:           false,
			Reason:            "structural_denied",
			TargetSectionIDs:  targetSectionIDs,
			BlockedSectionIDs: targetSectionIDs,
		}
	case tools.AccessTypeWrite:
		if len(targetSectionIDs) == 0 {
			if scope.StructuralAllowed {
				return scopeCheckResult{Allowed: true, Reason: "write_without_targets_allowed"}
			}
			return scopeCheckResult{Allowed: false, Reason: "write_without_targets"}
		}
		if len(scope.WriteSectionIDs) == 0 {
			return scopeCheckResult{
				Allowed:           false,
				Reason:            "empty_scope",
				TargetSectionIDs:  targetSectionIDs,
				BlockedSectionIDs: targetSectionIDs,
			}
		}
		blockedSectionIDs := blockedTargetSectionIDs(targetSectionIDs, scope.WriteSectionIDs)
		return scopeCheckResult{
			Allowed:           len(blockedSectionIDs) == 0,
			Reason:            scopeReasonForBlockedIDs(blockedSectionIDs, "allowed"),
			TargetSectionIDs:  targetSectionIDs,
			BlockedSectionIDs: blockedSectionIDs,
		}
	case tools.AccessTypeRead:
		if len(targetSectionIDs) > 0 {
			allowedSectionIDs := scope.effectiveReadSectionIDs()
			if len(allowedSectionIDs) == 0 {
				return scopeCheckResult{
					Allowed:           false,
					Reason:            "empty_scope",
					TargetSectionIDs:  targetSectionIDs,
					BlockedSectionIDs: targetSectionIDs,
				}
			}
			blockedSectionIDs := blockedTargetSectionIDs(targetSectionIDs, allowedSectionIDs)
			return scopeCheckResult{
				Allowed:           len(blockedSectionIDs) == 0,
				Reason:            scopeReasonForBlockedIDs(blockedSectionIDs, "allowed"),
				TargetSectionIDs:  targetSectionIDs,
				BlockedSectionIDs: blockedSectionIDs,
			}
		}
		if len(scope.effectiveReadSectionIDs()) == 0 {
			return scopeCheckResult{Allowed: false, Reason: "empty_scope"}
		}
		return scopeCheckResult{Allowed: true, Reason: "read_without_targets"}
	default:
		return scopeCheckResult{Allowed: false, Reason: "invalid_access_type"}
	}
}

func extractedTargetSectionIDs(metadata tools.Metadata, arguments map[string]any) []string {
	if len(arguments) == 0 || len(metadata.IDPathsByType) == 0 {
		return nil
	}
	idsByType := extractIDsByType(arguments, metadata.IDPathsByType, true)
	sectionIDs := idsByType[tools.IDTypeSection]
	if len(sectionIDs) == 0 {
		return nil
	}
	return sortedStringSet(sectionIDs)
}

func blockedTargetSectionIDs(targetSectionIDs []string, allowedSectionIDs map[string]struct{}) []string {
	if len(targetSectionIDs) == 0 {
		return nil
	}
	blocked := make([]string, 0, len(targetSectionIDs))
	for _, sectionID := range targetSectionIDs {
		if _, ok := allowedSectionIDs[sectionID]; ok {
			continue
		}
		blocked = append(blocked, sectionID)
	}
	return blocked
}

func scopeReasonForBlockedIDs(blockedSectionIDs []string, allowedReason string) string {
	if len(blockedSectionIDs) == 0 {
		return allowedReason
	}
	return "out_of_scope"
}

func buildScopeViolationError(toolName string, reason string, blockedSectionIDs []string, targetSectionIDs []string) error {
	payload := map[string]any{
		"reason": reason,
	}
	if len(blockedSectionIDs) > 0 {
		payload["blockedSectionIds"] = sortedStrings(blockedSectionIDs)
	}
	if len(targetSectionIDs) > 0 {
		payload["targetSectionIds"] = sortedStrings(targetSectionIDs)
	}

	message := "Tool call is outside the allowed agentic scope."
	switch reason {
	case "missing_context":
		message = fmt.Sprintf("Tool %q requires agentic context.", toolName)
	case "missing_section_id":
		message = fmt.Sprintf("Tool %q requires a sectionId in agentic context.", toolName)
	case "empty_scope":
		message = fmt.Sprintf("Tool %q has no readable sections in the resolved agentic scope.", toolName)
	case "structural_denied":
		message = fmt.Sprintf("Tool %q requires unscoped structural access.", toolName)
	case "write_without_targets":
		message = fmt.Sprintf("Tool %q requires structural access for untargeted writes.", toolName)
	}
	return newToolErrorWithData(scopeViolationErrorCode, "%s", payload, message)
}

func sortedStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	copied := append([]string(nil), values...)
	sort.Strings(copied)
	return copied
}

func sortedStringSet(values map[string]struct{}) []string {
	if len(values) == 0 {
		return nil
	}
	sorted := make([]string, 0, len(values))
	for value := range values {
		sorted = append(sorted, value)
	}
	sort.Strings(sorted)
	return sorted
}
