package conversation

import (
	"fmt"
	"reflect"
	"strconv"

	"setta/internal/workspaceui/conversationpalette"
)

const (
	ConversationContractSchemaVersion = 1

	MaxSnapshotTurns             = 50
	MaxSnapshotQueuedTurns       = 50
	MaxSnapshotTrajectoryEvents  = 200
	MaxSnapshotArtifacts         = 100
	MaxSnapshotNarrationEvents   = 100
	MaxSnapshotRoleOverrides     = 4
	MaxSnapshotSideConversations = 32
)

type ConversationEventType string

const (
	ConversationEventTypeConversationUpdated          ConversationEventType = "conversation.updated"
	ConversationEventTypeTurnUpdated                  ConversationEventType = "conversation.turn.updated"
	ConversationEventTypeQueueUpdated                 ConversationEventType = "conversation.queue.updated"
	ConversationEventTypeThreadBindingUpdated         ConversationEventType = "conversation.thread_binding.updated"
	ConversationEventTypeTrajectoryAppended           ConversationEventType = "conversation.trajectory.appended"
	ConversationEventTypeArtifactCreated              ConversationEventType = "conversation.artifact.created"
	ConversationEventTypeNarratorStateUpdated         ConversationEventType = "conversation.narrator_state.updated"
	ConversationEventTypeNarrationCreated             ConversationEventType = "conversation.narration.created"
	ConversationEventTypeRoleProfileOverrideUpdated   ConversationEventType = "conversation.role_profile_override.updated"
	ConversationEventTypePresentationProfileUpdated   ConversationEventType = "conversation.presentation_profile.updated"
	ConversationEventTypeBranchCreated                ConversationEventType = "conversation.branch.created"
	ConversationEventTypeSideConversationUpdated      ConversationEventType = "conversation.side_conversation.updated"
	ConversationEventTypeSideConversationEventCreated ConversationEventType = "conversation.side_conversation.event.created"
	ConversationEventTypeResyncRequired               ConversationEventType = "conversation.resync_required"
)

var conversationEventTypeValues = []ConversationEventType{
	ConversationEventTypeConversationUpdated,
	ConversationEventTypeTurnUpdated,
	ConversationEventTypeQueueUpdated,
	ConversationEventTypeThreadBindingUpdated,
	ConversationEventTypeTrajectoryAppended,
	ConversationEventTypeArtifactCreated,
	ConversationEventTypeNarratorStateUpdated,
	ConversationEventTypeNarrationCreated,
	ConversationEventTypeRoleProfileOverrideUpdated,
	ConversationEventTypePresentationProfileUpdated,
	ConversationEventTypeBranchCreated,
	ConversationEventTypeSideConversationUpdated,
	ConversationEventTypeSideConversationEventCreated,
	ConversationEventTypeResyncRequired,
}

type ConversationEventCursor struct {
	StreamID string `json:"streamId"`
	Sequence int    `json:"sequence"`
}

type ConversationTurnWindow struct {
	Turns      []ConversationTurn `json:"turns"`
	HasEarlier bool               `json:"hasEarlier"`
}

type ConversationTrajectoryWindow struct {
	Events     []TrajectoryEvent `json:"events"`
	HasEarlier bool              `json:"hasEarlier"`
}

type ConversationArtifactWindow struct {
	Artifacts  []Artifact `json:"artifacts"`
	HasEarlier bool       `json:"hasEarlier"`
}

type ConversationNarrationWindow struct {
	Events     []NarrationEvent `json:"events"`
	HasEarlier bool             `json:"hasEarlier"`
}

// ConversationSnapshot is a bounded, renderer-safe cold-start projection.
// Historical pages remain separate from this contract so reopening a topic
// cannot grow one response or one renderer commit without bound.
type ConversationSnapshot struct {
	SchemaVersion        int                             `json:"schemaVersion"`
	Conversation         TopicConversation               `json:"conversation"`
	Turns                ConversationTurnWindow          `json:"turns"`
	Queue                []QueuedConversationTurn        `json:"queue"`
	ThreadBinding        *AgentThreadBinding             `json:"threadBinding"`
	Trajectory           ConversationTrajectoryWindow    `json:"trajectory"`
	CurrentProjection    ConversationCurrentProjection   `json:"currentProjection"`
	Artifacts            ConversationArtifactWindow      `json:"artifacts"`
	NarratorState        NarratorState                   `json:"narratorState"`
	Narration            ConversationNarrationWindow     `json:"narration"`
	RoleProfileOverrides []RoleProfileOverride           `json:"roleProfileOverrides"`
	PresentationProfile  ConversationPresentationProfile `json:"presentationProfile"`
	Branch               *ConversationBranch             `json:"branch"`
	SideConversations    []SideConversation              `json:"sideConversations"`
	EventCursor          ConversationEventCursor         `json:"eventCursor"`
}

// ConversationEvent keeps the durable stream envelope independent from its
// exhaustive payload union. Generated TypeScript narrows payload.type to the
// exact variant, allowing renderer switches to use never assertions.
type ConversationEvent struct {
	SchemaVersion  int                      `json:"schemaVersion"`
	StreamID       string                   `json:"streamId"`
	Sequence       int                      `json:"sequence"`
	EventID        string                   `json:"eventId"`
	EmittedAt      string                   `json:"emittedAt"`
	WorkspaceID    string                   `json:"workspaceId"`
	ConversationID string                   `json:"conversationId"`
	Payload        ConversationEventPayload `json:"payload"`
}

type ConversationEventPayload interface {
	conversationEventType() ConversationEventType
	validateConversationEventPayload(workspaceID string, conversationID string) error
}

type ConversationEventSubscription interface {
	Events() <-chan ConversationEvent
	Unsubscribe()
}

type ConversationUpdatedEventPayload struct {
	Type         ConversationEventType `json:"type"`
	Conversation TopicConversation     `json:"conversation"`
}

type ConversationTurnUpdatedEventPayload struct {
	Type ConversationEventType `json:"type"`
	Turn ConversationTurn      `json:"turn"`
}

type ConversationQueueUpdatedEventPayload struct {
	Type  ConversationEventType    `json:"type"`
	Queue []QueuedConversationTurn `json:"queue"`
}

type ConversationThreadBindingUpdatedEventPayload struct {
	Type    ConversationEventType `json:"type"`
	Binding AgentThreadBinding    `json:"binding"`
}

type ConversationTrajectoryAppendedEventPayload struct {
	Type  ConversationEventType `json:"type"`
	Event TrajectoryEvent       `json:"event"`
}

type ConversationArtifactCreatedEventPayload struct {
	Type     ConversationEventType `json:"type"`
	Artifact Artifact              `json:"artifact"`
}

type ConversationNarratorStateUpdatedEventPayload struct {
	Type  ConversationEventType `json:"type"`
	State NarratorState         `json:"state"`
}

type ConversationNarrationCreatedEventPayload struct {
	Type  ConversationEventType `json:"type"`
	Event NarrationEvent        `json:"event"`
}

type ConversationRoleProfileOverrideUpdatedEventPayload struct {
	Type     ConversationEventType `json:"type"`
	Override RoleProfileOverride   `json:"override"`
}

type ConversationPresentationProfileUpdatedEventPayload struct {
	Type    ConversationEventType           `json:"type"`
	Profile ConversationPresentationProfile `json:"profile"`
}

type ConversationBranchCreatedEventPayload struct {
	Type   ConversationEventType `json:"type"`
	Branch ConversationBranch    `json:"branch"`
}

type ConversationSideConversationUpdatedEventPayload struct {
	Type             ConversationEventType `json:"type"`
	SideConversation SideConversation      `json:"sideConversation"`
}

type ConversationSideConversationEventCreatedEventPayload struct {
	Type  ConversationEventType `json:"type"`
	Event SideConversationEvent `json:"event"`
}

type ConversationResyncRequiredEventPayload struct {
	Type              ConversationEventType `json:"type"`
	Reason            string                `json:"reason"`
	RequestedStreamID string                `json:"requestedStreamId"`
	RequestedSequence int                   `json:"requestedSequence"`
	CurrentStreamID   string                `json:"currentStreamId"`
	CurrentSequence   int                   `json:"currentSequence"`
}

func ConversationStreamID(conversationID string) (string, error) {
	if err := validateIdentifier("conversation event stream conversation id", conversationID); err != nil {
		return "", err
	}
	return "conversation:" + conversationID, nil
}

func ConversationEventID(streamID string, sequence int) (string, error) {
	if err := validateIdentifier("conversation event stream id", streamID); err != nil {
		return "", err
	}
	if sequence <= 0 {
		return "", fmt.Errorf("conversation event sequence must be positive: %d", sequence)
	}
	return streamID + ":" + strconv.Itoa(sequence), nil
}

func (cursor ConversationEventCursor) Validate(conversationID string) error {
	wantStreamID, err := ConversationStreamID(conversationID)
	if err != nil {
		return err
	}
	if cursor.StreamID != wantStreamID {
		return fmt.Errorf("conversation event cursor stream %q does not match %q", cursor.StreamID, wantStreamID)
	}
	if cursor.Sequence < 0 {
		return fmt.Errorf("conversation event cursor sequence must be non-negative: %d", cursor.Sequence)
	}
	return nil
}

func (snapshot ConversationSnapshot) Validate() error {
	if snapshot.SchemaVersion != ConversationContractSchemaVersion {
		return fmt.Errorf("conversation snapshot schema version must be %d", ConversationContractSchemaVersion)
	}
	if err := snapshot.Conversation.Validate(); err != nil {
		return err
	}
	conversationID := snapshot.Conversation.ID
	if err := validateSnapshotExecution(snapshot, conversationID); err != nil {
		return err
	}
	if err := snapshot.CurrentProjection.Validate(); err != nil {
		return err
	}
	if snapshot.CurrentProjection.ConversationID != conversationID || snapshot.CurrentProjection.UpdatedThroughSequence != snapshot.Conversation.LastTrajectorySequence {
		return fmt.Errorf("conversation current projection cursor or ownership does not match snapshot")
	}
	if err := validateSnapshotNarrator(snapshot, conversationID); err != nil {
		return err
	}
	if err := validateSnapshotConfiguration(snapshot, conversationID); err != nil {
		return err
	}
	return snapshot.EventCursor.Validate(conversationID)
}

func validateSnapshotExecution(snapshot ConversationSnapshot, conversationID string) error {
	if err := validateSnapshotTurns(snapshot.Turns, snapshot.Queue, conversationID); err != nil {
		return err
	}
	if err := validateSnapshotOwnedRecord("thread binding", conversationID, snapshot.ThreadBinding, func(binding AgentThreadBinding) (string, error) {
		return binding.ConversationID, binding.Validate()
	}); err != nil {
		return err
	}
	if err := validateSnapshotTrajectory(snapshot.Trajectory, snapshot.Conversation); err != nil {
		return err
	}
	if err := validateSnapshotArtifacts(snapshot.Artifacts, conversationID, snapshot.Conversation.LastTrajectorySequence); err != nil {
		return err
	}
	return nil
}

func validateSnapshotNarrator(snapshot ConversationSnapshot, conversationID string) error {
	if snapshot.NarratorState.ConversationID != conversationID {
		return fmt.Errorf("snapshot narrator state belongs to %q, want %q", snapshot.NarratorState.ConversationID, conversationID)
	}
	if err := snapshot.NarratorState.Validate(); err != nil {
		return err
	}
	if snapshot.NarratorState.ObservedThroughSequence > snapshot.Conversation.LastTrajectorySequence {
		return fmt.Errorf("snapshot narrator cursor exceeds the conversation trajectory")
	}
	if err := validateSnapshotNarration(snapshot.Narration, conversationID, snapshot.Conversation.LastTrajectorySequence); err != nil {
		return err
	}
	return nil
}

func validateSnapshotConfiguration(snapshot ConversationSnapshot, conversationID string) error {
	if err := validateSnapshotRoleOverrides(snapshot.RoleProfileOverrides, conversationID); err != nil {
		return err
	}
	if snapshot.PresentationProfile.ConversationID != conversationID {
		return fmt.Errorf("snapshot presentation profile belongs to %q, want %q", snapshot.PresentationProfile.ConversationID, conversationID)
	}
	if err := snapshot.PresentationProfile.Validate(); err != nil {
		return err
	}
	if err := validateSnapshotBranch(snapshot.Branch, conversationID); err != nil {
		return err
	}
	if err := validateSnapshotSides(snapshot.SideConversations, conversationID, snapshot.Conversation.LastTrajectorySequence); err != nil {
		return err
	}
	return nil
}

func validateSnapshotTurns(window ConversationTurnWindow, queue []QueuedConversationTurn, conversationID string) error {
	turns, err := validateSnapshotTurnWindow(window, conversationID)
	if err != nil {
		return err
	}
	return validateSnapshotQueue(queue, conversationID, turns)
}

func validateSnapshotTurnWindow(window ConversationTurnWindow, conversationID string) (map[string]ConversationTurn, error) {
	if window.Turns == nil {
		return nil, fmt.Errorf("conversation snapshot turns must be an array, not null")
	}
	if len(window.Turns) > MaxSnapshotTurns {
		return nil, fmt.Errorf("conversation snapshot turn window exceeds %d records", MaxSnapshotTurns)
	}
	if window.HasEarlier && len(window.Turns) == 0 {
		return nil, fmt.Errorf("conversation snapshot turn window cannot report earlier records while empty")
	}
	turns := make(map[string]ConversationTurn, len(window.Turns))
	previousKey := ""
	for _, turn := range window.Turns {
		if turn.ConversationID != conversationID {
			return nil, fmt.Errorf("snapshot turn %s belongs to %q, want %q", turn.ID, turn.ConversationID, conversationID)
		}
		if err := turn.Validate(); err != nil {
			return nil, err
		}
		key := turn.AcceptedAt + "\x00" + turn.ID
		if previousKey != "" && key <= previousKey {
			return nil, fmt.Errorf("conversation snapshot turns are not strictly ordered")
		}
		if _, exists := turns[turn.ID]; exists {
			return nil, fmt.Errorf("conversation snapshot turn %s is duplicated", turn.ID)
		}
		turns[turn.ID] = turn
		previousKey = key
	}
	return turns, nil
}

func validateSnapshotQueue(queue []QueuedConversationTurn, conversationID string, turns map[string]ConversationTurn) error {
	if queue == nil {
		return fmt.Errorf("conversation snapshot queue must be an array, not null")
	}
	if len(queue) > MaxSnapshotQueuedTurns {
		return fmt.Errorf("conversation snapshot queue exceeds %d records", MaxSnapshotQueuedTurns)
	}
	for index, queued := range queue {
		if err := queued.Validate(); err != nil {
			return err
		}
		if queued.ConversationID != conversationID || queued.Ordinal != index+1 {
			return fmt.Errorf("conversation snapshot queue is not a contiguous queue for %q", conversationID)
		}
		turn, ok := turns[queued.TurnID]
		if !ok || turn.Status != TurnStatusQueued || turn.Delivery != TurnDeliveryQueued {
			return fmt.Errorf("conversation snapshot queued turn %s is absent from the turn window", queued.TurnID)
		}
	}
	return nil
}

func validateSnapshotTrajectory(window ConversationTrajectoryWindow, conversation TopicConversation) error {
	if err := validateSnapshotTrajectoryShape(window, conversation); err != nil {
		return err
	}
	if conversation.LastTrajectorySequence == 0 {
		return nil
	}
	if err := validateSnapshotTrajectoryEvents(window.Events, conversation.ID); err != nil {
		return err
	}
	firstSequence := window.Events[0].Sequence
	lastSequence := window.Events[len(window.Events)-1].Sequence
	if lastSequence != conversation.LastTrajectorySequence {
		return fmt.Errorf("conversation snapshot trajectory ends at %d, want %d", lastSequence, conversation.LastTrajectorySequence)
	}
	if window.HasEarlier != (firstSequence > 1) {
		return fmt.Errorf("conversation snapshot trajectory hasEarlier disagrees with first sequence %d", firstSequence)
	}
	return nil
}

func validateSnapshotTrajectoryShape(window ConversationTrajectoryWindow, conversation TopicConversation) error {
	if window.Events == nil {
		return fmt.Errorf("conversation snapshot trajectory events must be an array, not null")
	}
	if len(window.Events) > MaxSnapshotTrajectoryEvents {
		return fmt.Errorf("conversation snapshot trajectory window exceeds %d events", MaxSnapshotTrajectoryEvents)
	}
	if conversation.LastTrajectorySequence == 0 {
		if len(window.Events) != 0 || window.HasEarlier {
			return fmt.Errorf("empty conversation trajectory cannot contain snapshot events")
		}
		return nil
	}
	if len(window.Events) == 0 {
		return fmt.Errorf("conversation snapshot must include the latest trajectory event")
	}
	return nil
}

func validateSnapshotTrajectoryEvents(events []TrajectoryEvent, conversationID string) error {
	for index, event := range events {
		if event.ConversationID != conversationID {
			return fmt.Errorf("snapshot trajectory event %s belongs to %q, want %q", event.ID, event.ConversationID, conversationID)
		}
		if err := event.Validate(); err != nil {
			return err
		}
		if index > 0 && event.Sequence != events[index-1].Sequence+1 {
			return fmt.Errorf("conversation snapshot trajectory window is not contiguous")
		}
	}
	return nil
}

func validateSnapshotArtifacts(window ConversationArtifactWindow, conversationID string, lastTrajectorySequence int) error {
	if window.Artifacts == nil {
		return fmt.Errorf("conversation snapshot artifacts must be an array, not null")
	}
	if len(window.Artifacts) > MaxSnapshotArtifacts {
		return fmt.Errorf("conversation snapshot artifact window exceeds %d records", MaxSnapshotArtifacts)
	}
	if window.HasEarlier && len(window.Artifacts) == 0 {
		return fmt.Errorf("conversation snapshot artifact window cannot report earlier records while empty")
	}
	previousKey := ""
	for _, artifact := range window.Artifacts {
		if err := validateSnapshotArtifact(artifact, conversationID, lastTrajectorySequence); err != nil {
			return err
		}
		key := artifact.CreatedAt + "\x00" + artifact.ID
		if previousKey != "" && key <= previousKey {
			return fmt.Errorf("conversation snapshot artifacts are not strictly ordered")
		}
		previousKey = key
	}
	return nil
}

func validateSnapshotArtifact(artifact Artifact, conversationID string, lastTrajectorySequence int) error {
	if artifact.ConversationID != conversationID {
		return fmt.Errorf("snapshot artifact %s belongs to %q, want %q", artifact.ID, artifact.ConversationID, conversationID)
	}
	if err := artifact.Validate(); err != nil {
		return err
	}
	if artifact.TrajectorySequence != nil && *artifact.TrajectorySequence > lastTrajectorySequence {
		return fmt.Errorf("snapshot artifact %s references uncovered trajectory sequence %d", artifact.ID, *artifact.TrajectorySequence)
	}
	return nil
}

func validateSnapshotNarration(window ConversationNarrationWindow, conversationID string, lastTrajectorySequence int) error {
	if window.Events == nil {
		return fmt.Errorf("conversation snapshot narration events must be an array, not null")
	}
	if len(window.Events) > MaxSnapshotNarrationEvents {
		return fmt.Errorf("conversation snapshot narration window exceeds %d events", MaxSnapshotNarrationEvents)
	}
	if window.HasEarlier && len(window.Events) == 0 {
		return fmt.Errorf("conversation snapshot narration window cannot report earlier records while empty")
	}
	previousSequence := 0
	for _, event := range window.Events {
		if event.ConversationID != conversationID {
			return fmt.Errorf("snapshot narration event %s belongs to %q, want %q", event.ID, event.ConversationID, conversationID)
		}
		if err := event.Validate(); err != nil {
			return err
		}
		if event.SourceSequenceEnd > lastTrajectorySequence {
			return fmt.Errorf("snapshot narration event %s references uncovered trajectory sequence %d", event.ID, event.SourceSequenceEnd)
		}
		if event.StreamSequence <= previousSequence {
			return fmt.Errorf("conversation snapshot narration events are not strictly ordered")
		}
		previousSequence = event.StreamSequence
	}
	return nil
}

func validateSnapshotRoleOverrides(overrides []RoleProfileOverride, conversationID string) error {
	if overrides == nil {
		return fmt.Errorf("conversation snapshot role profile overrides must be an array, not null")
	}
	if len(overrides) > MaxSnapshotRoleOverrides {
		return fmt.Errorf("conversation snapshot role override window exceeds %d records", MaxSnapshotRoleOverrides)
	}
	previousRole := ""
	for _, override := range overrides {
		if override.ScopeKind != RoleProfileScopeConversation || override.ScopeID != conversationID {
			return fmt.Errorf("snapshot role override is not owned by conversation %q", conversationID)
		}
		if err := override.Validate(); err != nil {
			return err
		}
		role := string(override.Profile.Role)
		if previousRole != "" && role <= previousRole {
			return fmt.Errorf("conversation snapshot role overrides are not strictly ordered")
		}
		previousRole = role
	}
	return nil
}

func validateSnapshotBranch(branch *ConversationBranch, conversationID string) error {
	if branch == nil {
		return nil
	}
	if branch.ChildConversationID != conversationID {
		return fmt.Errorf("snapshot branch belongs to %q, want %q", branch.ChildConversationID, conversationID)
	}
	return branch.Validate()
}

func validateSnapshotSides(sides []SideConversation, conversationID string, lastTrajectorySequence int) error {
	if sides == nil {
		return fmt.Errorf("conversation snapshot side conversations must be an array, not null")
	}
	if len(sides) > MaxSnapshotSideConversations {
		return fmt.Errorf("conversation snapshot side conversation window exceeds %d records", MaxSnapshotSideConversations)
	}
	previousKey := ""
	for _, side := range sides {
		if side.ParentConversationID != conversationID {
			return fmt.Errorf("snapshot side conversation %s belongs to %q, want %q", side.ID, side.ParentConversationID, conversationID)
		}
		if err := side.Validate(); err != nil {
			return err
		}
		if side.SourceTrajectorySequence > lastTrajectorySequence {
			return fmt.Errorf("snapshot side conversation %s references uncovered trajectory sequence %d", side.ID, side.SourceTrajectorySequence)
		}
		key := side.CreatedAt + "\x00" + side.ID
		if previousKey != "" && key <= previousKey {
			return fmt.Errorf("conversation snapshot side conversations are not strictly ordered")
		}
		previousKey = key
	}
	return nil
}

func validateSnapshotOwnedRecord[T any](
	label string,
	conversationID string,
	value *T,
	identity func(T) (string, error),
) error {
	if value == nil {
		return nil
	}
	owner, err := identity(*value)
	if err != nil {
		return err
	}
	if owner != conversationID {
		return fmt.Errorf("snapshot %s belongs to %q, want %q", label, owner, conversationID)
	}
	return nil
}

func (event ConversationEvent) Validate() error {
	if event.SchemaVersion != ConversationContractSchemaVersion {
		return fmt.Errorf("conversation event schema version must be %d", ConversationContractSchemaVersion)
	}
	if err := validateIdentifier("conversation event workspace id", event.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("conversation event conversation id", event.ConversationID); err != nil {
		return err
	}
	if event.Sequence <= 0 {
		return fmt.Errorf("conversation event sequence must be positive: %d", event.Sequence)
	}
	wantEventID, err := ConversationEventID(event.StreamID, event.Sequence)
	if err != nil {
		return err
	}
	if event.EventID != wantEventID {
		return fmt.Errorf("conversation event id is %q, want %q", event.EventID, wantEventID)
	}
	if err := (ConversationEventCursor{StreamID: event.StreamID, Sequence: event.Sequence}).Validate(event.ConversationID); err != nil {
		return err
	}
	if _, err := validateTimestamp("conversation event emittedAt", event.EmittedAt); err != nil {
		return err
	}
	if isNilConversationEventPayload(event.Payload) {
		return fmt.Errorf("conversation event payload is required")
	}
	return event.Payload.validateConversationEventPayload(event.WorkspaceID, event.ConversationID)
}

func (event ConversationEvent) Type() ConversationEventType {
	if isNilConversationEventPayload(event.Payload) {
		return ""
	}
	return event.Payload.conversationEventType()
}

func isNilConversationEventPayload(payload ConversationEventPayload) bool {
	if payload == nil {
		return true
	}
	value := reflect.ValueOf(payload)
	return value.Kind() == reflect.Pointer && value.IsNil()
}

func (payload ConversationUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeConversationUpdated
}

func (payload ConversationUpdatedEventPayload) validateConversationEventPayload(workspaceID string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Conversation.Validate(); err != nil {
		return err
	}
	if payload.Conversation.ID != conversationID || payload.Conversation.WorkspaceID != workspaceID {
		return fmt.Errorf("conversation.updated payload ownership does not match event")
	}
	return nil
}

func (payload ConversationTurnUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeTurnUpdated
}

func (payload ConversationTurnUpdatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Turn.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.turn.updated", payload.Turn.ConversationID, conversationID)
}

func (payload ConversationQueueUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeQueueUpdated
}

func (payload ConversationQueueUpdatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if payload.Queue == nil || len(payload.Queue) > MaxSnapshotQueuedTurns {
		return fmt.Errorf("conversation.queue.updated payload must contain a bounded array")
	}
	for index, queued := range payload.Queue {
		if err := queued.Validate(); err != nil {
			return err
		}
		if queued.ConversationID != conversationID || queued.Ordinal != index+1 {
			return fmt.Errorf("conversation.queue.updated payload is not a contiguous owned queue")
		}
	}
	return nil
}

func (payload ConversationThreadBindingUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeThreadBindingUpdated
}

func (payload ConversationThreadBindingUpdatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Binding.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.thread_binding.updated", payload.Binding.ConversationID, conversationID)
}

func (payload ConversationTrajectoryAppendedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeTrajectoryAppended
}

func (payload ConversationTrajectoryAppendedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Event.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.trajectory.appended", payload.Event.ConversationID, conversationID)
}

func (payload ConversationArtifactCreatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeArtifactCreated
}

func (payload ConversationArtifactCreatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Artifact.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.artifact.created", payload.Artifact.ConversationID, conversationID)
}

func (payload ConversationNarratorStateUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeNarratorStateUpdated
}

func (payload ConversationNarratorStateUpdatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.State.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.narrator_state.updated", payload.State.ConversationID, conversationID)
}

func (payload ConversationNarrationCreatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeNarrationCreated
}

func (payload ConversationNarrationCreatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Event.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.narration.created", payload.Event.ConversationID, conversationID)
}

func (payload ConversationRoleProfileOverrideUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeRoleProfileOverrideUpdated
}

func (payload ConversationRoleProfileOverrideUpdatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Override.Validate(); err != nil {
		return err
	}
	if payload.Override.ScopeKind != RoleProfileScopeConversation || payload.Override.ScopeID != conversationID {
		return fmt.Errorf("conversation.role_profile_override.updated payload ownership does not match event")
	}
	return nil
}

func (payload ConversationPresentationProfileUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypePresentationProfileUpdated
}

func (payload ConversationPresentationProfileUpdatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Profile.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.presentation_profile.updated", payload.Profile.ConversationID, conversationID)
}

func (payload ConversationBranchCreatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeBranchCreated
}

func (payload ConversationBranchCreatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Branch.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.branch.created", payload.Branch.ChildConversationID, conversationID)
}

func (payload ConversationSideConversationUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeSideConversationUpdated
}

func (payload ConversationSideConversationUpdatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.SideConversation.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.side_conversation.updated", payload.SideConversation.ParentConversationID, conversationID)
}

func (payload ConversationSideConversationEventCreatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeSideConversationEventCreated
}

func (payload ConversationSideConversationEventCreatedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Event.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.side_conversation.event.created", payload.Event.ParentConversationID, conversationID)
}

func (payload ConversationResyncRequiredEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeResyncRequired
}

func (payload ConversationResyncRequiredEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := validateTrimmedText("conversation resync reason", payload.Reason); err != nil {
		return err
	}
	wantStreamID, err := ConversationStreamID(conversationID)
	if err != nil {
		return err
	}
	if payload.CurrentStreamID != wantStreamID || payload.RequestedSequence < 0 || payload.CurrentSequence < 0 {
		return fmt.Errorf("conversation.resync_required payload contains an invalid cursor")
	}
	return nil
}

func validateEventPayloadType(actual ConversationEventType, expected ConversationEventType) error {
	if actual != expected {
		return fmt.Errorf("conversation event payload type is %q, want %q", actual, expected)
	}
	return nil
}

func validateEventPayloadOwner(kind string, actual string, expected string) error {
	if actual != expected {
		return fmt.Errorf("%s payload ownership does not match event", kind)
	}
	return nil
}

type ContractValueSet struct {
	Name   string
	Values []string
}

type ContractUnion struct {
	Discriminator string
	Name          string
	Type          reflect.Type
	Variants      []ContractUnionVariant
}

type ContractUnionVariant struct {
	KindValue string
	Name      string
	Type      reflect.Type
}

type ContractTaggedUnion struct {
	Discriminator string
	Type          reflect.Type
	Branches      []ContractTaggedUnionBranch
}

type ContractTaggedUnionBranch struct {
	Field     string
	KindValue string
}

func ContractUnions() []ContractUnion {
	return []ContractUnion{{
		Discriminator: "type",
		Name:          "ConversationEventPayload",
		Type:          reflect.TypeFor[ConversationEventPayload](),
		Variants: []ContractUnionVariant{
			contractEventVariant(ConversationEventTypeConversationUpdated, ConversationUpdatedEventPayload{}),
			contractEventVariant(ConversationEventTypeTurnUpdated, ConversationTurnUpdatedEventPayload{}),
			contractEventVariant(ConversationEventTypeQueueUpdated, ConversationQueueUpdatedEventPayload{}),
			contractEventVariant(ConversationEventTypeThreadBindingUpdated, ConversationThreadBindingUpdatedEventPayload{}),
			contractEventVariant(ConversationEventTypeTrajectoryAppended, ConversationTrajectoryAppendedEventPayload{}),
			contractEventVariant(ConversationEventTypeArtifactCreated, ConversationArtifactCreatedEventPayload{}),
			contractEventVariant(ConversationEventTypeNarratorStateUpdated, ConversationNarratorStateUpdatedEventPayload{}),
			contractEventVariant(ConversationEventTypeNarrationCreated, ConversationNarrationCreatedEventPayload{}),
			contractEventVariant(ConversationEventTypeRoleProfileOverrideUpdated, ConversationRoleProfileOverrideUpdatedEventPayload{}),
			contractEventVariant(ConversationEventTypePresentationProfileUpdated, ConversationPresentationProfileUpdatedEventPayload{}),
			contractEventVariant(ConversationEventTypeBranchCreated, ConversationBranchCreatedEventPayload{}),
			contractEventVariant(ConversationEventTypeSideConversationUpdated, ConversationSideConversationUpdatedEventPayload{}),
			contractEventVariant(ConversationEventTypeSideConversationEventCreated, ConversationSideConversationEventCreatedEventPayload{}),
			contractEventVariant(ConversationEventTypeResyncRequired, ConversationResyncRequiredEventPayload{}),
		},
	}}
}

func contractEventVariant[T ConversationEventPayload](kind ConversationEventType, payload T) ContractUnionVariant {
	goType := reflect.TypeOf(payload)
	return ContractUnionVariant{KindValue: string(kind), Name: goType.Name(), Type: goType}
}

func ContractTaggedUnions() []ContractTaggedUnion {
	return []ContractTaggedUnion{
		{
			Discriminator: "kind",
			Type:          reflect.TypeFor[TrajectoryEvent](),
			Branches: []ContractTaggedUnionBranch{
				{Field: "userInputAccepted", KindValue: string(TrajectoryEventUserInputAccepted)},
				{Field: "turnQueued", KindValue: string(TrajectoryEventTurnQueued)},
				{Field: "turnPromoted", KindValue: string(TrajectoryEventTurnPromoted)},
				{Field: "turnStarted", KindValue: string(TrajectoryEventTurnStarted)},
				{Field: "turnSteered", KindValue: string(TrajectoryEventTurnSteered)},
				{Field: "turnInterrupted", KindValue: string(TrajectoryEventTurnInterrupted)},
				{Field: "turnCompleted", KindValue: string(TrajectoryEventTurnCompleted)},
				{Field: "turnFailed", KindValue: string(TrajectoryEventTurnFailed)},
				{Field: "agentPublicTextDelta", KindValue: string(TrajectoryEventAgentPublicTextDelta)},
				{Field: "agentMessageCompleted", KindValue: string(TrajectoryEventAgentMessageCompleted)},
				{Field: "publicReasoningSummaryUpdated", KindValue: string(TrajectoryEventPublicReasoningSummaryUpdated)},
				{Field: "planChanged", KindValue: string(TrajectoryEventPlanChanged)},
				{Field: "activityStarted", KindValue: string(TrajectoryEventActivityStarted)},
				{Field: "activityProgressed", KindValue: string(TrajectoryEventActivityProgressed)},
				{Field: "activityCompleted", KindValue: string(TrajectoryEventActivityCompleted)},
				{Field: "activityFailed", KindValue: string(TrajectoryEventActivityFailed)},
				{Field: "fileChangeProposed", KindValue: string(TrajectoryEventFileChangeProposed)},
				{Field: "fileChangeCompleted", KindValue: string(TrajectoryEventFileChangeCompleted)},
				{Field: "approvalRequested", KindValue: string(TrajectoryEventApprovalRequested)},
				{Field: "approvalResolved", KindValue: string(TrajectoryEventApprovalResolved)},
				{Field: "subagentStarted", KindValue: string(TrajectoryEventSubagentStarted)},
				{Field: "subagentUpdated", KindValue: string(TrajectoryEventSubagentUpdated)},
				{Field: "subagentCompleted", KindValue: string(TrajectoryEventSubagentCompleted)},
				{Field: "artifactEmitted", KindValue: string(TrajectoryEventArtifactEmitted)},
				{Field: "agentLivenessChanged", KindValue: string(TrajectoryEventAgentLivenessChanged)},
				{Field: "providerLifecycleChanged", KindValue: string(TrajectoryEventProviderLifecycleChanged)},
				{Field: "modelRerouted", KindValue: string(TrajectoryEventModelRerouted)},
			},
		},
		{
			Discriminator: "kind",
			Type:          reflect.TypeFor[NarrationEvent](),
			Branches: []ContractTaggedUnionBranch{
				{Field: "milestone", KindValue: string(NarrationEventKindMilestone)},
				{Field: "statusReply", KindValue: string(NarrationEventKindStatusReply)},
				{Field: "finalSummary", KindValue: string(NarrationEventKindFinalSummary)},
				{Field: "topicDescriptor", KindValue: string(NarrationEventKindTopicDescriptor)},
			},
		},
	}
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		contractValueSet("ConversationStatus", ConversationStatusIdle, ConversationStatusWorking, ConversationStatusWaitingForApproval, ConversationStatusFailed),
		contractValueSet("TurnDelivery", TurnDeliveryNormal, TurnDeliveryQueued, TurnDeliverySteering),
		contractValueSet("TurnStatus", TurnStatusQueued, TurnStatusRunning, TurnStatusCompleted, TurnStatusCancelled, TurnStatusFailed),
		contractValueSet("ThreadBindingStatus", ThreadBindingStatusLinked, ThreadBindingStatusMissing, ThreadBindingStatusUnavailable),
		contractValueSet("ArtifactKind", ArtifactKindMarkdown, ArtifactKindTable, ArtifactKindBarChart, ArtifactKindFile, ArtifactKindToolOutput),
		contractValueSet("Provider", ProviderCodex),
		contractValueSet("Role", RoleMaster, RoleAgent, RoleNarrator, RoleSideAgent),
		contractValueSet("RoleProfileScopeKind", RoleProfileScopeGlobal, RoleProfileScopeWorkspace, RoleProfileScopeConversation),
		contractValueSet("ModelSelectionMode", ModelSelectionExact, ModelSelectionProviderDefault),
		contractValueSet("ApprovalPolicy", ApprovalPolicyUnlessTrusted, ApprovalPolicyOnRequest, ApprovalPolicyNever),
		contractValueSet("ToolAccessMode", ToolAccessAll, ToolAccessAllowlist, ToolAccessNone),
		contractValueSet("InvocationOutcome", InvocationOutcomeRunning, InvocationOutcomeSucceeded, InvocationOutcomeFailed, InvocationOutcomeCancelled),
		contractValueSet("BranchKind", BranchKindFork),
		contractValueSet("SideConversationStatus", SideConversationStatusPreparing, SideConversationStatusActive, SideConversationStatusDisposing, SideConversationStatusFailed),
		contractValueSet("SideConversationEventKind", SideConversationEventAgentTextDelta, SideConversationEventAgentTextCompleted, SideConversationEventActivity, SideConversationEventTerminal),
		contractValueSet("NarratorStatus", NarratorStatusReady, NarratorStatusRunning, NarratorStatusDegraded),
		contractValueSet("NarrationEventKind", NarrationEventKindMilestone, NarrationEventKindStatusReply, NarrationEventKindFinalSummary, NarrationEventKindTopicDescriptor),
		contractValueSet("NarrationTrigger", NarrationTriggerProgressWindowElapsed, NarrationTriggerPlanChanged, NarrationTriggerPhaseActivityCompleted, NarrationTriggerApprovalRequired, NarrationTriggerUserSteered, NarrationTriggerExplicitStatusRequested, NarrationTriggerTurnTerminal, NarrationTriggerCheckpointWindowExceeded),
		contractValueSet("PresentationSelectionMode", PresentationSelectionAutoDistinct, PresentationSelectionExact),
		contractValueSet("PresentationReuseReason", PresentationReuseCatalogExhausted),
		{Name: "TrajectoryEventKind", Values: stringValues(trajectoryEventKinds)},
		contractValueSet("TrajectoryActor", TrajectoryActorUser, TrajectoryActorAgent, TrajectoryActorProvider, TrajectoryActorSystem, TrajectoryActorMaster),
		contractValueSet("PlanStepStatus", PlanStepStatusPending, PlanStepStatusInProgress, PlanStepStatusCompleted),
		contractValueSet("TrajectoryActivityKind", TrajectoryActivityCommand, TrajectoryActivityMCPTool, TrajectoryActivityDynamicTool, TrajectoryActivityWebSearch, TrajectoryActivityImageView, TrajectoryActivityImageGeneration, TrajectoryActivitySleep, TrajectoryActivityHook),
		contractValueSet("FileChangeKind", FileChangeAdd, FileChangeDelete, FileChangeUpdate),
		contractValueSet("FileChangeOutcome", FileChangeOutcomeCompleted, FileChangeOutcomeFailed, FileChangeOutcomeDeclined),
		contractValueSet("TrajectoryApprovalKind", TrajectoryApprovalKindCommand, TrajectoryApprovalKindFileChange, TrajectoryApprovalKindPermission, TrajectoryApprovalKindStructuredInput, TrajectoryApprovalKindUserInput),
		contractValueSet("TrajectoryApprovalDecision", TrajectoryApprovalDecisionApproved, TrajectoryApprovalDecisionApprovedForSession, TrajectoryApprovalDecisionDenied, TrajectoryApprovalDecisionCancelled, TrajectoryApprovalDecisionAnswered),
		contractValueSet("SubagentStatus", SubagentStatusPendingInit, SubagentStatusRunning, SubagentStatusInterrupted, SubagentStatusCompleted, SubagentStatusErrored, SubagentStatusShutdown, SubagentStatusNotFound),
		contractValueSet("AgentLivenessStatus", AgentLivenessAttached, AgentLivenessReconciling, AgentLivenessLost, AgentLivenessTerminal),
		contractValueSet("AgentLivenessReason", AgentLivenessReasonProviderRefPending, AgentLivenessReasonProviderTurnLinked, AgentLivenessReasonProviderInactive, AgentLivenessReasonAttachmentMissing, AgentLivenessReasonTurnTerminal, AgentLivenessReasonWakeRecheck, AgentLivenessReasonSnapshotLoad, AgentLivenessReasonStreamResync, AgentLivenessReasonUserRetry, AgentLivenessReasonProviderRestarted, AgentLivenessReasonProviderUnavailable, AgentLivenessReasonTurnNotFound),
		contractValueSet("ProviderLifecycleStatus", ProviderLifecycleStarting, ProviderLifecycleReady, ProviderLifecycleRestarting, ProviderLifecycleUnavailable, ProviderLifecycleClosed),
		contractValueSet("TurnInterruptionReason", TurnInterruptionUserRequested, TurnInterruptionProviderInterrupted, TurnInterruptionRuntimeShutdown, TurnInterruptionReconciliation),
		{Name: "ConversationEventType", Values: stringValues(conversationEventTypeValues)},
		{Name: "ConversationPaletteID", Values: stringValues(conversationpalette.IDs())},
		contractValueSet("ApprovalSubmissionDecision", ApprovalSubmissionAccept, ApprovalSubmissionDecline, ApprovalSubmissionCancel),
	}
}

func contractValueSet[T ~string](name string, values ...T) ContractValueSet {
	return ContractValueSet{Name: name, Values: stringValues(values)}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}
