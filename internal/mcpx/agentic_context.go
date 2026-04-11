package mcpx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/modes"
	"setta/internal/projectview"
	"setta/internal/tools"
)

const (
	AgenticContextProjectConfigIDHeader  = "x-setta-project-config-id"
	AgenticContextChatIDHeader           = "x-setta-chat-id"
	AgenticContextRunIDHeader            = "x-setta-run-id"
	AgenticContextSectionIDHeader        = "x-setta-section-id"
	AgenticContextFrontendAffinityHeader = "x-setta-frontend-affinity-token"
	AgenticContextAllowUnscopedHeader    = "x-setta-allow-unscoped"
	AgenticContextLinkedChatDepthHeader  = "x-setta-linked-chat-depth"
	AgenticContextLinkedChatChainHeader  = "x-setta-linked-chat-chain-section-ids"
	scopeViolationErrorCode              = "scope_violation"
	projectNotFoundErrorCode             = "project_not_found"
	agenticEdgeKindChatChat              = "chat_chat"
	agenticEdgeKindSectionChat           = "section_chat"
	agenticEdgeKindChatSection           = "chat_section"
	accessTypePeerChat                   = "peer_chat"
)

type AgenticContext struct {
	ProjectConfigID       string `json:"projectConfigId"`
	ShareSessionID        string `json:"shareSessionId,omitempty"`
	ChatID                string `json:"chatId,omitempty"`
	RunID                 string `json:"runId,omitempty"`
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
	SessionKey                   string
	Headers                      http.Header
	Meta                         map[string]any
	AllowRequestMetaShareSession bool
}

type scopeCheckResult struct {
	Allowed            bool
	Reason             string
	TargetSectionIDs   []string
	BlockedSectionIDs  []string
	UnmappedCodeObjIDs []string
}

type scopeViolationMissingEdge struct {
	SourceSectionID string `json:"sourceSectionId"`
	TargetSectionID string `json:"targetSectionId"`
	Kind            string `json:"kind"`
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

type agenticContextStringField struct {
	metaKey      string
	headerKey    string
	sessionValue string
	rejectBlank  bool
	setValue     func(*AgenticContext, string)
}

func resolveAgenticContext(requestContext ToolRequestContext, sessionContext *AgenticContext) (*AgenticContext, error) {
	resolved, err := resolvePrimaryAgenticContext(requestContext, sessionContext)
	if err != nil {
		return nil, err
	}
	resolved.FrontendAffinityToken = resolveFrontendAffinityToken(
		requestContext.Meta,
		requestContext.Headers,
		sessionContextField(sessionContext, func(value AgenticContext) string { return value.FrontendAffinityToken }),
	)
	resolved.AllowUnscoped, err = resolveAllowUnscoped(
		requestContext.Meta,
		requestContext.Headers,
		sessionContextBool(sessionContext, func(value AgenticContext) bool { return value.AllowUnscoped }),
	)
	if err != nil {
		return nil, err
	}
	if resolved.isEmpty() {
		return nil, nil
	}
	return &resolved, nil
}

func resolvePrimaryAgenticContext(requestContext ToolRequestContext, sessionContext *AgenticContext) (AgenticContext, error) {
	fields := []agenticContextStringField{
		{
			metaKey:      "projectConfigId",
			headerKey:    AgenticContextProjectConfigIDHeader,
			sessionValue: sessionContextField(sessionContext, func(value AgenticContext) string { return value.ProjectConfigID }),
			setValue: func(context *AgenticContext, value string) {
				context.ProjectConfigID = value
			},
		},
		{
			metaKey:      "chatId",
			headerKey:    AgenticContextChatIDHeader,
			sessionValue: sessionContextField(sessionContext, func(value AgenticContext) string { return value.ChatID }),
			setValue: func(context *AgenticContext, value string) {
				context.ChatID = value
			},
		},
		{
			metaKey:      "runId",
			headerKey:    AgenticContextRunIDHeader,
			sessionValue: sessionContextField(sessionContext, func(value AgenticContext) string { return value.RunID }),
			setValue: func(context *AgenticContext, value string) {
				context.RunID = value
			},
		},
		{
			metaKey:      "sectionId",
			headerKey:    AgenticContextSectionIDHeader,
			sessionValue: sessionContextField(sessionContext, func(value AgenticContext) string { return value.SectionID }),
			setValue: func(context *AgenticContext, value string) {
				context.SectionID = value
			},
		},
	}

	resolved := AgenticContext{}
	for _, field := range fields {
		value, err := resolveAgenticContextString(
			requestContext.Meta,
			field.metaKey,
			requestContext.Headers,
			field.headerKey,
			field.sessionValue,
			field.rejectBlank,
		)
		if err != nil {
			return AgenticContext{}, err
		}
		field.setValue(&resolved, value)
	}

	shareSessionID, err := resolveAgenticContextShareSessionID(
		requestContext.Meta,
		requestContext.Headers,
		sessionContextField(sessionContext, func(value AgenticContext) string { return value.ShareSessionID }),
		requestContext.AllowRequestMetaShareSession,
	)
	if err != nil {
		return AgenticContext{}, err
	}
	resolved.ShareSessionID = shareSessionID
	return resolved, nil
}

func (context AgenticContext) isEmpty() bool {
	return context.ProjectConfigID == "" &&
		context.ShareSessionID == "" &&
		context.ChatID == "" &&
		context.RunID == "" &&
		context.SectionID == "" &&
		context.FrontendAffinityToken == "" &&
		!context.AllowUnscoped
}

func resolveAgenticContextString(
	meta map[string]any,
	metaKey string,
	headers http.Header,
	headerKey string,
	sessionValue string,
	rejectBlank bool,
) (string, error) {
	if trimmedSessionValue := strings.TrimSpace(sessionValue); trimmedSessionValue != "" {
		return trimmedSessionValue, nil
	}
	if metaValue, ok, err := readMetaString(meta, metaKey, rejectBlank); ok || err != nil {
		return metaValue, err
	}
	if headerValue, ok, err := readHeaderString(headers, headerKey, rejectBlank); ok || err != nil {
		return headerValue, err
	}
	return "", nil
}

func resolveAgenticContextShareSessionID(
	meta map[string]any,
	headers http.Header,
	sessionValue string,
	allowRequestFallback bool,
) (string, error) {
	if trimmedSessionValue := strings.TrimSpace(sessionValue); trimmedSessionValue != "" {
		return trimmedSessionValue, nil
	}
	if !allowRequestFallback {
		return "", nil
	}
	if metaValue, ok, err := readMetaString(meta, "shareSessionId", false); ok || err != nil {
		return metaValue, err
	}
	if headerValue, ok, err := readHeaderString(headers, modes.ShareSessionHeaderName, false); ok || err != nil {
		return headerValue, err
	}
	return "", nil
}

func resolveFrontendAffinityToken(meta map[string]any, headers http.Header, sessionValue string) string {
	if trimmedSessionValue := strings.TrimSpace(sessionValue); trimmedSessionValue != "" {
		return trimmedSessionValue
	}
	if metaValue, ok := readBestEffortMetaString(meta, "frontendAffinityToken"); ok {
		return metaValue
	}
	if headerValue, ok := readBestEffortHeaderString(headers, AgenticContextFrontendAffinityHeader); ok {
		return headerValue
	}
	return ""
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

func readBestEffortMetaString(meta map[string]any, key string) (string, bool) {
	if len(meta) == 0 {
		return "", false
	}
	rawValue, ok := meta[key]
	if !ok || rawValue == nil {
		return "", false
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", false
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", false
	}
	return trimmed, true
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

func readBestEffortHeaderString(headers http.Header, key string) (string, bool) {
	if headers == nil {
		return "", false
	}
	value := strings.TrimSpace(headers.Get(key))
	if value == "" {
		return "", false
	}
	return value, true
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
	if allowUnscoped {
		allSectionIDs := make(map[string]struct{}, len(projectState.Sections))
		for sectionID := range projectState.Sections {
			allSectionIDs[sectionID] = struct{}{}
		}
		return AgenticScope{
			ReadSectionIDs:     allSectionIDs,
			WriteSectionIDs:    cloneStringSet(allSectionIDs),
			ContextSectionIDs:  cloneStringSet(allSectionIDs),
			PeerChatSectionIDs: map[string]struct{}{},
			StructuralAllowed:  true,
		}, nil
	}
	if strings.TrimSpace(chatSectionID) == "" {
		return AgenticScope{}, nil
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
		case agenticEdgeKindChatSection:
			if edge.SourceSectionID != chatSectionID {
				continue
			}
			scope.ReadSectionIDs[edge.TargetSectionID] = struct{}{}
			scope.WriteSectionIDs[edge.TargetSectionID] = struct{}{}
			scope.ContextSectionIDs[edge.TargetSectionID] = struct{}{}
		case agenticEdgeKindChatChat:
			if edge.SourceSectionID == chatSectionID {
				scope.PeerChatSectionIDs[edge.TargetSectionID] = struct{}{}
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

func checkAgenticScope(
	metadata tools.Metadata,
	scope AgenticScope,
	arguments map[string]any,
	projectView *projectview.SingleConfig,
) (scopeCheckResult, error) {
	targets, err := resolveToolTargets(metadata, arguments, projectView)
	if err != nil {
		return scopeCheckResult{}, err
	}
	return checkAgenticScopeForAccessType(metadata.AccessType, scope, targets), nil
}

func checkAgenticScopeForAccessType(
	accessType tools.AccessType,
	scope AgenticScope,
	targets resolvedToolTargets,
) scopeCheckResult {
	switch accessType {
	case tools.AccessTypeStructural:
		return checkStructuralAgenticScope(scope, targets)
	case tools.AccessTypeWrite:
		return checkWriteAgenticScope(scope, targets)
	case tools.AccessTypeRead:
		return checkReadAgenticScope(scope, targets)
	case tools.AccessType(accessTypePeerChat):
		return checkPeerChatAgenticScope(scope, targets)
	default:
		return scopeCheckResult{Allowed: false, Reason: "invalid_access_type"}
	}
}

func checkStructuralAgenticScope(scope AgenticScope, targets resolvedToolTargets) scopeCheckResult {
	if scope.StructuralAllowed {
		return buildScopeCheckResult(true, "structural", targets, nil)
	}
	return buildScopeCheckResult(false, "structural_denied", targets, targets.sectionIDs)
}

func checkWriteAgenticScope(scope AgenticScope, targets resolvedToolTargets) scopeCheckResult {
	if len(targets.sectionIDs) == 0 {
		return checkUntargetedWriteAgenticScope(scope, targets)
	}
	return checkTargetedAgenticScope(scope.WriteSectionIDs, targets)
}

func checkUntargetedWriteAgenticScope(scope AgenticScope, targets resolvedToolTargets) scopeCheckResult {
	if len(targets.unmappedCodeObjIDs) != 0 {
		return buildScopeCheckResult(false, "unmapped_code_obj", targets, nil)
	}
	if scope.StructuralAllowed {
		return buildScopeCheckResult(true, "write_without_targets_allowed", targets, nil)
	}
	return buildScopeCheckResult(false, "write_without_targets", targets, nil)
}

func checkReadAgenticScope(scope AgenticScope, targets resolvedToolTargets) scopeCheckResult {
	if len(targets.sectionIDs) == 0 {
		return checkUntargetedReadAgenticScope(scope, targets)
	}
	return checkTargetedAgenticScope(scope.ReadSectionIDs, targets)
}

func checkUntargetedReadAgenticScope(scope AgenticScope, targets resolvedToolTargets) scopeCheckResult {
	if len(scope.ReadSectionIDs) == 0 {
		return buildScopeCheckResult(false, "empty_scope", targets, nil)
	}
	if len(targets.unmappedCodeObjIDs) != 0 {
		return buildScopeCheckResult(false, "unmapped_code_obj", targets, nil)
	}
	return buildScopeCheckResult(true, "read_without_targets", targets, nil)
}

func checkPeerChatAgenticScope(scope AgenticScope, targets resolvedToolTargets) scopeCheckResult {
	if len(targets.sectionIDs) == 0 {
		if len(targets.unmappedCodeObjIDs) != 0 {
			return buildScopeCheckResult(false, "unmapped_code_obj", targets, nil)
		}
		return buildScopeCheckResult(false, "peer_chat_without_targets", targets, nil)
	}
	return checkTargetedAgenticScope(scope.PeerChatSectionIDs, targets)
}

func checkTargetedAgenticScope(
	allowedSectionIDs map[string]struct{},
	targets resolvedToolTargets,
) scopeCheckResult {
	if len(allowedSectionIDs) == 0 {
		return buildScopeCheckResult(false, "empty_scope", targets, targets.sectionIDs)
	}
	blockedSectionIDs := blockedTargetSectionIDs(targets.sectionIDs, allowedSectionIDs)
	return buildScopeCheckResult(
		len(blockedSectionIDs) == 0 && len(targets.unmappedCodeObjIDs) == 0,
		scopeReasonForTargets(blockedSectionIDs, targets.unmappedCodeObjIDs, "allowed"),
		targets,
		blockedSectionIDs,
	)
}

func buildScopeCheckResult(
	allowed bool,
	reason string,
	targets resolvedToolTargets,
	blockedSectionIDs []string,
) scopeCheckResult {
	result := scopeCheckResult{
		Allowed:            allowed,
		Reason:             reason,
		UnmappedCodeObjIDs: targets.unmappedCodeObjIDs,
	}
	if len(targets.sectionIDs) != 0 {
		result.TargetSectionIDs = targets.sectionIDs
	}
	if len(blockedSectionIDs) != 0 {
		result.BlockedSectionIDs = blockedSectionIDs
	}
	return result
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

func scopeReasonForTargets(blockedSectionIDs []string, unmappedCodeObjIDs []string, allowedReason string) string {
	if len(blockedSectionIDs) == 0 && len(unmappedCodeObjIDs) == 0 {
		return allowedReason
	}
	if len(blockedSectionIDs) != 0 && len(unmappedCodeObjIDs) != 0 {
		return "out_of_scope_and_unmapped_code_obj"
	}
	if len(unmappedCodeObjIDs) != 0 {
		return "unmapped_code_obj"
	}
	return "out_of_scope"
}

func buildMissingEdgeHints(
	chatSectionID string,
	blockedSectionIDs []string,
	accessType string,
	projectView *projectview.SingleConfig,
) []scopeViolationMissingEdge {
	trimmedChatSectionID := strings.TrimSpace(chatSectionID)
	if trimmedChatSectionID == "" || len(blockedSectionIDs) == 0 {
		return nil
	}

	sortedBlockedSectionIDs := sortedStrings(blockedSectionIDs)
	hints := make([]scopeViolationMissingEdge, 0, len(sortedBlockedSectionIDs))
	for _, blockedSectionID := range sortedBlockedSectionIDs {
		kind := resolveMissingEdgeKind(projectView, blockedSectionID, accessType)
		if kind == "" {
			continue
		}
		hint := scopeViolationMissingEdge{
			SourceSectionID: trimmedChatSectionID,
			TargetSectionID: blockedSectionID,
			Kind:            kind,
		}
		if kind == agenticEdgeKindSectionChat {
			hint.SourceSectionID = blockedSectionID
			hint.TargetSectionID = trimmedChatSectionID
		}
		hints = append(hints, hint)
	}
	if len(hints) == 0 {
		return nil
	}
	return hints
}

func resolveMissingEdgeKind(projectView *projectview.SingleConfig, sectionID string, accessType string) string {
	if strings.TrimSpace(accessType) == string(tools.AccessTypeStructural) {
		return ""
	}
	if strings.TrimSpace(accessType) == accessTypePeerChat && isChatSection(projectView, sectionID) {
		return agenticEdgeKindChatChat
	}
	return agenticEdgeKindChatSection
}

func isChatSection(projectView *projectview.SingleConfig, sectionID string) bool {
	if projectView == nil {
		return false
	}
	variantID := activeSectionVariantID(*projectView, sectionID)
	if variantID == "" {
		return false
	}
	variant, ok := projectView.SectionVariants[variantID]
	if !ok {
		return false
	}
	implPayload, ok := projectView.SectionImpls[variant.Impl]
	if !ok || len(implPayload) == 0 {
		return false
	}
	var decoded struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(implPayload, &decoded); err != nil {
		return false
	}
	return strings.TrimSpace(decoded.Type) == "Chat"
}

func activeSectionVariantID(projectView projectview.SingleConfig, sectionID string) string {
	if trimmed := strings.TrimSpace(projectView.ProjectConfig.SectionVariantMap[sectionID]); trimmed != "" {
		return trimmed
	}
	section, ok := projectView.Sections[sectionID]
	if !ok {
		return ""
	}
	if section.DefaultVariant != nil {
		if trimmed := strings.TrimSpace(*section.DefaultVariant); trimmed != "" {
			return trimmed
		}
	}
	if len(section.Variants) == 0 {
		return ""
	}
	return strings.TrimSpace(section.Variants[0])
}

func buildScopeViolationError(
	toolName string,
	reason string,
	blockedSectionIDs []string,
	targetSectionIDs []string,
	unmappedCodeObjIDs []string,
	missingEdgesCanonical []scopeViolationMissingEdge,
) error {
	payload := map[string]any{
		"reason": reason,
	}
	if len(blockedSectionIDs) > 0 {
		payload["blockedSectionIds"] = sortedStrings(blockedSectionIDs)
	}
	if len(targetSectionIDs) > 0 {
		payload["targetSectionIds"] = sortedStrings(targetSectionIDs)
	}
	if len(unmappedCodeObjIDs) > 0 {
		payload["unmappedCodeObjIds"] = sortedStrings(unmappedCodeObjIDs)
	}
	if len(missingEdgesCanonical) > 0 {
		payload["missingEdgesCanonical"] = missingEdgesCanonical
	}

	message := "Tool call is outside the allowed agentic scope."
	switch reason {
	case "missing_context":
		message = fmt.Sprintf(
			"Tool %q blocked: missing agentic context. Provide projectConfigId/chatId/sectionId via MCP meta or headers, or call %q first.",
			toolName,
			"set_agentic_context",
		)
	case "missing_section_id":
		message = fmt.Sprintf("Tool %q blocked: missing sectionId in agentic context. Provide sectionId or set allowUnscoped=true via %q for project-level access.", toolName, "set_agentic_context")
	case "empty_scope":
		message = fmt.Sprintf("Tool %q has no readable sections in the resolved agentic scope.", toolName)
	case "structural_denied":
		message = fmt.Sprintf("Tool %q requires unscoped structural access.", toolName)
	case "write_without_targets":
		message = fmt.Sprintf("Tool %q requires explicit section/code-object targets or unscoped structural access.", toolName)
	case "unmapped_code_obj", "out_of_scope_and_unmapped_code_obj":
		message = fmt.Sprintf("Tool %q references unknown code objects. See structuredContent.unmappedCodeObjIds.", toolName)
	case "out_of_scope":
		message = fmt.Sprintf("Tool %q is outside the allowed agentic scope. See structuredContent.blockedSectionIds/targetSectionIds.", toolName)
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
