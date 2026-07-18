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

var emitArtifactInputSchemaJSON = json.RawMessage(`{
  "type": "object",
  "additionalProperties": false,
  "description": "Publish one finished Setta conversation artifact. Pick exactly one kind and provide only that kind's payload fields.",
  "required": ["kind", "title"],
  "properties": {
    "kind": {
      "type": "string",
      "enum": ["markdown", "table", "bar_chart", "file"]
    },
    "title": {
      "type": "string",
      "description": "Short artifact title."
    },
    "markdown": {
      "type": "string",
      "description": "Markdown payload for markdown artifacts."
    },
    "columns": {
      "type": "array",
      "description": "Table columns for table artifacts.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["key", "label"],
        "properties": {
          "key": { "type": "string" },
          "label": { "type": "string" }
        }
      }
    },
    "rows": {
      "type": "array",
      "description": "Table rows for table artifacts; each row must match the column count.",
      "items": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "items": {
      "type": "array",
      "description": "Bar chart items for bar_chart artifacts.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["label", "value"],
        "properties": {
          "label": { "type": "string" },
          "value": { "type": "number" },
          "unit": { "type": "string" }
        }
      }
    },
    "path": {
      "type": "string",
      "description": "File path for file artifacts."
    },
    "description": {
      "type": "string",
      "description": "Optional file description."
    }
  },
  "oneOf": [
    {
      "properties": { "kind": { "const": "markdown" } },
      "required": ["kind", "markdown"]
    },
    {
      "properties": { "kind": { "const": "table" } },
      "required": ["kind", "columns", "rows"]
    },
    {
      "properties": { "kind": { "const": "bar_chart" } },
      "required": ["kind", "items"]
    },
    {
      "properties": { "kind": { "const": "file" } },
      "required": ["kind", "path"]
    }
  ]
}`)

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
	switch input.Kind {
	case ArtifactKindMarkdown:
		if input.Markdown == nil {
			return errors.New("markdown artifact requires markdown")
		}
		return rejectUnexpectedArtifactFields("columns", input.Columns != nil, "rows", input.Rows != nil, "items", input.Items != nil, "path", input.Path != nil, "description", input.Description != nil)
	case ArtifactKindTable:
		if input.Columns == nil || input.Rows == nil {
			return errors.New("table artifact requires columns and rows")
		}
		return rejectUnexpectedArtifactFields("markdown", input.Markdown != nil, "items", input.Items != nil, "path", input.Path != nil, "description", input.Description != nil)
	case ArtifactKindBarChart:
		if input.Items == nil {
			return errors.New("bar_chart artifact requires items")
		}
		return rejectUnexpectedArtifactFields("markdown", input.Markdown != nil, "columns", input.Columns != nil, "rows", input.Rows != nil, "path", input.Path != nil, "description", input.Description != nil)
	case ArtifactKindFile:
		if input.Path == nil {
			return errors.New("file artifact requires path")
		}
		return rejectUnexpectedArtifactFields("markdown", input.Markdown != nil, "columns", input.Columns != nil, "rows", input.Rows != nil, "items", input.Items != nil)
	default:
		return fmt.Errorf("unsupported artifact kind %s", input.Kind)
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
