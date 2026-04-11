package scriptablechat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/realtime"
)

const (
	RunTypeScriptableChat = "scriptable_chat"
	scriptableLLMConfigID = "scriptable"
)

var (
	ErrRunStoreRequired             = errors.New("scriptable chat run store is required")
	ErrEngineStoreRequired          = errors.New("scriptable chat engine store is required")
	ErrLLMRuntimeRequired           = errors.New("scriptable chat LLM runtime is required")
	ErrToolClientRequired           = errors.New("scriptable chat tool client is required")
	ErrBroadcasterRequired          = errors.New("scriptable chat broadcaster is required")
	ErrChatNotFound                 = errors.New("scriptable chat not found")
	ErrChatProjectRequired          = errors.New("scriptable chat missing project config id")
	ErrFrontendAffinityTokenInvalid = errors.New("frontendAffinityToken must be a non-empty string when provided")
)

type llmConfigSource interface {
	Configs() llmconfig.AllConfigs
}

type streamBroadcaster interface {
	BroadcastJSON(ctx context.Context, message any, selection realtime.Selection) (int, error)
}

type toolCaller interface {
	ToolDescriptorsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor
	CallToolWithMeta(ctx context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error)
}

type ServiceOptions struct {
	Runs        *agentruns.RunStore
	Engines     *agentruns.EngineStore
	LLM         llmConfigSource
	Tools       toolCaller
	Broadcaster streamBroadcaster
	Now         func() time.Time
}

type Service struct {
	runs        *agentruns.RunStore
	engines     *agentruns.EngineStore
	llm         llmConfigSource
	tools       toolCaller
	broadcaster streamBroadcaster
	now         func() time.Time
}

type Chat struct {
	ID              string           `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Name            string           `json:"name"`
	LastUpdated     time.Time        `json:"lastUpdated" py_import:"from setta.utils.timestamps import get_now_timestamp" py_default:"Field(default_factory=get_now_timestamp)"`
	LLMConfig       llmconfig.Config `json:"llmConfig" py_type:"LLMConfig"`
	ProjectConfigID *string          `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id"`
	Messages        []map[string]any `json:"messages" shared_schema_items_ref:"BaseChatMessageUnion"`
	SystemPrompt    *string          `json:"systemPrompt"`
}

type ChatMetadata struct {
	ID              string           `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Name            string           `json:"name"`
	LastUpdated     time.Time        `json:"lastUpdated"`
	LLMConfig       llmconfig.Config `json:"llmConfig" py_type:"LLMConfig"`
	ProjectConfigID *string          `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id"`
}

type CreateChatRequest struct {
	ProjectConfigID *string        `json:"projectConfigId,omitempty"`
	EngineConfigID  *string        `json:"engineConfigId,omitempty"`
	FirstMessage    map[string]any `json:"firstMessage" shared_schema_ref:"BaseChatMessageUnion"`
}

type GetChatRequest struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty"`
	ChatID          string  `json:"chatId"`
}

type AppendMessagesRequest struct {
	ProjectConfigID *string          `json:"projectConfigId,omitempty"`
	ChatID          string           `json:"chatId"`
	Messages        []map[string]any `json:"messages" shared_schema_items_ref:"BaseChatMessageUnion"`
}

type SetSystemPromptRequest struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty"`
	ChatID          string  `json:"chatId"`
	SystemPrompt    string  `json:"systemPrompt"`
}

type DeleteChatRequest struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty"`
	ChatID          string  `json:"chatId"`
}

type GetAllMetadataRequest struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty"`
}

type EmitStreamDeltaRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
	SectionID       string `json:"sectionId"`
	ChatID          string `json:"chatId"`
	Chunk           any    `json:"chunk" shared_schema_ref:"LLMStreamingResponseChunk"`
	ShareSessionID  string `json:"-"`
}

type RunToolsRequest struct {
	ProjectConfigID       *string          `json:"projectConfigId,omitempty"`
	ChatID                string           `json:"chatId"`
	SectionID             string           `json:"sectionId"`
	FrontendAffinityToken *string          `json:"frontendAffinityToken,omitempty"`
	ToolCalls             []map[string]any `json:"toolCalls" shared_schema_items_ref:"ToolCall"`
	ShareSessionID        string           `json:"-"`
}

func NewService(opts ServiceOptions) (*Service, error) {
	if opts.Runs == nil {
		return nil, ErrRunStoreRequired
	}
	if opts.Engines == nil {
		return nil, ErrEngineStoreRequired
	}
	if opts.LLM == nil {
		return nil, ErrLLMRuntimeRequired
	}
	if opts.Now == nil {
		opts.Now = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Service{
		runs:        opts.Runs,
		engines:     opts.Engines,
		llm:         opts.LLM,
		tools:       opts.Tools,
		broadcaster: opts.Broadcaster,
		now:         opts.Now,
	}, nil
}

func (s *Service) CreateChat(request CreateChatRequest) (Chat, error) {
	normalizedMessage, err := cloneJSONObject(request.FirstMessage)
	if err != nil {
		return Chat{}, fmt.Errorf("clone first chat message: %w", err)
	}
	llmCfg, err := s.resolveLLMConfig(request.EngineConfigID)
	if err != nil {
		return Chat{}, err
	}
	projectConfigID := normalizedOptionalString(request.ProjectConfigID)

	now := s.now().UTC()
	inputs := map[string]any{
		"runType":   RunTypeScriptableChat,
		"llmConfig": cloneLLMConfigValue(llmCfg),
	}
	if projectConfigID != nil {
		inputs["projectConfigId"] = *projectConfigID
	}
	run := agentruns.NewRun(nil, inputs, now)
	run.Status = agentruns.RunStatusCompleted
	run.FinishedAt = &now
	run.Inputs["chatId"] = run.ID
	run.Outputs = map[string]any{
		"messages":     []any{cloneJSONValue(normalizedMessage)},
		"systemPrompt": nil,
		"lastUpdated":  now.Format(time.RFC3339Nano),
		"name":         createChatName(normalizedMessage),
	}
	if err := s.runs.Save(run); err != nil {
		return Chat{}, err
	}
	return buildChatFromRun(run)
}

func (s *Service) GetChat(request GetChatRequest) (Chat, error) {
	run, err := s.loadScriptableRun(request.ChatID)
	if err != nil {
		return Chat{}, err
	}
	return buildChatFromRun(run)
}

func (s *Service) AppendMessages(request AppendMessagesRequest) (Chat, error) {
	run, err := s.loadScriptableRun(request.ChatID)
	if err != nil {
		return Chat{}, err
	}

	existingMessages, err := parseRunMessages(run)
	if err != nil {
		return Chat{}, err
	}
	updatedMessages, changed := appendMessages(existingMessages, request.Messages)
	if !changed {
		return buildChatFromRun(run)
	}

	now := s.now().UTC()
	if run.Outputs == nil {
		run.Outputs = map[string]any{}
	}
	run.Outputs["messages"] = messagesToJSONValues(updatedMessages)
	run.Outputs["lastUpdated"] = now.Format(time.RFC3339Nano)
	if _, ok := run.Outputs["name"]; !ok {
		run.Outputs["name"] = deriveChatName(updatedMessages)
	}
	run.FinishedAt = &now
	if err := s.runs.Save(run); err != nil {
		return Chat{}, err
	}
	return buildChatFromRun(run)
}

func (s *Service) SetSystemPrompt(request SetSystemPromptRequest) (Chat, error) {
	run, err := s.loadScriptableRun(request.ChatID)
	if err != nil {
		return Chat{}, err
	}
	if run.Outputs == nil {
		run.Outputs = map[string]any{}
	}
	if current, ok := run.Outputs["systemPrompt"].(string); ok && current == request.SystemPrompt {
		return buildChatFromRun(run)
	}
	run.Outputs["systemPrompt"] = request.SystemPrompt
	if err := s.runs.Save(run); err != nil {
		return Chat{}, err
	}
	return buildChatFromRun(run)
}

func (s *Service) DeleteChat(request DeleteChatRequest) error {
	if s == nil || s.runs == nil {
		return ErrRunStoreRequired
	}
	return s.runs.Delete(strings.TrimSpace(request.ChatID))
}

func (s *Service) GetAllMetadata(GetAllMetadataRequest) ([]ChatMetadata, error) {
	if s == nil || s.runs == nil {
		return nil, ErrRunStoreRequired
	}
	runType := RunTypeScriptableChat
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: &runType,
	})
	if err != nil {
		return nil, err
	}
	metadata := make([]ChatMetadata, 0, len(runs))
	for _, run := range runs {
		entry, ok, err := buildChatMetadataFromRun(run)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		metadata = append(metadata, entry)
	}
	slices.SortFunc(metadata, func(left, right ChatMetadata) int {
		if left.LastUpdated.Before(right.LastUpdated) {
			return -1
		}
		if left.LastUpdated.After(right.LastUpdated) {
			return 1
		}
		return strings.Compare(left.ID, right.ID)
	})
	return metadata, nil
}

func (s *Service) EmitStreamDelta(ctx context.Context, request EmitStreamDeltaRequest) error {
	if s == nil || s.broadcaster == nil {
		return ErrBroadcasterRequired
	}
	projectConfigID := strings.TrimSpace(request.ProjectConfigID)
	if projectConfigID == "" {
		return fmt.Errorf("projectConfigId is required")
	}
	sectionID := strings.TrimSpace(request.SectionID)
	if sectionID == "" {
		return fmt.Errorf("sectionId is required")
	}
	chatID := strings.TrimSpace(request.ChatID)
	if chatID == "" {
		return fmt.Errorf("chatId is required")
	}

	projectConfigIDCopy := projectConfigID
	sectionIDCopy := sectionID
	_, err := s.broadcaster.BroadcastJSON(ctx, realtime.NewLLMStreamingResponseMessage(realtime.LLMStreamingResponseContent{
		ChatID:          chatID,
		Chunk:           cloneJSONValue(request.Chunk),
		SectionID:       &sectionIDCopy,
		ProjectConfigID: &projectConfigIDCopy,
	}), realtime.Selection{
		Type:           realtime.ConnectionTypeFrontend,
		ShareSessionID: strings.TrimSpace(request.ShareSessionID),
	})
	return err
}

func (s *Service) RunTools(ctx context.Context, request RunToolsRequest) ([]map[string]any, error) {
	if s == nil || s.tools == nil {
		return nil, ErrToolClientRequired
	}

	chat, err := s.GetChat(GetChatRequest{ChatID: request.ChatID})
	if err != nil {
		return nil, err
	}
	if chat.ProjectConfigID == nil || strings.TrimSpace(*chat.ProjectConfigID) == "" {
		return nil, fmt.Errorf("%w: %s", ErrChatProjectRequired, strings.TrimSpace(request.ChatID))
	}

	frontendAffinityToken, err := normalizeFrontendAffinityToken(request.FrontendAffinityToken)
	if err != nil {
		return nil, err
	}

	allowedServerIDs, err := s.llm.Configs().ResolveMCPServerIDs(chat.LLMConfig)
	if err != nil {
		return nil, err
	}
	allowedServerIDSet := toStringSet(allowedServerIDs)
	allowedTools := s.tools.ToolDescriptorsForServers(allowedServerIDSet)
	allTools := s.tools.ToolDescriptorsForServers(nil)

	results := make([]map[string]any, 0, len(request.ToolCalls))
	for _, rawToolCall := range request.ToolCalls {
		toolCall, err := cloneJSONObject(rawToolCall)
		if err != nil {
			return nil, fmt.Errorf("decode tool call: %w", err)
		}
		results = append(results, s.runSingleToolCall(ctx, toolCall, allowedTools, allTools, *chat.ProjectConfigID, strings.TrimSpace(request.ChatID), strings.TrimSpace(request.SectionID), strings.TrimSpace(request.ShareSessionID), frontendAffinityToken))
	}
	return results, nil
}

func (s *Service) resolveLLMConfig(engineConfigID *string) (llmconfig.Config, error) {
	if s == nil || s.llm == nil {
		return llmconfig.Config{}, ErrLLMRuntimeRequired
	}
	if engineConfigID == nil || strings.TrimSpace(*engineConfigID) == "" {
		return llmconfig.Config{
			ID:           scriptableLLMConfigID,
			Model:        scriptableLLMConfigID,
			MCPServerIDs: []string{},
			Temporary:    true,
		}, nil
	}
	resolved, err := agentruns.ResolveManagedEngine(s.engines, s.llm.Configs(), strings.TrimSpace(*engineConfigID))
	if err != nil {
		return llmconfig.Config{}, err
	}
	return resolved.LLMConfig, nil
}

func (s *Service) loadScriptableRun(chatID string) (agentruns.Run, error) {
	if s == nil || s.runs == nil {
		return agentruns.Run{}, ErrRunStoreRequired
	}
	normalizedChatID := strings.TrimSpace(chatID)
	run, err := s.runs.Load(normalizedChatID)
	if err != nil {
		if errors.Is(err, agentruns.ErrRunNotFound) {
			return agentruns.Run{}, fmt.Errorf("%w: %s", ErrChatNotFound, normalizedChatID)
		}
		return agentruns.Run{}, err
	}
	if !isScriptableChatRun(run) {
		return agentruns.Run{}, fmt.Errorf("%w: %s", ErrChatNotFound, normalizedChatID)
	}
	return run, nil
}

func buildChatFromRun(run agentruns.Run) (Chat, error) {
	llmCfg, ok, err := parseLLMConfig(run)
	if err != nil {
		return Chat{}, err
	}
	if !ok {
		return Chat{}, fmt.Errorf("%w: %s", ErrChatNotFound, strings.TrimSpace(run.ID))
	}
	messages, err := parseRunMessages(run)
	if err != nil {
		return Chat{}, err
	}
	name := outputText(run, "name")
	if name == "" {
		name = deriveChatName(messages)
	}
	systemPrompt := optionalOutputText(run, "systemPrompt")
	return Chat{
		ID:              run.ID,
		Name:            name,
		LastUpdated:     parseLastUpdated(run),
		LLMConfig:       llmCfg,
		ProjectConfigID: parseProjectConfigID(run),
		Messages:        messages,
		SystemPrompt:    systemPrompt,
	}, nil
}

func buildChatMetadataFromRun(run agentruns.Run) (ChatMetadata, bool, error) {
	llmCfg, ok, err := parseLLMConfig(run)
	if err != nil {
		return ChatMetadata{}, false, err
	}
	if !ok {
		return ChatMetadata{}, false, nil
	}
	name := outputText(run, "name")
	if name == "" {
		messages, err := parseRunMessages(run)
		if err != nil {
			return ChatMetadata{}, false, err
		}
		name = deriveChatName(messages)
	}
	return ChatMetadata{
		ID:              run.ID,
		Name:            name,
		LastUpdated:     parseLastUpdated(run),
		LLMConfig:       llmCfg,
		ProjectConfigID: parseProjectConfigID(run),
	}, true, nil
}

func isScriptableChatRun(run agentruns.Run) bool {
	if run.Inputs == nil {
		return false
	}
	rawRunType, ok := run.Inputs["runType"].(string)
	if !ok {
		return false
	}
	return strings.TrimSpace(rawRunType) == RunTypeScriptableChat
}

func parseLLMConfig(run agentruns.Run) (llmconfig.Config, bool, error) {
	if run.Inputs == nil {
		return llmconfig.Config{}, false, nil
	}
	rawValue, ok := run.Inputs["llmConfig"]
	if !ok || rawValue == nil {
		return llmconfig.Config{}, false, nil
	}
	payload, err := json.Marshal(rawValue)
	if err != nil {
		return llmconfig.Config{}, false, fmt.Errorf("marshal chat llm config: %w", err)
	}
	var llmCfg llmconfig.Config
	if err := json.Unmarshal(payload, &llmCfg); err != nil {
		return llmconfig.Config{}, false, fmt.Errorf("decode chat llm config: %w", err)
	}
	return llmCfg, true, nil
}

func parseRunMessages(run agentruns.Run) ([]map[string]any, error) {
	var rawMessages []any
	switch {
	case run.Outputs != nil:
		if value, ok := run.Outputs["messages"].([]any); ok {
			rawMessages = value
		}
	case run.Inputs != nil:
		if value, ok := run.Inputs["messages"].([]any); ok {
			rawMessages = value
		}
	}
	if len(rawMessages) == 0 {
		return []map[string]any{}, nil
	}
	messages := make([]map[string]any, 0, len(rawMessages))
	for _, rawMessage := range rawMessages {
		typedMessage, err := cloneJSONObject(rawMessage)
		if err != nil {
			return nil, fmt.Errorf("decode chat message: %w", err)
		}
		messages = append(messages, typedMessage)
	}
	return messages, nil
}

func appendMessages(messages []map[string]any, additions []map[string]any) ([]map[string]any, bool) {
	if len(additions) == 0 {
		return cloneMessages(messages), false
	}
	existingIDs := make(map[string]struct{}, len(messages))
	for _, message := range messages {
		if messageID := messageID(message); messageID != "" {
			existingIDs[messageID] = struct{}{}
		}
	}

	updated := cloneMessages(messages)
	appended := false
	for _, addition := range additions {
		normalized, err := cloneJSONObject(addition)
		if err != nil {
			continue
		}
		nextID := messageID(normalized)
		if nextID != "" {
			if _, exists := existingIDs[nextID]; exists {
				continue
			}
			existingIDs[nextID] = struct{}{}
		}
		updated = append(updated, normalized)
		appended = true
	}
	if !appended {
		return updated, false
	}
	return updated, true
}

func messagesToJSONValues(messages []map[string]any) []any {
	values := make([]any, 0, len(messages))
	for _, message := range messages {
		values = append(values, cloneJSONValue(message))
	}
	return values
}

func cloneMessages(messages []map[string]any) []map[string]any {
	cloned := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		typed, err := cloneJSONObject(message)
		if err != nil {
			continue
		}
		cloned = append(cloned, typed)
	}
	return cloned
}

func parseLastUpdated(run agentruns.Run) time.Time {
	if run.Outputs != nil {
		switch raw := run.Outputs["lastUpdated"].(type) {
		case time.Time:
			return raw.UTC()
		case string:
			if parsed, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(raw)); err == nil {
				return parsed.UTC()
			}
		}
	}
	if run.FinishedAt != nil {
		return run.FinishedAt.UTC()
	}
	if run.StartedAt != nil {
		return run.StartedAt.UTC()
	}
	return time.Time{}
}

func parseProjectConfigID(run agentruns.Run) *string {
	if run.Inputs == nil {
		return nil
	}
	rawValue, ok := run.Inputs["projectConfigId"].(string)
	if !ok {
		return nil
	}
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func outputText(run agentruns.Run, key string) string {
	if run.Outputs == nil {
		return ""
	}
	rawValue, ok := run.Outputs[key].(string)
	if !ok {
		return ""
	}
	return rawValue
}

func optionalOutputText(run agentruns.Run, key string) *string {
	if run.Outputs == nil {
		return nil
	}
	rawValue, ok := run.Outputs[key]
	if !ok || rawValue == nil {
		return nil
	}
	value := outputText(run, key)
	if value == "" {
		empty := ""
		return &empty
	}
	return &value
}

func createChatName(firstMessage map[string]any) string {
	if firstText := firstMessageText(firstMessage); firstText != "" {
		return truncateRunes(firstText, 30)
	}
	return "New chat"
}

func deriveChatName(messages []map[string]any) string {
	if len(messages) == 0 {
		return "New chat"
	}
	return createChatName(messages[0])
}

func firstMessageText(message map[string]any) string {
	rawContent, ok := message["content"].([]any)
	if !ok {
		return ""
	}
	for _, rawBlock := range rawContent {
		block, ok := rawBlock.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(block["type"])) != "text" {
			continue
		}
		text := strings.TrimSpace(stringValue(block["text"]))
		if text != "" {
			return text
		}
	}
	return ""
}

func messageID(message map[string]any) string {
	return strings.TrimSpace(stringValue(message["id"]))
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func cloneLLMConfigValue(config llmconfig.Config) any {
	return cloneJSONValue(config)
}

func (s *Service) runSingleToolCall(
	ctx context.Context,
	toolCall map[string]any,
	allowedTools map[string]mcpx.ToolDescriptor,
	allTools map[string]mcpx.ToolDescriptor,
	projectConfigID string,
	chatID string,
	sectionID string,
	shareSessionID string,
	frontendAffinityToken *string,
) map[string]any {
	startedAt := s.now().UTC()

	toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
	functionPayload, _ := toolCall["function"].(map[string]any)
	rawToolName := stringValue(functionPayload["name"])
	toolName := mcpx.NormalizeToolName(rawToolName)
	arguments, _ := functionPayload["arguments"].(map[string]any)
	if arguments == nil {
		arguments = map[string]any{}
	}
	arguments = cloneJSONObjectBestEffort(arguments)

	if toolName == "" {
		return buildToolMessage(toolCallID, "", arguments, startedAt, mcpx.ToolCallResult{}, fmt.Errorf("Tool call missing function name"))
	}

	descriptor, ok := allowedTools[toolName]
	if !ok {
		if _, exists := allTools[toolName]; exists {
			return buildToolMessage(toolCallID, toolName, arguments, startedAt, mcpx.ToolCallResult{}, fmt.Errorf("MCP tool '%s' is not allowed for this chat", toolName))
		}
		return buildToolMessage(toolCallID, toolName, arguments, startedAt, mcpx.ToolCallResult{}, fmt.Errorf("MCP tool '%s' is not registered", toolName))
	}

	meta, err := buildToolMeta(toolName, projectConfigID, chatID, sectionID, shareSessionID, frontendAffinityToken)
	if err != nil {
		return buildToolMessage(toolCallID, toolName, arguments, startedAt, mcpx.ToolCallResult{}, err)
	}

	callResult, err := s.tools.CallToolWithMeta(ctx, toolName, cloneJSONObjectBestEffort(arguments), meta)
	if err != nil {
		return buildToolMessage(toolCallID, toolName, arguments, startedAt, mcpx.ToolCallResult{}, err)
	}
	return buildToolMessage(toolCallID, descriptor.NamespacedName, arguments, startedAt, callResult, nil)
}

func buildToolMeta(
	toolName string,
	projectConfigID string,
	chatID string,
	sectionID string,
	shareSessionID string,
	frontendAffinityToken *string,
) (map[string]any, error) {
	meta := map[string]any{}
	if strings.TrimSpace(shareSessionID) != "" {
		meta["shareSessionId"] = strings.TrimSpace(shareSessionID)
	}

	serverID, _, hasServerID := mcpx.SplitNamespacedToolName(toolName)
	if !hasServerID || serverID != mcpx.DefaultServerID {
		if len(meta) == 0 {
			return nil, nil
		}
		return meta, nil
	}

	if strings.TrimSpace(projectConfigID) == "" {
		return nil, fmt.Errorf("Setta MCP tool '%s' requires agentic projectConfigId meta", toolName)
	}
	meta["projectConfigId"] = strings.TrimSpace(projectConfigID)
	if strings.TrimSpace(chatID) != "" {
		meta["chatId"] = strings.TrimSpace(chatID)
	}
	if strings.TrimSpace(sectionID) != "" {
		meta["sectionId"] = strings.TrimSpace(sectionID)
	}
	if frontendAffinityToken != nil && strings.TrimSpace(*frontendAffinityToken) != "" {
		meta["frontendAffinityToken"] = strings.TrimSpace(*frontendAffinityToken)
	}
	return meta, nil
}

func buildToolMessage(
	toolCallID string,
	toolName string,
	arguments map[string]any,
	startedAt time.Time,
	callResult mcpx.ToolCallResult,
	callErr error,
) map[string]any {
	completedAt := startedAt
	if !startedAt.IsZero() {
		completedAt = time.Now().UTC()
	}

	result := callResult
	if callErr != nil {
		displayName := toolName
		if strings.TrimSpace(displayName) == "" {
			displayName = "unknown"
		}
		message := fmt.Sprintf("Failed to run MCP tool '%s': %v", displayName, callErr)
		result = mcpx.ToolCallResult{
			IsError: true,
			StructuredContent: map[string]any{
				"error":     message,
				"tool_name": normalizedNullableToolName(toolName),
				"exception": fmt.Sprintf("%T", callErr),
			},
			Text: message,
		}
	}

	messagePayload := map[string]any{
		"id":           "tool-result-" + strings.TrimSpace(toolCallID),
		"role":         "tool",
		"tool_call_id": strings.TrimSpace(toolCallID),
		"tool_name":    normalizedNullableToolName(toolName),
		"arguments":    cloneJSONValue(arguments),
		"is_error":     result.IsError,
		"content":      []any{},
		"started_at":   startedAt.Format(time.RFC3339Nano),
		"completed_at": completedAt.Format(time.RFC3339Nano),
	}
	resultPayload := map[string]any{
		"isError": result.IsError,
	}
	if result.StructuredContent != nil {
		resultPayload["structuredContent"] = cloneJSONValue(result.StructuredContent)
	}
	if strings.TrimSpace(result.Text) != "" {
		resultPayload["text"] = result.Text
		messagePayload["content"] = []any{
			map[string]any{
				"type": "text",
				"text": result.Text,
			},
		}
	} else if result.StructuredContent != nil {
		encoded, err := json.Marshal(result.StructuredContent)
		if err == nil {
			resultPayload["text"] = string(encoded)
			messagePayload["content"] = []any{
				map[string]any{
					"type": "text",
					"text": string(encoded),
				},
			}
		}
	}
	messagePayload["result"] = resultPayload
	return messagePayload
}

func normalizedNullableToolName(toolName string) any {
	trimmed := strings.TrimSpace(toolName)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func normalizedOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeFrontendAffinityToken(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, ErrFrontendAffinityTokenInvalid
	}
	return &trimmed, nil
}

func toStringSet(values []string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		set[trimmed] = struct{}{}
	}
	return set
}

func cloneJSONValue(value any) any {
	if value == nil {
		return nil
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned any
	if err := json.Unmarshal(payload, &cloned); err != nil {
		return value
	}
	return cloned
}

func cloneJSONObject(value any) (map[string]any, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var cloned map[string]any
	if err := json.Unmarshal(payload, &cloned); err != nil {
		return nil, err
	}
	if cloned == nil {
		return map[string]any{}, nil
	}
	return cloned, nil
}

func cloneJSONObjectBestEffort(value map[string]any) map[string]any {
	cloned, err := cloneJSONObject(value)
	if err != nil {
		return map[string]any{}
	}
	return cloned
}
