package easyrun

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"setta/internal/chat"
)

type emitArtifactInput struct {
	Kind        EasyArtifactKind            `json:"kind"`
	Title       string                      `json:"title"`
	Kicker      *string                     `json:"kicker"`
	Markdown    *string                     `json:"markdown"`
	Columns     *[]EasyArtifactTableColumn  `json:"columns"`
	Rows        *[][]string                 `json:"rows"`
	Items       *[]EasyArtifactBarChartItem `json:"items"`
	Path        *string                     `json:"path"`
	Description *string                     `json:"description"`
}

func NewEmitArtifactAgentTool(service *Service) chat.AgentTool {
	return chat.AgentTool{
		Namespace:   chat.SettaAgentToolNamespace,
		Name:        chat.SettaEmitArtifactAgentToolName,
		InputSchema: emitArtifactInputSchema(),
		OutputSchema: chat.AgentToolSchema{
			Type:        chat.AgentToolSchemaObject,
			Description: "Acknowledgement that the Easy Button artifact was recorded.",
			Required:    []string{"artifactId", "kind", "ordinal", "title"},
			Properties: map[string]chat.AgentToolSchema{
				"artifactId": {Type: chat.AgentToolSchemaString},
				"kind":       {Type: chat.AgentToolSchemaString},
				"ordinal":    {Type: chat.AgentToolSchemaInteger},
				"title":      {Type: chat.AgentToolSchemaString},
			},
		},
		PermissionRequirements: []chat.AgentToolPermissionRequirement{{
			Kind:        chat.AgentToolPermissionReadWorkspace,
			Description: "Publish a typed deliverable to the current Easy Button run.",
		}},
		AuditMetadata: chat.AgentToolAuditMetadata{
			DisplayName: "Emit artifact",
			Description: "Publish a typed Easy Button deliverable card.",
			Category:    "easy-run",
		},
		Handler: func(ctx context.Context, call chat.AgentToolCall) (chat.AgentToolResult, error) {
			artifact, err := service.EmitArtifactFromTool(ctx, call.Arguments)
			if err != nil {
				return chat.AgentToolResult{}, err
			}
			return artifactToolResult(artifact)
		},
	}
}

func emitArtifactInputSchema() chat.AgentToolSchema {
	allowBranchAdditionalProperties := true
	return chat.AgentToolSchema{
		Type:        chat.AgentToolSchemaObject,
		Description: "Publish one finished Easy Button artifact. Pick exactly one kind and provide only that kind's payload fields.",
		Required:    []string{"kind", "title"},
		Properties: map[string]chat.AgentToolSchema{
			"kind": {
				Type:        chat.AgentToolSchemaString,
				Description: "Artifact kind.",
				Enum:        stringValues(easyArtifactKindValues),
			},
			"title":       {Type: chat.AgentToolSchemaString, Description: "Short card title."},
			"kicker":      {Type: chat.AgentToolSchemaString, Description: "Optional compact label shown above the title."},
			"markdown":    {Type: chat.AgentToolSchemaString, Description: "Markdown payload for markdown artifacts."},
			"columns":     tableColumnsSchema(),
			"rows":        tableRowsSchema(),
			"items":       barChartItemsSchema(),
			"path":        {Type: chat.AgentToolSchemaString, Description: "File path for file artifacts."},
			"description": {Type: chat.AgentToolSchemaString, Description: "Optional file description."},
		},
		OneOf: []chat.AgentToolSchema{
			artifactBranchSchema(EasyArtifactKindMarkdown, []string{"kind", "markdown"}, &allowBranchAdditionalProperties),
			artifactBranchSchema(EasyArtifactKindTable, []string{"kind", "columns", "rows"}, &allowBranchAdditionalProperties),
			artifactBranchSchema(EasyArtifactKindBarChart, []string{"kind", "items"}, &allowBranchAdditionalProperties),
			artifactBranchSchema(EasyArtifactKindFile, []string{"kind", "path"}, &allowBranchAdditionalProperties),
		},
	}
}

func artifactBranchSchema(kind EasyArtifactKind, required []string, additionalProperties *bool) chat.AgentToolSchema {
	return chat.AgentToolSchema{
		Type:                 chat.AgentToolSchemaObject,
		Required:             required,
		AdditionalProperties: additionalProperties,
		Properties: map[string]chat.AgentToolSchema{
			"kind": {Type: chat.AgentToolSchemaString, Enum: []string{string(kind)}},
		},
	}
}

func tableColumnsSchema() chat.AgentToolSchema {
	return chat.AgentToolSchema{
		Type:        chat.AgentToolSchemaArray,
		Description: "Table columns for table artifacts.",
		Items: &chat.AgentToolSchema{
			Type:     chat.AgentToolSchemaObject,
			Required: []string{"key", "label"},
			Properties: map[string]chat.AgentToolSchema{
				"key":   {Type: chat.AgentToolSchemaString},
				"label": {Type: chat.AgentToolSchemaString},
			},
		},
	}
}

func tableRowsSchema() chat.AgentToolSchema {
	return chat.AgentToolSchema{
		Type:        chat.AgentToolSchemaArray,
		Description: "Table rows for table artifacts; each row must match the column count.",
		Items: &chat.AgentToolSchema{
			Type: chat.AgentToolSchemaArray,
			Items: &chat.AgentToolSchema{
				Type: chat.AgentToolSchemaString,
			},
		},
	}
}

func barChartItemsSchema() chat.AgentToolSchema {
	return chat.AgentToolSchema{
		Type:        chat.AgentToolSchemaArray,
		Description: "Bar chart items for bar_chart artifacts.",
		Items: &chat.AgentToolSchema{
			Type:     chat.AgentToolSchemaObject,
			Required: []string{"label", "value"},
			Properties: map[string]chat.AgentToolSchema{
				"label": {Type: chat.AgentToolSchemaString},
				"value": {Type: chat.AgentToolSchemaNumber},
				"unit":  {Type: chat.AgentToolSchemaString},
			},
		},
	}
}

func (service *Service) EmitArtifactFromTool(ctx context.Context, arguments json.RawMessage) (EasyArtifact, error) {
	if service == nil {
		return EasyArtifact{}, errors.New("easy-run service is required")
	}
	if err := ctx.Err(); err != nil {
		return EasyArtifact{}, err
	}
	runtime, ok := chat.AgentToolRuntimeFromContext(ctx)
	if !ok {
		return EasyArtifact{}, errors.New("easy-run artifact tool runtime is unavailable")
	}
	if err := validateArtifactToolRuntime(runtime); err != nil {
		return EasyArtifact{}, err
	}
	input, err := decodeEmitArtifactInput(arguments)
	if err != nil {
		return EasyArtifact{}, err
	}
	artifactID, err := service.newID("artifact")
	if err != nil {
		return EasyArtifact{}, fmt.Errorf("create artifact id: %w", err)
	}
	return recordArtifact(service, runtime, input, artifactID)
}

func validateArtifactToolRuntime(runtime chat.AgentToolRuntimeContext) error {
	if !runtime.Conversation.Internal || runtime.Conversation.EasyRun == nil {
		return errors.New("setta.emit_artifact is only available inside an easy-run conversation")
	}
	if runtime.Workspace.ID != "" && runtime.Workspace.ID != runtime.Conversation.WorkspaceID {
		return fmt.Errorf("artifact workspace %s does not match conversation workspace %s", runtime.Workspace.ID, runtime.Conversation.WorkspaceID)
	}
	if runtime.Run.ID == "" {
		return errors.New("easy-run artifact tool requires a backing run")
	}
	if runtime.Run.ConversationID != "" && runtime.Run.ConversationID != runtime.Conversation.ID {
		return fmt.Errorf("artifact run conversation %s does not match %s", runtime.Run.ConversationID, runtime.Conversation.ID)
	}
	return nil
}

func decodeEmitArtifactInput(arguments json.RawMessage) (emitArtifactInput, error) {
	if len(arguments) == 0 {
		return emitArtifactInput{}, errors.New("emit_artifact arguments are required")
	}
	decoder := json.NewDecoder(bytes.NewReader(arguments))
	decoder.DisallowUnknownFields()
	var input emitArtifactInput
	if err := decoder.Decode(&input); err != nil {
		return emitArtifactInput{}, fmt.Errorf("emit_artifact arguments must be a strict JSON object: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return emitArtifactInput{}, errors.New("emit_artifact arguments must contain exactly one JSON object")
	}
	if !validValue(input.Kind, easyArtifactKindValues) {
		return emitArtifactInput{}, fmt.Errorf("unsupported easy artifact kind %s", input.Kind)
	}
	if err := validateEmitArtifactInputBranches(input); err != nil {
		return emitArtifactInput{}, err
	}
	return input, nil
}

func validateEmitArtifactInputBranches(input emitArtifactInput) error {
	switch input.Kind {
	case EasyArtifactKindMarkdown:
		if input.Markdown == nil {
			return errors.New("markdown artifact requires markdown")
		}
		return rejectUnexpectedArtifactFields("columns", input.Columns != nil, "rows", input.Rows != nil, "items", input.Items != nil, "path", input.Path != nil, "description", input.Description != nil)
	case EasyArtifactKindTable:
		if input.Columns == nil || input.Rows == nil {
			return errors.New("table artifact requires columns and rows")
		}
		return rejectUnexpectedArtifactFields("markdown", input.Markdown != nil, "items", input.Items != nil, "path", input.Path != nil, "description", input.Description != nil)
	case EasyArtifactKindBarChart:
		if input.Items == nil {
			return errors.New("bar_chart artifact requires items")
		}
		return rejectUnexpectedArtifactFields("markdown", input.Markdown != nil, "columns", input.Columns != nil, "rows", input.Rows != nil, "path", input.Path != nil, "description", input.Description != nil)
	case EasyArtifactKindFile:
		if input.Path == nil {
			return errors.New("file artifact requires path")
		}
		return rejectUnexpectedArtifactFields("markdown", input.Markdown != nil, "columns", input.Columns != nil, "rows", input.Rows != nil, "items", input.Items != nil)
	default:
		return fmt.Errorf("unsupported easy artifact kind %s", input.Kind)
	}
}

func rejectUnexpectedArtifactFields(pairs ...any) error {
	for index := 0; index < len(pairs); index += 2 {
		name := pairs[index].(string)
		present := pairs[index+1].(bool)
		if present {
			return fmt.Errorf("%s is not valid for this artifact kind", name)
		}
	}
	return nil
}

func recordArtifact(service *Service, runtime chat.AgentToolRuntimeContext, input emitArtifactInput, artifactID string) (EasyArtifact, error) {
	workspaceID := runtime.Conversation.WorkspaceID
	easyRunID := runtime.Conversation.EasyRun.EasyRunID

	service.mu.Lock()
	defer service.mu.Unlock()

	record, artifacts, err := service.loadArtifactTarget(workspaceID, easyRunID, runtime)
	if err != nil {
		return EasyArtifact{}, err
	}
	artifact := input.easyArtifact(artifactID, easyRunID, len(artifacts)+1, timestamp(service.now()))
	if err := validateEasyArtifact(artifact); err != nil {
		return EasyArtifact{}, err
	}
	artifacts = append(artifacts, artifact)
	record.Run.ArtifactCount = len(artifacts)
	if record.BackingRunID == "" {
		record.BackingRunID = runtime.Run.ID
	}
	if err := service.saveRecordedArtifact(workspaceID, easyRunID, record, artifacts, artifact); err != nil {
		return EasyArtifact{}, err
	}
	return artifact, nil
}

func (service *Service) loadArtifactTarget(workspaceID string, easyRunID string, runtime chat.AgentToolRuntimeContext) (storedRunRecord, []EasyArtifact, error) {
	record, err := service.store.loadRun(workspaceID, easyRunID)
	if err != nil {
		return storedRunRecord{}, nil, err
	}
	if err := validateArtifactRunRecord(record, runtime, easyRunID); err != nil {
		return storedRunRecord{}, nil, err
	}
	artifacts, err := service.store.loadArtifacts(workspaceID, easyRunID)
	if err != nil {
		return storedRunRecord{}, nil, err
	}
	if len(artifacts) >= maxEasyArtifactsPerRun {
		return storedRunRecord{}, nil, fmt.Errorf("easy-run %s already has %d artifacts", easyRunID, maxEasyArtifactsPerRun)
	}
	return record, artifacts, nil
}

func validateArtifactRunRecord(record storedRunRecord, runtime chat.AgentToolRuntimeContext, easyRunID string) error {
	if record.Run.Status != EasyRunStatusWorking {
		return fmt.Errorf("easy-run %s is not working", easyRunID)
	}
	if record.Run.ConversationID != runtime.Conversation.ID {
		return fmt.Errorf("easy-run %s belongs to conversation %s, not %s", easyRunID, record.Run.ConversationID, runtime.Conversation.ID)
	}
	if record.BackingRunID != "" && record.BackingRunID != runtime.Run.ID {
		return fmt.Errorf("easy-run %s backs run %s, not %s", easyRunID, record.BackingRunID, runtime.Run.ID)
	}
	return nil
}

func (service *Service) saveRecordedArtifact(workspaceID string, easyRunID string, record storedRunRecord, artifacts []EasyArtifact, artifact EasyArtifact) error {
	if err := service.store.saveArtifacts(workspaceID, easyRunID, artifacts); err != nil {
		return err
	}
	if err := service.store.saveRun(record); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewArtifactCreatedEvent(workspaceID, artifact)); err != nil {
		return err
	}
	return nil
}

func (input emitArtifactInput) easyArtifact(id string, easyRunID string, ordinal int, createdAt string) EasyArtifact {
	artifact := EasyArtifact{
		ID:        id,
		EasyRunID: easyRunID,
		Ordinal:   ordinal,
		Kind:      input.Kind,
		Title:     input.Title,
		Kicker:    input.Kicker,
		CreatedAt: createdAt,
	}
	switch input.Kind {
	case EasyArtifactKindMarkdown:
		artifact.Markdown = &EasyMarkdownArtifactPayload{Markdown: *input.Markdown}
	case EasyArtifactKindTable:
		artifact.Table = &EasyTableArtifactPayload{
			Columns: append([]EasyArtifactTableColumn{}, (*input.Columns)...),
			Rows:    cloneStringRows(*input.Rows),
		}
	case EasyArtifactKindBarChart:
		artifact.BarChart = &EasyBarChartArtifactPayload{Items: append([]EasyArtifactBarChartItem{}, (*input.Items)...)}
	case EasyArtifactKindFile:
		artifact.File = &EasyFileArtifactPayload{
			Path:        *input.Path,
			Description: input.Description,
		}
	}
	return artifact
}

func cloneStringRows(rows [][]string) [][]string {
	cloned := make([][]string, 0, len(rows))
	for _, row := range rows {
		cloned = append(cloned, append([]string{}, row...))
	}
	return cloned
}

func artifactToolResult(artifact EasyArtifact) (chat.AgentToolResult, error) {
	payload := map[string]any{
		"artifactId": artifact.ID,
		"kind":       artifact.Kind,
		"ordinal":    artifact.Ordinal,
		"title":      artifact.Title,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return chat.AgentToolResult{}, fmt.Errorf("encode artifact acknowledgement: %w", err)
	}
	return chat.AgentToolResult{
		ContentItems: []chat.AgentToolContentItem{{
			Type: "inputText",
			Text: string(data),
		}},
		Success: true,
	}, nil
}
