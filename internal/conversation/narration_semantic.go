package conversation

import "fmt"

type NarratorSemanticEventKind string

const (
	NarratorSemanticEventTaskStarted             NarratorSemanticEventKind = "task_started"
	NarratorSemanticEventMeaningfulProgress      NarratorSemanticEventKind = "meaningful_progress"
	NarratorSemanticEventApprovalNeeded          NarratorSemanticEventKind = "approval_needed"
	NarratorSemanticEventArtifactOrResultEmitted NarratorSemanticEventKind = "artifact_or_result_emitted"
	NarratorSemanticEventTaskCompleted           NarratorSemanticEventKind = "task_completed"
	NarratorSemanticEventTaskFailed              NarratorSemanticEventKind = "task_failed"
	NarratorSemanticEventTaskCanceled            NarratorSemanticEventKind = "task_canceled"
)

var narratorSemanticEventKinds = []NarratorSemanticEventKind{
	NarratorSemanticEventTaskStarted,
	NarratorSemanticEventMeaningfulProgress,
	NarratorSemanticEventApprovalNeeded,
	NarratorSemanticEventArtifactOrResultEmitted,
	NarratorSemanticEventTaskCompleted,
	NarratorSemanticEventTaskFailed,
	NarratorSemanticEventTaskCanceled,
}

func NarratorSemanticEventKinds() []NarratorSemanticEventKind {
	result := make([]NarratorSemanticEventKind, len(narratorSemanticEventKinds))
	copy(result, narratorSemanticEventKinds)
	return result
}

type NarratorSemanticEvent struct {
	ConversationID          string                                   `json:"conversationId"`
	TurnID                  string                                   `json:"turnId"`
	SemanticSequence        int                                      `json:"semanticSequence"`
	Kind                    NarratorSemanticEventKind                `json:"kind"`
	SourceTrajectoryRange   TrajectorySequenceRange                  `json:"sourceTrajectoryRange"`
	CreatedAt               string                                   `json:"createdAt"`
	TaskStarted             *NarratorSemanticTaskStarted             `json:"taskStarted"`
	MeaningfulProgress      *NarratorSemanticProgress                `json:"meaningfulProgress"`
	ApprovalNeeded          *NarratorSemanticApprovalNeeded          `json:"approvalNeeded"`
	ArtifactOrResultEmitted *NarratorSemanticArtifactOrResultEmitted `json:"artifactOrResultEmitted"`
	TaskCompleted           *NarratorSemanticTaskCompleted           `json:"taskCompleted"`
	TaskFailed              *NarratorSemanticTaskFailed              `json:"taskFailed"`
	TaskCanceled            *NarratorSemanticTaskCanceled            `json:"taskCanceled"`
}

type NarratorSemanticTaskStarted struct {
	Objective   AuthoredInput `json:"objective"`
	Delivery    TurnDelivery  `json:"delivery"`
	RoleProfile RoleProfile   `json:"roleProfile"`
}

type NarratorSemanticProgress struct {
	Plan              *TrajectoryPlanChanged       `json:"plan"`
	ActivityCompleted *TrajectoryActivityCompleted `json:"activityCompleted"`
	ActivityFailed    *TrajectoryActivityFailed    `json:"activityFailed"`
}

type NarratorSemanticAssistantMessage struct {
	ProviderItemID string `json:"providerItemId"`
	Text           string `json:"text"`
}

type NarratorSemanticApprovalNeeded struct {
	Approval TrajectoryApprovalRequest `json:"approval"`
}

type NarratorSemanticArtifactOrResultEmitted struct {
	ArtifactID string            `json:"artifactId"`
	Artifact   *ArtifactMetadata `json:"artifact"`
}

type NarratorSemanticTaskCompleted struct {
	Objective AuthoredInput      `json:"objective"`
	Status    TurnStatus         `json:"status"`
	Artifacts []ArtifactMetadata `json:"artifacts"`
}

type NarratorSemanticTaskFailed struct {
	Objective AuthoredInput      `json:"objective"`
	Status    TurnStatus         `json:"status"`
	Failure   Failure            `json:"failure"`
	Artifacts []ArtifactMetadata `json:"artifacts"`
}

type NarratorSemanticTaskCanceled struct {
	Objective AuthoredInput          `json:"objective"`
	Status    TurnStatus             `json:"status"`
	Reason    TurnInterruptionReason `json:"reason"`
	Artifacts []ArtifactMetadata     `json:"artifacts"`
}

type narratorSemanticBuildContext struct {
	Conversation TopicConversation
	Turn         ConversationTurn
	Artifacts    []ArtifactMetadata
	ArtifactByID map[string]ArtifactMetadata
	Terminal     bool
}

type narratorSemanticBuilder func(narratorSemanticBuildContext, TrajectoryEvent) (NarratorSemanticEvent, bool)
type narratorSemanticPayloadValidator func(NarratorSemanticEvent) error

var narratorSemanticBuilders = map[TrajectoryEventKind]narratorSemanticBuilder{
	TrajectoryEventUserInputAccepted: semanticTaskStartedFromAcceptedInput,
	TrajectoryEventTurnStarted:       semanticTaskStartedFromQueuedStart,
	TrajectoryEventPlanChanged:       semanticPlanProgress,
	TrajectoryEventActivityCompleted: semanticActivityCompletedProgress,
	TrajectoryEventActivityFailed:    semanticActivityFailedProgress,
	TrajectoryEventApprovalRequested: semanticApprovalNeeded,
	TrajectoryEventArtifactEmitted:   semanticArtifactOrResultEmitted,
	TrajectoryEventTurnCompleted:     semanticTaskCompleted,
	TrajectoryEventTurnFailed:        semanticTaskFailed,
	TrajectoryEventTurnInterrupted:   semanticTaskCanceled,
}

var narratorSemanticPayloadValidators = map[NarratorSemanticEventKind]narratorSemanticPayloadValidator{
	NarratorSemanticEventTaskStarted:             validateSemanticTaskStarted,
	NarratorSemanticEventMeaningfulProgress:      validateSemanticMeaningfulProgress,
	NarratorSemanticEventApprovalNeeded:          validateSemanticApprovalNeeded,
	NarratorSemanticEventArtifactOrResultEmitted: validateSemanticArtifactOrResultEmitted,
	NarratorSemanticEventTaskCompleted:           validateSemanticTaskCompleted,
	NarratorSemanticEventTaskFailed:              validateSemanticTaskFailed,
	NarratorSemanticEventTaskCanceled:            validateSemanticTaskCanceled,
}

func narratorSemanticEventsForLiveCommit(
	conversation TopicConversation,
	turn ConversationTurn,
	events []TrajectoryEvent,
	artifacts []ArtifactMetadata,
	terminal bool,
) []NarratorSemanticEvent {
	if len(events) == 0 {
		return nil
	}
	buildContext := narratorSemanticBuildContext{
		Conversation: conversation,
		Turn:         turn,
		Artifacts:    artifacts,
		ArtifactByID: narratorArtifactMetadataByID(artifacts),
		Terminal:     terminal,
	}
	result := make([]NarratorSemanticEvent, 0, len(events))
	for _, event := range events {
		builder, ok := narratorSemanticBuilders[event.Kind]
		if !ok {
			continue
		}
		semantic, ok := builder(buildContext, event)
		if ok {
			result = append(result, semantic)
		}
	}
	return result
}

func semanticTaskStartedFromAcceptedInput(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if event.UserInputAccepted == nil ||
		event.UserInputAccepted.Delivery == TurnDeliveryQueued {
		return NarratorSemanticEvent{}, false
	}
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventTaskStarted,
		NarratorSemanticEvent{
			TaskStarted: &NarratorSemanticTaskStarted{
				Objective:   event.UserInputAccepted.Input,
				Delivery:    event.UserInputAccepted.Delivery,
				RoleProfile: context.Turn.RequestedRoleProfile,
			},
		},
	), true
}

func semanticTaskStartedFromQueuedStart(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if event.TurnStarted == nil || context.Turn.Delivery != TurnDeliveryQueued {
		return NarratorSemanticEvent{}, false
	}
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventTaskStarted,
		NarratorSemanticEvent{
			TaskStarted: &NarratorSemanticTaskStarted{
				Objective:   context.Turn.AuthoredInput,
				Delivery:    context.Turn.Delivery,
				RoleProfile: context.Turn.RequestedRoleProfile,
			},
		},
	), true
}

func semanticPlanProgress(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if event.PlanChanged == nil {
		return NarratorSemanticEvent{}, false
	}
	plan := *event.PlanChanged
	plan.Steps = append([]PlanStep{}, event.PlanChanged.Steps...)
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventMeaningfulProgress,
		NarratorSemanticEvent{MeaningfulProgress: &NarratorSemanticProgress{Plan: &plan}},
	), true
}

func semanticActivityCompletedProgress(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if event.ActivityCompleted == nil {
		return NarratorSemanticEvent{}, false
	}
	activity := *event.ActivityCompleted
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventMeaningfulProgress,
		NarratorSemanticEvent{
			MeaningfulProgress: &NarratorSemanticProgress{ActivityCompleted: &activity},
		},
	), true
}

func semanticActivityFailedProgress(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if event.ActivityFailed == nil {
		return NarratorSemanticEvent{}, false
	}
	activity := *event.ActivityFailed
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventMeaningfulProgress,
		NarratorSemanticEvent{
			MeaningfulProgress: &NarratorSemanticProgress{ActivityFailed: &activity},
		},
	), true
}

func semanticApprovalNeeded(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if event.ApprovalRequested == nil {
		return NarratorSemanticEvent{}, false
	}
	approval := event.ApprovalRequested.Approval
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventApprovalNeeded,
		NarratorSemanticEvent{
			ApprovalNeeded: &NarratorSemanticApprovalNeeded{Approval: approval},
		},
	), true
}

func semanticArtifactOrResultEmitted(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if event.ArtifactEmitted == nil {
		return NarratorSemanticEvent{}, false
	}
	payload := NarratorSemanticArtifactOrResultEmitted{
		ArtifactID: event.ArtifactEmitted.ArtifactID,
	}
	if artifact, ok := context.ArtifactByID[event.ArtifactEmitted.ArtifactID]; ok {
		copy := artifact
		payload.Artifact = &copy
	}
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventArtifactOrResultEmitted,
		NarratorSemanticEvent{ArtifactOrResultEmitted: &payload},
	), true
}

func semanticTaskCompleted(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if !context.Terminal || event.TurnCompleted == nil {
		return NarratorSemanticEvent{}, false
	}
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventTaskCompleted,
		NarratorSemanticEvent{
			TaskCompleted: &NarratorSemanticTaskCompleted{
				Objective: context.Turn.AuthoredInput,
				Status:    context.Turn.Status,
				Artifacts: cloneArtifactMetadataSlice(context.Artifacts),
			},
		},
	), true
}

func semanticTaskFailed(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if !context.Terminal || event.TurnFailed == nil {
		return NarratorSemanticEvent{}, false
	}
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventTaskFailed,
		NarratorSemanticEvent{
			TaskFailed: &NarratorSemanticTaskFailed{
				Objective: context.Turn.AuthoredInput,
				Status:    context.Turn.Status,
				Failure:   event.TurnFailed.Failure,
				Artifacts: cloneArtifactMetadataSlice(context.Artifacts),
			},
		},
	), true
}

func semanticTaskCanceled(
	context narratorSemanticBuildContext,
	event TrajectoryEvent,
) (NarratorSemanticEvent, bool) {
	if !context.Terminal || event.TurnInterrupted == nil {
		return NarratorSemanticEvent{}, false
	}
	return narratorSemanticEvent(
		context.Conversation,
		context.Turn.ID,
		event,
		NarratorSemanticEventTaskCanceled,
		NarratorSemanticEvent{
			TaskCanceled: &NarratorSemanticTaskCanceled{
				Objective: context.Turn.AuthoredInput,
				Status:    context.Turn.Status,
				Reason:    event.TurnInterrupted.Reason,
				Artifacts: cloneArtifactMetadataSlice(context.Artifacts),
			},
		},
	), true
}

func narratorSemanticEvent(
	conversation TopicConversation,
	turnID string,
	source TrajectoryEvent,
	kind NarratorSemanticEventKind,
	payload NarratorSemanticEvent,
) NarratorSemanticEvent {
	payload.ConversationID = conversation.ID
	payload.TurnID = turnID
	payload.SemanticSequence = source.Sequence
	payload.Kind = kind
	payload.SourceTrajectoryRange = TrajectorySequenceRange{
		Start: source.Sequence,
		End:   source.Sequence,
	}
	payload.CreatedAt = source.EmittedAt
	return payload
}

func narratorArtifactMetadataByID(artifacts []ArtifactMetadata) map[string]ArtifactMetadata {
	result := make(map[string]ArtifactMetadata, len(artifacts))
	for _, artifact := range artifacts {
		result[artifact.ID] = artifact
	}
	return result
}

func cloneArtifactMetadataSlice(artifacts []ArtifactMetadata) []ArtifactMetadata {
	result := make([]ArtifactMetadata, len(artifacts))
	copy(result, artifacts)
	return result
}

func artifactMetadataForTurn(artifacts []ArtifactMetadata, turnID string) []ArtifactMetadata {
	result := make([]ArtifactMetadata, 0, len(artifacts))
	for _, artifact := range artifacts {
		if artifact.TurnID == nil || *artifact.TurnID != turnID {
			continue
		}
		result = append(result, artifact)
	}
	return result
}

func (event NarratorSemanticEvent) Validate() error {
	if err := validateIdentifier("narrator semantic event conversation id", event.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator semantic event turn id", event.TurnID); err != nil {
		return err
	}
	if event.SemanticSequence <= 0 {
		return fmt.Errorf("narrator semantic event sequence must be positive: %d", event.SemanticSequence)
	}
	if err := event.SourceTrajectoryRange.Validate(); err != nil {
		return fmt.Errorf("narrator semantic event source range: %w", err)
	}
	if event.SourceTrajectoryRange.End > event.SemanticSequence {
		return fmt.Errorf("narrator semantic event source range exceeds semantic sequence")
	}
	if _, err := validateTimestamp("narrator semantic event createdAt", event.CreatedAt); err != nil {
		return err
	}
	if !validNarratorSemanticEventKind(event.Kind) {
		return fmt.Errorf("narrator semantic event has unsupported kind %q", event.Kind)
	}
	if countNarratorSemanticPayloads(event) != 1 {
		return fmt.Errorf("narrator semantic event %s must populate exactly one payload branch, found %d", event.Kind, countNarratorSemanticPayloads(event))
	}
	return event.validatePayload()
}

func validNarratorSemanticEventKind(kind NarratorSemanticEventKind) bool {
	_, ok := narratorSemanticPayloadValidators[kind]
	return ok
}

func countNarratorSemanticPayloads(event NarratorSemanticEvent) int {
	count := 0
	for _, populated := range []bool{
		event.TaskStarted != nil,
		event.MeaningfulProgress != nil,
		event.ApprovalNeeded != nil,
		event.ArtifactOrResultEmitted != nil,
		event.TaskCompleted != nil,
		event.TaskFailed != nil,
		event.TaskCanceled != nil,
	} {
		if populated {
			count++
		}
	}
	return count
}

func (event NarratorSemanticEvent) validatePayload() error {
	validator, ok := narratorSemanticPayloadValidators[event.Kind]
	if !ok {
		return fmt.Errorf("narrator semantic event has unsupported kind %q", event.Kind)
	}
	return validator(event)
}

func validateSemanticTaskStarted(event NarratorSemanticEvent) error {
	if event.TaskStarted == nil {
		return fmt.Errorf("task_started semantic event requires taskStarted payload")
	}
	return event.TaskStarted.Validate()
}

func validateSemanticMeaningfulProgress(event NarratorSemanticEvent) error {
	if event.MeaningfulProgress == nil {
		return fmt.Errorf("meaningful_progress semantic event requires meaningfulProgress payload")
	}
	return event.MeaningfulProgress.Validate()
}

func validateSemanticApprovalNeeded(event NarratorSemanticEvent) error {
	if event.ApprovalNeeded == nil {
		return fmt.Errorf("approval_needed semantic event requires approvalNeeded payload")
	}
	return event.ApprovalNeeded.Approval.Validate()
}

func validateSemanticArtifactOrResultEmitted(event NarratorSemanticEvent) error {
	if event.ArtifactOrResultEmitted == nil {
		return fmt.Errorf("artifact_or_result_emitted semantic event requires artifactOrResultEmitted payload")
	}
	return event.ArtifactOrResultEmitted.Validate()
}

func validateSemanticTaskCompleted(event NarratorSemanticEvent) error {
	if event.TaskCompleted == nil {
		return fmt.Errorf("task_completed semantic event requires taskCompleted payload")
	}
	return event.TaskCompleted.Validate()
}

func validateSemanticTaskFailed(event NarratorSemanticEvent) error {
	if event.TaskFailed == nil {
		return fmt.Errorf("task_failed semantic event requires taskFailed payload")
	}
	return event.TaskFailed.Validate()
}

func validateSemanticTaskCanceled(event NarratorSemanticEvent) error {
	if event.TaskCanceled == nil {
		return fmt.Errorf("task_canceled semantic event requires taskCanceled payload")
	}
	return event.TaskCanceled.Validate()
}

func (event NarratorSemanticTaskStarted) Validate() error {
	if err := event.Objective.Validate(); err != nil {
		return err
	}
	if !validTurnDelivery(event.Delivery) {
		return fmt.Errorf("task_started semantic event has unsupported delivery %q", event.Delivery)
	}
	return event.RoleProfile.Validate()
}

func (event NarratorSemanticProgress) Validate() error {
	count := 0
	for _, populated := range []bool{
		event.Plan != nil,
		event.ActivityCompleted != nil,
		event.ActivityFailed != nil,
	} {
		if populated {
			count++
		}
	}
	if count != 1 {
		return fmt.Errorf("meaningful_progress semantic event must populate exactly one progress branch, found %d", count)
	}
	switch {
	case event.Plan != nil:
		return event.Plan.Validate()
	case event.ActivityCompleted != nil:
		return validateActivityCompleted(event.ActivityCompleted)
	case event.ActivityFailed != nil:
		return validateActivityFailed(event.ActivityFailed)
	default:
		return nil
	}
}

func (event NarratorSemanticAssistantMessage) Validate() error {
	if err := validateIdentifier("assistant message provider item id", event.ProviderItemID); err != nil {
		return err
	}
	return validateTrimmedText("assistant message text", event.Text)
}

func (event NarratorSemanticArtifactOrResultEmitted) Validate() error {
	if err := validateIdentifier("semantic artifact id", event.ArtifactID); err != nil {
		return err
	}
	if event.Artifact != nil {
		if event.Artifact.ID != event.ArtifactID {
			return fmt.Errorf("semantic artifact metadata id %s does not match %s", event.Artifact.ID, event.ArtifactID)
		}
		return event.Artifact.Validate()
	}
	return nil
}

func (event NarratorSemanticTaskCompleted) Validate() error {
	if err := event.Objective.Validate(); err != nil {
		return err
	}
	if event.Status != TurnStatusCompleted {
		return fmt.Errorf("task_completed semantic event has status %q", event.Status)
	}
	return validateNarratorSemanticArtifacts(event.Artifacts)
}

func (event NarratorSemanticTaskFailed) Validate() error {
	if err := event.Objective.Validate(); err != nil {
		return err
	}
	if event.Status != TurnStatusFailed {
		return fmt.Errorf("task_failed semantic event has status %q", event.Status)
	}
	if err := event.Failure.Validate(); err != nil {
		return err
	}
	return validateNarratorSemanticArtifacts(event.Artifacts)
}

func (event NarratorSemanticTaskCanceled) Validate() error {
	if err := event.Objective.Validate(); err != nil {
		return err
	}
	if event.Status != TurnStatusCancelled {
		return fmt.Errorf("task_canceled semantic event has status %q", event.Status)
	}
	if event.Reason == "" {
		return fmt.Errorf("task_canceled semantic event requires reason")
	}
	return validateNarratorSemanticArtifacts(event.Artifacts)
}

func validateNarratorSemanticArtifacts(artifacts []ArtifactMetadata) error {
	if artifacts == nil {
		return fmt.Errorf("narrator semantic terminal artifacts must be an array, not null")
	}
	for _, artifact := range artifacts {
		if err := artifact.Validate(); err != nil {
			return err
		}
	}
	return nil
}
