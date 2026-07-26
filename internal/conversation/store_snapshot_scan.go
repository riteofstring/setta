package conversation

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"setta/internal/conversation/conversationpalette"
	"setta/internal/speech"
)

type sqlScanner interface {
	Scan(...any) error
}

func scanTopicConversation(scanner sqlScanner) (TopicConversation, error) {
	var value TopicConversation
	var workspaceID, archivedAt sql.NullString
	err := scanner.Scan(
		&value.ID,
		&workspaceID,
		&value.Title,
		&value.TopicDescriptor,
		&value.Status,
		&value.CreatedAt,
		&value.UpdatedAt,
		&archivedAt,
		&value.LastTrajectorySequence,
	)
	value.WorkspaceID = optionalScannedString(workspaceID)
	value.ArchivedAt = optionalScannedString(archivedAt)
	return value, err
}

func scanConversationTurn(scanner sqlScanner) (ConversationTurn, error) {
	var value ConversationTurn
	var authoredInputJSON string
	var requestedProfileJSON string
	var startedAt, endedAt, resolvedInvocationJSON, providerTurnID, failureJSON sql.NullString
	err := scanner.Scan(
		&value.ID,
		&value.ConversationID,
		&authoredInputJSON,
		&value.Delivery,
		&value.Status,
		&value.AcceptedAt,
		&startedAt,
		&endedAt,
		&requestedProfileJSON,
		&resolvedInvocationJSON,
		&providerTurnID,
		&failureJSON,
	)
	if err != nil {
		return ConversationTurn{}, err
	}
	value.StartedAt = optionalScannedString(startedAt)
	value.EndedAt = optionalScannedString(endedAt)
	value.ProviderTurnID = optionalScannedString(providerTurnID)
	if err := decodeJSON("turn authored input", authoredInputJSON, &value.AuthoredInput); err != nil {
		return ConversationTurn{}, err
	}
	if err := decodeJSON("turn requested role profile", requestedProfileJSON, &value.RequestedRoleProfile); err != nil {
		return ConversationTurn{}, err
	}
	if err := decodeOptionalJSON("turn resolved invocation", resolvedInvocationJSON, &value.ResolvedInvocation); err != nil {
		return ConversationTurn{}, err
	}
	if err := decodeOptionalJSON("turn failure", failureJSON, &value.Error); err != nil {
		return ConversationTurn{}, err
	}
	return value, nil
}

func scanTrajectoryEvent(scanner sqlScanner) (TrajectoryEvent, error) {
	var value TrajectoryEvent
	var turnID, providerEventID, providerTurnID sql.NullString
	var payloadJSON string
	err := scanner.Scan(
		&value.ID,
		&value.ConversationID,
		&turnID,
		&value.Sequence,
		&value.EmittedAt,
		&value.Kind,
		&value.Actor,
		&providerEventID,
		&providerTurnID,
		&payloadJSON,
	)
	if err != nil {
		return TrajectoryEvent{}, err
	}
	value.TurnID = optionalScannedString(turnID)
	value.ProviderEventID = optionalScannedString(providerEventID)
	value.ProviderTurnID = optionalScannedString(providerTurnID)
	if err := decodeTrajectoryPayload(&value, payloadJSON); err != nil {
		return TrajectoryEvent{}, err
	}
	return value, nil
}

func decodeTrajectoryPayload(event *TrajectoryEvent, payloadJSON string) error {
	targetForKind, ok := trajectoryPayloadTargets[event.Kind]
	if !ok {
		return fmt.Errorf("decode unsupported trajectory kind %q", event.Kind)
	}
	return decodeJSON("trajectory payload", payloadJSON, targetForKind(event))
}

var trajectoryPayloadTargets = map[TrajectoryEventKind]func(*TrajectoryEvent) any{
	TrajectoryEventUserInputAccepted:             func(event *TrajectoryEvent) any { return &event.UserInputAccepted },
	TrajectoryEventTurnQueued:                    func(event *TrajectoryEvent) any { return &event.TurnQueued },
	TrajectoryEventTurnPromoted:                  func(event *TrajectoryEvent) any { return &event.TurnPromoted },
	TrajectoryEventTurnStarted:                   func(event *TrajectoryEvent) any { return &event.TurnStarted },
	TrajectoryEventTurnSteered:                   func(event *TrajectoryEvent) any { return &event.TurnSteered },
	TrajectoryEventTurnInterrupted:               func(event *TrajectoryEvent) any { return &event.TurnInterrupted },
	TrajectoryEventTurnCompleted:                 func(event *TrajectoryEvent) any { return &event.TurnCompleted },
	TrajectoryEventTurnFailed:                    func(event *TrajectoryEvent) any { return &event.TurnFailed },
	TrajectoryEventAgentPublicTextDelta:          func(event *TrajectoryEvent) any { return &event.AgentPublicTextDelta },
	TrajectoryEventAgentMessageCompleted:         func(event *TrajectoryEvent) any { return &event.AgentMessageCompleted },
	TrajectoryEventPublicReasoningSummaryUpdated: func(event *TrajectoryEvent) any { return &event.PublicReasoningSummaryUpdated },
	TrajectoryEventPlanChanged:                   func(event *TrajectoryEvent) any { return &event.PlanChanged },
	TrajectoryEventActivityStarted:               func(event *TrajectoryEvent) any { return &event.ActivityStarted },
	TrajectoryEventActivityProgressed:            func(event *TrajectoryEvent) any { return &event.ActivityProgressed },
	TrajectoryEventActivityCompleted:             func(event *TrajectoryEvent) any { return &event.ActivityCompleted },
	TrajectoryEventActivityFailed:                func(event *TrajectoryEvent) any { return &event.ActivityFailed },
	TrajectoryEventFileChangeProposed:            func(event *TrajectoryEvent) any { return &event.FileChangeProposed },
	TrajectoryEventFileChangeCompleted:           func(event *TrajectoryEvent) any { return &event.FileChangeCompleted },
	TrajectoryEventApprovalRequested:             func(event *TrajectoryEvent) any { return &event.ApprovalRequested },
	TrajectoryEventApprovalResolved:              func(event *TrajectoryEvent) any { return &event.ApprovalResolved },
	TrajectoryEventSubagentStarted:               func(event *TrajectoryEvent) any { return &event.SubagentStarted },
	TrajectoryEventSubagentUpdated:               func(event *TrajectoryEvent) any { return &event.SubagentUpdated },
	TrajectoryEventSubagentCompleted:             func(event *TrajectoryEvent) any { return &event.SubagentCompleted },
	TrajectoryEventArtifactEmitted:               func(event *TrajectoryEvent) any { return &event.ArtifactEmitted },
	TrajectoryEventAgentLivenessChanged:          func(event *TrajectoryEvent) any { return &event.AgentLivenessChanged },
	TrajectoryEventProviderLifecycleChanged:      func(event *TrajectoryEvent) any { return &event.ProviderLifecycleChanged },
	TrajectoryEventValidationRecorded:            func(event *TrajectoryEvent) any { return &event.ValidationRecorded },
	TrajectoryEventModelRerouted:                 func(event *TrajectoryEvent) any { return &event.ModelRerouted },
}

func scanArtifact(scanner sqlScanner) (Artifact, error) {
	var value Artifact
	var turnID sql.NullString
	var trajectorySequence sql.NullInt64
	var markdownJSON, tableJSON, barChartJSON, fileJSON sql.NullString
	err := scanner.Scan(
		&value.ID,
		&value.ConversationID,
		&turnID,
		&trajectorySequence,
		&value.Kind,
		&value.Title,
		&markdownJSON,
		&tableJSON,
		&barChartJSON,
		&fileJSON,
		&value.CreatedAt,
	)
	if err != nil {
		return Artifact{}, err
	}
	value.TurnID = optionalScannedString(turnID)
	value.TrajectorySequence = optionalScannedInt(trajectorySequence)
	if err := decodeArtifactPayloadColumns(&value, markdownJSON, tableJSON, barChartJSON, fileJSON); err != nil {
		return Artifact{}, err
	}
	return value, nil
}

func scanArtifactMetadata(scanner sqlScanner) (ArtifactMetadata, error) {
	var value ArtifactMetadata
	var turnID sql.NullString
	var trajectorySequence sql.NullInt64
	err := scanner.Scan(
		&value.ID,
		&value.ConversationID,
		&turnID,
		&trajectorySequence,
		&value.Kind,
		&value.Title,
		&value.CreatedAt,
	)
	if err != nil {
		return ArtifactMetadata{}, err
	}
	value.TurnID = optionalScannedString(turnID)
	value.TrajectorySequence = optionalScannedInt(trajectorySequence)
	if err := value.Validate(); err != nil {
		return ArtifactMetadata{}, err
	}
	return value, nil
}

func decodeArtifactPayloadColumns(
	artifact *Artifact,
	markdownJSON sql.NullString,
	tableJSON sql.NullString,
	barChartJSON sql.NullString,
	fileJSON sql.NullString,
) error {
	if markdownJSON.Valid {
		var payload MarkdownArtifactPayload
		if err := decodeJSON("markdown artifact payload", markdownJSON.String, &payload); err != nil {
			return err
		}
		artifact.Markdown = &payload
	}
	if tableJSON.Valid {
		var payload TableArtifactPayload
		if err := decodeJSON("table artifact payload", tableJSON.String, &payload); err != nil {
			return err
		}
		artifact.Table = &payload
	}
	if barChartJSON.Valid {
		var payload BarChartArtifactPayload
		if err := decodeJSON("bar chart artifact payload", barChartJSON.String, &payload); err != nil {
			return err
		}
		artifact.BarChart = &payload
	}
	if fileJSON.Valid {
		var payload FileArtifactPayload
		if err := decodeJSON("file artifact payload", fileJSON.String, &payload); err != nil {
			return err
		}
		artifact.File = &payload
	}
	return artifact.Validate()
}

func scanNarratorState(scanner sqlScanner) (NarratorState, error) {
	var value NarratorState
	var lastInvocationAt, degradationJSON sql.NullString
	err := scanner.Scan(
		&value.ConversationID,
		&value.ObservedThroughSequence,
		&value.CheckpointThroughSequence,
		&value.CheckpointText,
		&value.CurrentFocus,
		&value.CurrentFocusRevision,
		&value.CurrentFocusSourceSequence,
		&value.TopicDescriptor,
		&lastInvocationAt,
		&value.Status,
		&degradationJSON,
		&value.UpdatedAt,
	)
	if err != nil {
		return NarratorState{}, err
	}
	value.LastInvocationAt = optionalScannedString(lastInvocationAt)
	if err := decodeOptionalJSON("narrator degradation", degradationJSON, &value.Degradation); err != nil {
		return NarratorState{}, err
	}
	return value, nil
}

func scanNarrationEvent(scanner sqlScanner) (NarrationEvent, error) {
	var value NarrationEvent
	var turnID sql.NullString
	var payloadJSON, invocationJSON string
	err := scanner.Scan(
		&value.ID,
		&value.ConversationID,
		&turnID,
		&value.StreamSequence,
		&value.Kind,
		&value.SourceSequenceStart,
		&value.SourceSequenceEnd,
		&value.Trigger,
		&payloadJSON,
		&invocationJSON,
		&value.CreatedAt,
	)
	if err != nil {
		return NarrationEvent{}, err
	}
	value.TurnID = optionalScannedString(turnID)
	if err := decodeJSON("narration invocation", invocationJSON, &value.ResolvedInvocation); err != nil {
		return NarrationEvent{}, err
	}
	var target any
	switch value.Kind {
	case NarrationEventKindMilestone:
		target = &value.Milestone
	case NarrationEventKindStatusReply:
		target = &value.StatusReply
	case NarrationEventKindFinalSummary:
		target = &value.FinalSummary
	case NarrationEventKindTopicDescriptor:
		target = &value.TopicDescriptor
	default:
		return NarrationEvent{}, fmt.Errorf("decode unsupported narration kind %q", value.Kind)
	}
	if err := decodeJSON("narration payload", payloadJSON, target); err != nil {
		return NarrationEvent{}, err
	}
	return value, nil
}

func scanPresentationProfile(scanner sqlScanner) (ConversationPresentationProfile, error) {
	var value ConversationPresentationProfile
	var state presentationProfileScanState
	if err := scanner.Scan(state.targets(&value)...); err != nil {
		return ConversationPresentationProfile{}, err
	}
	if err := state.finish(&value); err != nil {
		return ConversationPresentationProfile{}, err
	}
	return value, nil
}

type presentationProfileScanState struct {
	requestedPaletteID sql.NullString
	paletteReuseJSON   sql.NullString
	requestedVoiceID   sql.NullString
	resolvedVoiceID    sql.NullString
	voiceReuseJSON     sql.NullString
	speechEnabled      int
}

func (state *presentationProfileScanState) targets(value *ConversationPresentationProfile) []any {
	return []any{
		&value.ConversationID,
		&value.PaletteSelection,
		&state.requestedPaletteID,
		&value.ResolvedPaletteID,
		&state.paletteReuseJSON,
		&value.NarratorVoiceSelection,
		&state.requestedVoiceID,
		&state.resolvedVoiceID,
		&state.voiceReuseJSON,
		&state.speechEnabled,
		&value.UpdatedAt,
	}
}

func (state *presentationProfileScanState) finish(value *ConversationPresentationProfile) error {
	if state.requestedPaletteID.Valid {
		id := conversationpalette.ConversationPaletteID(state.requestedPaletteID.String)
		value.RequestedPaletteID = &id
	}
	value.RequestedNarratorVoiceID = optionalSpeechVoiceID(state.requestedVoiceID)
	value.ResolvedNarratorVoiceID = optionalSpeechVoiceID(state.resolvedVoiceID)
	value.NarratorSpeechEnabled = state.speechEnabled == 1
	if err := decodeOptionalJSON("presentation palette reuse", state.paletteReuseJSON, &value.PaletteReuse); err != nil {
		return err
	}
	if err := decodeOptionalJSON("presentation voice reuse", state.voiceReuseJSON, &value.NarratorVoiceReuse); err != nil {
		return err
	}
	return nil
}

func optionalSpeechVoiceID(value sql.NullString) *speech.SpeechVoiceID {
	if !value.Valid {
		return nil
	}
	voiceID := speech.SpeechVoiceID(value.String)
	return &voiceID
}

func scanConversationBranch(scanner sqlScanner) (ConversationBranch, error) {
	var value ConversationBranch
	var forkedAtTurnID sql.NullString
	err := scanner.Scan(
		&value.ChildConversationID,
		&value.ParentConversationID,
		&value.Kind,
		&value.DecisionSource,
		&forkedAtTurnID,
		&value.SourceTrajectorySequence,
		&value.CreatedAt,
	)
	if err != nil {
		return ConversationBranch{}, err
	}
	value.ForkedAtTurnID = forkedAtTurnID.String
	return value, nil
}

func scanSideConversation(scanner sqlScanner) (SideConversation, error) {
	var value SideConversation
	var sourceTurnID, activeTurnID, disposedAt, failureJSON sql.NullString
	var invocationJSON string
	err := scanner.Scan(
		&value.ID,
		&value.ParentConversationID,
		&value.DecisionSource,
		&sourceTurnID,
		&value.SourceTrajectorySequence,
		&value.LastEventSequence,
		&activeTurnID,
		&value.Status,
		&invocationJSON,
		&value.CreatedAt,
		&value.UpdatedAt,
		&disposedAt,
		&failureJSON,
	)
	if err != nil {
		return SideConversation{}, err
	}
	value.SourceTurnID = optionalScannedString(sourceTurnID)
	value.ActiveTurnID = optionalScannedString(activeTurnID)
	value.DisposedAt = optionalScannedString(disposedAt)
	if err := decodeJSON("side invocation", invocationJSON, &value.ResolvedSideAgentInvocation); err != nil {
		return SideConversation{}, err
	}
	if err := decodeOptionalJSON("side failure", failureJSON, &value.Failure); err != nil {
		return SideConversation{}, err
	}
	return value, nil
}

func decodeJSON(label string, encoded string, target any) error {
	if err := json.Unmarshal([]byte(encoded), target); err != nil {
		return fmt.Errorf("decode %s: %w", label, err)
	}
	return nil
}

func decodeOptionalJSON(label string, encoded sql.NullString, target any) error {
	if !encoded.Valid {
		return nil
	}
	return decodeJSON(label, encoded.String, target)
}

func optionalScannedInt(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	result := int(value.Int64)
	return &result
}
