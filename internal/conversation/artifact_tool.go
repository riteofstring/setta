package conversation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"setta/internal/agent"
)

const (
	artifactToolNamespace = "setta"
	artifactToolName      = "emit_artifact"
)

var emitArtifactInputSchemaJSON = mustEmitArtifactInputSchemaJSON()

type emitArtifactInput struct {
	Kind        ArtifactKind            `json:"kind"`
	Title       string                  `json:"title"`
	Markdown    *string                 `json:"markdown"`
	Columns     *[]ArtifactTableColumn  `json:"columns"`
	Rows        *[][]string             `json:"rows"`
	Items       *[]BarChartArtifactItem `json:"items"`
	Path        *string                 `json:"path"`
	Description *string                 `json:"description"`
}

type emitArtifactBranchSpec struct {
	Kind     ArtifactKind
	Required []string
	Optional []string
}

func emitArtifactBranchSpecs() []emitArtifactBranchSpec {
	return []emitArtifactBranchSpec{
		{Kind: ArtifactKindMarkdown, Required: []string{"markdown"}},
		{Kind: ArtifactKindTable, Required: []string{"columns", "rows"}},
		{Kind: ArtifactKindBarChart, Required: []string{"items"}},
		{Kind: ArtifactKindFile, Required: []string{"path"}, Optional: []string{"description"}},
	}
}

func mustEmitArtifactInputSchemaJSON() json.RawMessage {
	data, err := json.Marshal(emitArtifactInputSchema())
	if err != nil {
		panic(fmt.Sprintf("encode emit_artifact input schema: %v", err))
	}
	return json.RawMessage(data)
}

func emitArtifactInputSchema() map[string]any {
	properties := emitArtifactInputPropertySchemas()
	branches := emitArtifactBranchSpecs()
	oneOf := make([]map[string]any, 0, len(branches))
	for _, branch := range branches {
		oneOf = append(oneOf, emitArtifactInputBranchSchema(branch, properties))
	}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"description":          "Publish one finished Setta conversation artifact. Pick exactly one kind and provide only that kind's payload fields.",
		"required":             []string{"kind", "title"},
		"properties":           properties,
		"oneOf":                oneOf,
	}
}

func emitArtifactInputBranchSchema(
	branch emitArtifactBranchSpec,
	allProperties map[string]any,
) map[string]any {
	properties := map[string]any{
		"kind": map[string]any{
			"type":  "string",
			"const": string(branch.Kind),
		},
		"title": allProperties["title"],
	}
	required := []string{"kind", "title"}
	for _, name := range branch.Required {
		properties[name] = allProperties[name]
		required = append(required, name)
	}
	for _, name := range branch.Optional {
		properties[name] = allProperties[name]
	}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             required,
		"properties":           properties,
	}
}

func emitArtifactInputPropertySchemas() map[string]any {
	return map[string]any{
		"kind": map[string]any{
			"type": "string",
			"enum": []string{
				string(ArtifactKindMarkdown),
				string(ArtifactKindTable),
				string(ArtifactKindBarChart),
				string(ArtifactKindFile),
			},
		},
		"title": map[string]any{
			"type":        "string",
			"description": "Short artifact title.",
		},
		"markdown": map[string]any{
			"type":        "string",
			"description": "Markdown payload for markdown artifacts.",
			"maxLength":   MaxMarkdownArtifactBytes,
		},
		"columns": map[string]any{
			"type":        "array",
			"description": "Table columns for table artifacts.",
			"minItems":    1,
			"maxItems":    MaxTableArtifactColumns,
			"items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"key", "label"},
				"properties": map[string]any{
					"key":   map[string]any{"type": "string"},
					"label": map[string]any{"type": "string"},
				},
			},
		},
		"rows": map[string]any{
			"type":        "array",
			"description": "Table rows for table artifacts; each row must match the column count.",
			"maxItems":    MaxTableArtifactRows,
			"items": map[string]any{
				"type":  "array",
				"items": map[string]any{"type": "string"},
			},
		},
		"items": map[string]any{
			"type":        "array",
			"description": "Bar chart items for bar_chart artifacts.",
			"minItems":    1,
			"maxItems":    MaxBarChartArtifactItems,
			"items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"label", "value"},
				"properties": map[string]any{
					"label": map[string]any{"type": "string"},
					"value": map[string]any{"type": "number", "minimum": 0},
					"unit":  map[string]any{"type": "string"},
				},
			},
		},
		"path": map[string]any{
			"type":        "string",
			"description": "File path for file artifacts.",
		},
		"description": map[string]any{
			"type":        "string",
			"description": "Optional file description.",
		},
	}
}

func topicAgentDeveloperInstructions() string {
	return `Act as the durable primary agent for this Setta topic conversation.

Durable user-facing deliverables are emitted through setta.emit_artifact.
Use the table artifact branch for naturally tabular deliverables.
Use the bar_chart artifact branch for quantitative comparisons where magnitude matters.
Use the markdown artifact branch for durable narrative deliverables.
Use the file artifact branch when the deliverable is a concrete file path or reference.
Do not emit an artifact for short conversational answers, exact-text confirmations, acknowledgements, or status replies that do not create standalone durable content.
Final prose summarizes the outcome but is not a substitute for emitting a durable artifact when the response creates a deliverable.`
}

func (service *Service) topicAgentArtifactTools(
	workspaceID string,
	conversationID string,
	turnID string,
) []agent.DynamicTool {
	return []agent.DynamicTool{{
		Namespace:            artifactToolNamespace,
		NamespaceDescription: "Setta conversation tools.",
		Name:                 artifactToolName,
		Description:          "Publish a durable typed artifact for the current Setta topic conversation turn.",
		InputSchema:          append(json.RawMessage{}, emitArtifactInputSchemaJSON...),
		Handler: func(ctx context.Context, call agent.DynamicToolCall) (agent.DynamicToolResult, error) {
			artifact, err := service.emitArtifactFromTool(ctx, workspaceID, conversationID, turnID, call)
			if err != nil {
				return agent.DynamicToolResult{}, err
			}
			return artifactToolResult(artifact)
		},
	}}
}

func (service *Service) emitArtifactFromTool(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
) (Artifact, error) {
	if err := service.validateArtifactToolRequest(ctx, conversationID, turnID, call); err != nil {
		return Artifact{}, err
	}
	input, err := decodeEmitArtifactInput(call.Arguments)
	if err != nil {
		return Artifact{}, err
	}
	artifactID, trajectoryID, err := service.newArtifactToolIDs()
	if err != nil {
		return Artifact{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	return service.persistArtifactToolEmission(ctx, workspaceID, conversationID, turnID, call, input, artifactID, trajectoryID)
}

func (service *Service) validateArtifactToolRequest(
	ctx context.Context,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
) error {
	if service == nil {
		return errors.New("conversation service is required")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if call.Namespace != artifactToolNamespace || call.Tool != artifactToolName {
		return fmt.Errorf("unsupported dynamic tool %s.%s", call.Namespace, call.Tool)
	}
	if call.ConversationID != conversationID || call.TurnID != turnID {
		return fmt.Errorf("artifact tool call scoped to %s/%s, want %s/%s", call.ConversationID, call.TurnID, conversationID, turnID)
	}
	return nil
}

func (service *Service) newArtifactToolIDs() (string, string, error) {
	artifactID, err := service.newID("artifact")
	if err != nil {
		return "", "", fmt.Errorf("create artifact id: %w", err)
	}
	trajectoryID, err := service.newID("trajectory")
	if err != nil {
		return "", "", fmt.Errorf("create artifact trajectory id: %w", err)
	}
	return artifactID, trajectoryID, nil
}

func (service *Service) persistArtifactToolEmission(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
	input emitArtifactInput,
	artifactID string,
	trajectoryID string,
) (Artifact, error) {
	active, err := service.requireActiveArtifactToolTurn(workspaceID, conversationID, turnID, call)
	if err != nil {
		return Artifact{}, err
	}
	snapshot, turn, err := service.runningProgressState(ctx, active)
	if err != nil {
		return Artifact{}, err
	}
	now := service.timestamp()
	artifact := input.artifact(artifactID, conversationID, turnID, now)
	sequence := snapshot.Conversation.LastTrajectorySequence + 1
	artifact.TrajectorySequence = &sequence
	if err := artifact.Validate(); err != nil {
		return Artifact{}, err
	}
	callID := call.CallID
	providerThreadID := call.ProviderThreadID
	providerTurnID := call.ProviderTurnID
	trajectory := TrajectoryEvent{
		ID:               trajectoryID,
		ConversationID:   conversationID,
		TurnID:           &turn.ID,
		Sequence:         sequence,
		EmittedAt:        now,
		Kind:             TrajectoryEventArtifactEmitted,
		Actor:            TrajectoryActorSystem,
		ProviderEventID:  &callID,
		ProviderThreadID: &providerThreadID,
		ProviderTurnID:   &providerTurnID,
		ArtifactEmitted:  &TrajectoryArtifactEmitted{ArtifactID: artifact.ID},
	}
	publications, err := service.publications(
		conversationID,
		now,
		ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: trajectory},
		ConversationArtifactCreatedEventPayload{Type: ConversationEventTypeArtifactCreated, Artifact: artifact.Metadata()},
	)
	if err != nil {
		return Artifact{}, err
	}
	if err := service.commitArtifactToolEmission(ctx, snapshot, turn.ID, trajectory, artifact, publications); err != nil {
		return Artifact{}, err
	}
	return artifact, nil
}

func (service *Service) requireActiveArtifactToolTurn(
	workspaceID string,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
) (*activeConversationTurn, error) {
	active := service.activeFor(conversationID)
	if active == nil {
		return nil, &CommandConflictError{ConversationID: conversationID, Reason: "artifact tool requires an active topic turn"}
	}
	if active.workspaceID != workspaceID || active.turnID != turnID {
		return nil, fmt.Errorf("artifact tool active turn is %s/%s, want %s/%s", active.workspaceID, active.turnID, workspaceID, turnID)
	}
	if active.providerThreadID != call.ProviderThreadID || active.providerTurnID != call.ProviderTurnID {
		return nil, fmt.Errorf("artifact tool provider scope %s/%s does not match active turn %s/%s", call.ProviderThreadID, call.ProviderTurnID, active.providerThreadID, active.providerTurnID)
	}
	return active, nil
}

func (service *Service) commitArtifactToolEmission(
	ctx context.Context,
	snapshot ConversationSnapshot,
	turnID string,
	trajectory TrajectoryEvent,
	artifact Artifact,
	publications []preparedPublication,
) error {
	_, err := service.store.transactPresentationAware(ctx, "emit topic conversation artifact", func(transaction *WriteTransaction) error {
		if err := transaction.AppendTrajectoryEvent(trajectory); err != nil {
			return err
		}
		if err := transaction.InsertArtifact(artifact); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	if err == nil {
		service.observeCommittedTrajectory(snapshot.Conversation, turnID, []TrajectoryEvent{trajectory}, false)
	}
	return err
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
	if !validArtifactKind(input.Kind) {
		return emitArtifactInput{}, fmt.Errorf("unsupported artifact kind %s", input.Kind)
	}
	if err := validateEmitArtifactInputBranches(input); err != nil {
		return emitArtifactInput{}, err
	}
	return input, nil
}

func validateEmitArtifactInputBranches(input emitArtifactInput) error {
	if err := validateRequiredArtifactText("artifact title", input.Title); err != nil {
		return err
	}
	branch, ok := emitArtifactBranchSpecForKind(input.Kind)
	if !ok {
		return fmt.Errorf("unsupported artifact kind %s", input.Kind)
	}
	for _, name := range branch.Required {
		if !emitArtifactInputFieldPresent(input, name) {
			return fmt.Errorf("%s artifact requires %s", input.Kind, name)
		}
	}
	allowed := map[string]bool{}
	for _, name := range branch.Required {
		allowed[name] = true
	}
	for _, name := range branch.Optional {
		allowed[name] = true
	}
	for _, name := range emitArtifactInputPayloadFields() {
		if emitArtifactInputFieldPresent(input, name) && !allowed[name] {
			return fmt.Errorf("%s is not valid for this artifact kind", name)
		}
	}
	return nil
}

func emitArtifactBranchSpecForKind(kind ArtifactKind) (emitArtifactBranchSpec, bool) {
	for _, branch := range emitArtifactBranchSpecs() {
		if branch.Kind == kind {
			return branch, true
		}
	}
	return emitArtifactBranchSpec{}, false
}

func emitArtifactInputPayloadFields() []string {
	seen := map[string]bool{}
	fields := make([]string, 0)
	for _, branch := range emitArtifactBranchSpecs() {
		for _, name := range append(append([]string{}, branch.Required...), branch.Optional...) {
			if !seen[name] {
				fields = append(fields, name)
				seen[name] = true
			}
		}
	}
	return fields
}

func emitArtifactInputFieldPresent(input emitArtifactInput, name string) bool {
	switch name {
	case "markdown":
		return input.Markdown != nil
	case "columns":
		return input.Columns != nil
	case "rows":
		return input.Rows != nil
	case "items":
		return input.Items != nil
	case "path":
		return input.Path != nil
	case "description":
		return input.Description != nil
	default:
		return false
	}
}

func (input emitArtifactInput) artifact(
	id string,
	conversationID string,
	turnID string,
	createdAt string,
) Artifact {
	artifact := Artifact{
		ID:             id,
		ConversationID: conversationID,
		TurnID:         &turnID,
		Kind:           input.Kind,
		Title:          input.Title,
		CreatedAt:      createdAt,
	}
	switch input.Kind {
	case ArtifactKindMarkdown:
		artifact.Markdown = &MarkdownArtifactPayload{Markdown: *input.Markdown}
	case ArtifactKindTable:
		artifact.Table = &TableArtifactPayload{
			Columns: append([]ArtifactTableColumn{}, (*input.Columns)...),
			Rows:    cloneArtifactRows(*input.Rows),
		}
	case ArtifactKindBarChart:
		artifact.BarChart = &BarChartArtifactPayload{
			Items: append([]BarChartArtifactItem{}, (*input.Items)...),
		}
	case ArtifactKindFile:
		artifact.File = &FileArtifactPayload{
			Path:        *input.Path,
			Description: cloneStringPointer(input.Description),
		}
	}
	return artifact
}

func cloneArtifactRows(rows [][]string) [][]string {
	cloned := make([][]string, 0, len(rows))
	for _, row := range rows {
		cloned = append(cloned, append([]string{}, row...))
	}
	return cloned
}

func artifactToolResult(artifact Artifact) (agent.DynamicToolResult, error) {
	payload := map[string]any{
		"artifactId": artifact.ID,
		"kind":       artifact.Kind,
		"title":      artifact.Title,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return agent.DynamicToolResult{}, fmt.Errorf("encode artifact acknowledgement: %w", err)
	}
	return agent.DynamicToolResult{
		ContentItems: []agent.DynamicToolContentItem{{
			Type: "inputText",
			Text: string(data),
		}},
		Success: true,
	}, nil
}
