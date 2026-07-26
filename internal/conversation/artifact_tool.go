package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/agent"
	"setta/internal/conversation/artifactdoc"
)

const (
	artifactToolNamespace = "setta"
	artifactToolName      = "emit_artifact"

	artifactToolFailureInvalidArguments      = "invalid_arguments"
	artifactToolFailureInvalidDocument       = "invalid_document"
	artifactToolFailureInvalidField          = "invalid_field"
	artifactToolFailureInvalidFileReference  = "invalid_file_reference"
	artifactToolFailureMissingRequiredFields = "missing_required_fields"
	artifactToolFailurePersistenceFailure    = "persistence_failure"
	artifactToolFailureStaleTurn             = "stale_turn"
)

// artifactCatalog is the one catalog every emitted document compiles against.
// It is built per call so no caller can mutate the manifest the compiler and
// the model-facing instructions share.
func artifactCatalog() artifactdoc.Catalog {
	return artifactdoc.SettaCatalogV1()
}

var emitArtifactInputSchemaJSON = mustEmitArtifactInputSchemaJSON()

type emitArtifactInput struct {
	Title    string `json:"title"`
	Source   string `json:"source"`
	document artifactdoc.Document
}

func mustEmitArtifactInputSchemaJSON() json.RawMessage {
	data, err := json.Marshal(emitArtifactInputSchema())
	if err != nil {
		panic(fmt.Sprintf("encode emit_artifact input schema: %v", err))
	}
	return json.RawMessage(data)
}

func emitArtifactInputSchema() map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"description":          "Publish one finished Setta conversation artifact as a Setta artifact document.",
		"required":             []string{"title", "source"},
		"properties": map[string]any{
			"title": map[string]any{
				"type":        "string",
				"description": "Short artifact title, rendered above the document.",
			},
			"source": map[string]any{
				"type":        "string",
				"description": "Setta artifact document source. Assign root exactly once to a " + string(artifactdoc.ComponentDocument) + " call.",
				"maxLength":   artifactdoc.MaxSourceBytes,
			},
		},
	}
}

// topicAgentDeveloperInstructions states the artifact policy, then hands the
// model the catalog's own generation reference. The reference is rendered from
// the same Go catalog the compiler accepts against, so the two cannot drift.
func topicAgentDeveloperInstructions() string {
	return `Act as the durable primary agent for this Setta topic conversation.

Durable user-facing deliverables are emitted through setta.emit_artifact.
Compose the deliverable as one artifact document: prose, tables, charts, code, metrics, and file references all belong in the same document rather than in separate artifacts.
Use FileReference only for an existing regular file inside the current authorized workspace. Omit FileReference when the topic has no authorized workspace.
When the topic has no authorized workspace, treat the absolute process working-directory path as a private Setta execution detail. Never mention it or publish it in an artifact.
Do not emit an artifact for short conversational answers, exact-text confirmations, acknowledgements, or status replies that do not create standalone durable content.
If setta.emit_artifact returns a failure with retryable true, correct the listed fieldErrors and retry setta.emit_artifact before completing the turn.
Final prose summarizes the outcome but is not a substitute for emitting a durable artifact when the response creates a deliverable.

` + artifactCatalog().GenerationInstructions()
}

func (service *Service) topicAgentArtifactTools(
	scope conversationExecutionScope,
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
			return service.handleArtifactToolCall(ctx, scope, conversationID, turnID, call)
		},
	}}
}

func (service *Service) handleArtifactToolCall(
	ctx context.Context,
	scope conversationExecutionScope,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
) (agent.DynamicToolResult, error) {
	artifact, err := service.emitArtifactFromTool(ctx, scope, conversationID, turnID, call)
	if err == nil {
		return artifactToolResult(artifact)
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return agent.DynamicToolResult{}, ctxErr
	}
	failure, ok := artifactToolFailureFromError(call, err)
	if !ok {
		return agent.DynamicToolResult{}, err
	}
	if recordErr := service.persistArtifactToolFailure(ctx, conversationID, turnID, call, failure); recordErr != nil {
		failure = artifactToolPersistenceFailure(call, recordErr)
	}
	return agent.DynamicToolFailureResult(failure)
}

func (service *Service) emitArtifactFromTool(
	ctx context.Context,
	scope conversationExecutionScope,
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
	if _, err := service.requireActiveArtifactToolTurn(scope, conversationID, turnID, call); err != nil {
		return Artifact{}, artifactToolStaleTurnError(err)
	}
	if err := validateEmitArtifactPrivateExecutionDetails(input, scope); err != nil {
		return Artifact{}, err
	}
	// File references are authorized against the user's own folder, never against
	// the directory the provider process happens to run in.
	if err := validateEmitArtifactFileReferences(input.document, scope.authorizedRoot); err != nil {
		return Artifact{}, err
	}
	artifactID, trajectoryID, err := service.newArtifactToolIDs()
	if err != nil {
		return Artifact{}, newArtifactToolFailureError(
			artifactToolFailurePersistenceFailure,
			"artifact persistence failed before the artifact could be stored",
			false,
			nil,
			err,
		)
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	return service.persistArtifactToolEmission(ctx, scope, conversationID, turnID, call, input, artifactID, trajectoryID)
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
	scope conversationExecutionScope,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
	input emitArtifactInput,
	artifactID string,
	trajectoryID string,
) (Artifact, error) {
	active, err := service.requireActiveArtifactToolTurn(scope, conversationID, turnID, call)
	if err != nil {
		return Artifact{}, artifactToolStaleTurnError(err)
	}
	snapshot, turn, err := service.runningProgressState(ctx, active)
	if err != nil {
		return Artifact{}, artifactToolStaleTurnError(err)
	}
	now := service.timestamp()
	artifact := input.artifact(artifactID, conversationID, turnID, now)
	sequence := snapshot.Conversation.LastTrajectorySequence + 1
	artifact.TrajectorySequence = &sequence
	if err := artifact.Validate(); err != nil {
		return Artifact{}, newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			err.Error(),
			true,
			nil,
			err,
		)
	}
	callID := call.CallID
	providerTurnID := call.ProviderTurnID
	trajectory := TrajectoryEvent{
		ID:              trajectoryID,
		ConversationID:  conversationID,
		TurnID:          &turn.ID,
		Sequence:        sequence,
		EmittedAt:       now,
		Kind:            TrajectoryEventArtifactEmitted,
		Actor:           TrajectoryActorSystem,
		ProviderEventID: &callID,
		ProviderTurnID:  &providerTurnID,
		ArtifactEmitted: &TrajectoryArtifactEmitted{
			ArtifactID: artifact.ID,
			Title:      artifact.Title,
		},
	}
	publications, err := service.publications(
		conversationID,
		now,
		ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: trajectory},
		ConversationArtifactCreatedEventPayload{Type: ConversationEventTypeArtifactCreated, Artifact: artifact.Metadata()},
	)
	if err != nil {
		return Artifact{}, newArtifactToolFailureError(
			artifactToolFailurePersistenceFailure,
			"artifact persistence failed before the artifact could be published",
			false,
			nil,
			err,
		)
	}
	if err := service.commitArtifactToolEmission(ctx, snapshot, turn, trajectory, artifact, publications); err != nil {
		return Artifact{}, newArtifactToolFailureError(
			artifactToolFailurePersistenceFailure,
			"artifact persistence failed before the artifact could be stored",
			false,
			nil,
			err,
		)
	}
	return artifact, nil
}

func (service *Service) requireActiveArtifactToolTurn(
	scope conversationExecutionScope,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
) (*activeConversationTurn, error) {
	active := service.activeFor(conversationID)
	if active == nil {
		return nil, &CommandConflictError{ConversationID: conversationID, Reason: "artifact tool requires an active topic turn"}
	}
	if !equalOptionalString(active.scope.workspaceID, scope.workspaceID) || active.turnID != turnID {
		return nil, fmt.Errorf(
			"artifact tool active turn is %s/%s, want %s/%s",
			optionalWorkspaceLabel(active.scope.workspaceID),
			active.turnID,
			optionalWorkspaceLabel(scope.workspaceID),
			turnID,
		)
	}
	if active.providerThreadID != call.ProviderThreadID || active.providerTurnID != call.ProviderTurnID {
		return nil, fmt.Errorf("artifact tool provider scope %s/%s does not match active turn %s/%s", call.ProviderThreadID, call.ProviderTurnID, active.providerThreadID, active.providerTurnID)
	}
	return active, nil
}

func (service *Service) commitArtifactToolEmission(
	ctx context.Context,
	snapshot ConversationSnapshot,
	turn ConversationTurn,
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
		service.observeCommittedTrajectory(
			snapshot.Conversation,
			turn,
			[]TrajectoryEvent{trajectory},
			[]ArtifactMetadata{artifact.Metadata()},
			false,
		)
	}
	return err
}

func (input emitArtifactInput) artifact(
	id string,
	conversationID string,
	turnID string,
	createdAt string,
) Artifact {
	return Artifact{
		ID:             id,
		ConversationID: conversationID,
		TurnID:         &turnID,
		Title:          input.Title,
		CreatedAt:      createdAt,
		Document: ArtifactDocument{
			Language:  ArtifactDocumentLanguageOpenUI,
			CatalogID: ArtifactCatalogSettaV1,
			Source:    input.Source,
		},
	}
}

func artifactToolResult(artifact Artifact) (agent.DynamicToolResult, error) {
	payload := map[string]any{
		"artifactId": artifact.ID,
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
