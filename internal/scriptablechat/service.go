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
	"setta/internal/realtime"
)

const (
	runTypeScriptableChat = "scriptable_chat"
	scriptableLLMConfigID = "scriptable"
)

var (
	ErrRunStoreRequired    = errors.New("scriptable chat run store is required")
	ErrEngineStoreRequired = errors.New("scriptable chat engine store is required")
	ErrLLMRuntimeRequired  = errors.New("scriptable chat LLM runtime is required")
	ErrBroadcasterRequired = errors.New("scriptable chat broadcaster is required")
	ErrChatNotFound        = errors.New("scriptable chat not found")
)

type llmConfigSource interface {
	Configs() llmconfig.AllConfigs
}

type streamBroadcaster interface {
	BroadcastJSON(ctx context.Context, message any, selection realtime.Selection) (int, error)
}

type ServiceOptions struct {
	Runs        *agentruns.RunStore
	Engines     *agentruns.EngineStore
	LLM         llmConfigSource
	Broadcaster streamBroadcaster
	Now         func() time.Time
}

type Service struct {
	runs        *agentruns.RunStore
	engines     *agentruns.EngineStore
	llm         llmConfigSource
	broadcaster streamBroadcaster
	now         func() time.Time
}

type Chat struct {
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	LastUpdated     time.Time        `json:"lastUpdated"`
	LLMConfig       llmconfig.Config `json:"llmConfig"`
	ProjectConfigID *string          `json:"projectConfigId,omitempty"`
	Messages        []map[string]any `json:"messages"`
	SystemPrompt    *string          `json:"systemPrompt"`
}

type ChatMetadata struct {
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	LastUpdated     time.Time        `json:"lastUpdated"`
	LLMConfig       llmconfig.Config `json:"llmConfig"`
	ProjectConfigID *string          `json:"projectConfigId,omitempty"`
}

type CreateChatRequest struct {
	ProjectConfigID *string        `json:"projectConfigId,omitempty"`
	EngineConfigID  *string        `json:"engineConfigId,omitempty"`
	FirstMessage    map[string]any `json:"firstMessage"`
}

type GetChatRequest struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty"`
	ChatID          string  `json:"chatId"`
}

type AppendMessagesRequest struct {
	ProjectConfigID *string          `json:"projectConfigId,omitempty"`
	ChatID          string           `json:"chatId"`
	Messages        []map[string]any `json:"messages"`
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
	Chunk           any    `json:"chunk"`
	ShareSessionID  string `json:"-"`
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

	now := s.now().UTC()
	inputs := map[string]any{
		"runType":   runTypeScriptableChat,
		"llmConfig": cloneLLMConfigValue(llmCfg),
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
	runType := runTypeScriptableChat
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
	return strings.TrimSpace(rawRunType) == runTypeScriptableChat
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
