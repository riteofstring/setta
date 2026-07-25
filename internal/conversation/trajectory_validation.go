package conversation

import (
	"fmt"
	"reflect"
	"strings"
)

func (event TrajectoryEvent) Validate() error {
	if err := validateTrajectoryEventEnvelope(event); err != nil {
		return err
	}
	payload, err := event.trajectoryPayload()
	if err != nil {
		return err
	}
	if err := validateTrajectoryPayload(payload); err != nil {
		return fmt.Errorf("trajectory event %s kind %s: %w", event.ID, event.Kind, err)
	}
	return nil
}

func validateTrajectoryEventEnvelope(event TrajectoryEvent) error {
	if err := validateIdentifier("trajectory event id", event.ID); err != nil {
		return err
	}
	if err := validateIdentifier("trajectory event conversation id", event.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("trajectory event turn id", event.TurnID); err != nil {
		return err
	}
	if event.Sequence <= 0 {
		return fmt.Errorf("trajectory event %s sequence must be positive", event.ID)
	}
	if _, err := validateTimestamp("trajectory event emittedAt", event.EmittedAt); err != nil {
		return err
	}
	if !validTrajectoryActor(event.Actor) {
		return fmt.Errorf("trajectory event %s has unsupported actor %q", event.ID, event.Actor)
	}
	for _, field := range []struct {
		label string
		value *string
	}{
		{label: "trajectory provider event id", value: event.ProviderEventID},
		{label: "trajectory provider thread id", value: event.ProviderThreadID},
		{label: "trajectory provider turn id", value: event.ProviderTurnID},
	} {
		if err := validateOptionalIdentifier(field.label, field.value); err != nil {
			return err
		}
	}
	if trajectoryKindRequiresTurn(event.Kind) && event.TurnID == nil {
		return fmt.Errorf("trajectory event %s kind %s requires turn id", event.ID, event.Kind)
	}
	return nil
}

func (event TrajectoryEvent) trajectoryPayload() (any, error) {
	branches := []struct {
		kind    TrajectoryEventKind
		payload any
	}{
		{kind: TrajectoryEventUserInputAccepted, payload: event.UserInputAccepted},
		{kind: TrajectoryEventTurnQueued, payload: event.TurnQueued},
		{kind: TrajectoryEventTurnPromoted, payload: event.TurnPromoted},
		{kind: TrajectoryEventTurnStarted, payload: event.TurnStarted},
		{kind: TrajectoryEventTurnSteered, payload: event.TurnSteered},
		{kind: TrajectoryEventTurnInterrupted, payload: event.TurnInterrupted},
		{kind: TrajectoryEventTurnCompleted, payload: event.TurnCompleted},
		{kind: TrajectoryEventTurnFailed, payload: event.TurnFailed},
		{kind: TrajectoryEventAgentPublicTextDelta, payload: event.AgentPublicTextDelta},
		{kind: TrajectoryEventAgentMessageCompleted, payload: event.AgentMessageCompleted},
		{kind: TrajectoryEventPublicReasoningSummaryUpdated, payload: event.PublicReasoningSummaryUpdated},
		{kind: TrajectoryEventPlanChanged, payload: event.PlanChanged},
		{kind: TrajectoryEventActivityStarted, payload: event.ActivityStarted},
		{kind: TrajectoryEventActivityProgressed, payload: event.ActivityProgressed},
		{kind: TrajectoryEventActivityCompleted, payload: event.ActivityCompleted},
		{kind: TrajectoryEventActivityFailed, payload: event.ActivityFailed},
		{kind: TrajectoryEventFileChangeProposed, payload: event.FileChangeProposed},
		{kind: TrajectoryEventFileChangeCompleted, payload: event.FileChangeCompleted},
		{kind: TrajectoryEventApprovalRequested, payload: event.ApprovalRequested},
		{kind: TrajectoryEventApprovalResolved, payload: event.ApprovalResolved},
		{kind: TrajectoryEventSubagentStarted, payload: event.SubagentStarted},
		{kind: TrajectoryEventSubagentUpdated, payload: event.SubagentUpdated},
		{kind: TrajectoryEventSubagentCompleted, payload: event.SubagentCompleted},
		{kind: TrajectoryEventArtifactEmitted, payload: event.ArtifactEmitted},
		{kind: TrajectoryEventAgentLivenessChanged, payload: event.AgentLivenessChanged},
		{kind: TrajectoryEventProviderLifecycleChanged, payload: event.ProviderLifecycleChanged},
		{kind: TrajectoryEventModelRerouted, payload: event.ModelRerouted},
	}
	populated := 0
	var selected any
	var selectedKind TrajectoryEventKind
	for _, branch := range branches {
		if !nonNilPayload(branch.payload) {
			continue
		}
		populated++
		selected = branch.payload
		selectedKind = branch.kind
	}
	if populated != 1 {
		return nil, fmt.Errorf("trajectory event %s must populate exactly one payload branch, found %d", event.ID, populated)
	}
	if event.Kind != selectedKind {
		return nil, fmt.Errorf("trajectory event %s kind %s does not match populated %s branch", event.ID, event.Kind, selectedKind)
	}
	return selected, nil
}

func nonNilPayload(payload any) bool {
	value := reflect.ValueOf(payload)
	return value.IsValid() && value.Kind() == reflect.Pointer && !value.IsNil()
}

func validateTrajectoryPayload(payload any) error {
	validators := []func(any) (error, bool){
		validateTurnTrajectoryPayload,
		validateAgentTrajectoryPayload,
		validateActivityTrajectoryPayload,
		validateFileAndApprovalTrajectoryPayload,
		validateSubagentTrajectoryPayload,
		validateSystemTrajectoryPayload,
	}
	for _, validate := range validators {
		if err, matched := validate(payload); matched {
			return err
		}
	}
	return fmt.Errorf("unsupported trajectory payload type %T", payload)
}

func validateTurnTrajectoryPayload(payload any) (error, bool) {
	switch value := payload.(type) {
	case *TrajectoryUserInputAccepted:
		return validateAcceptedInput(value), true
	case *TrajectoryTurnQueued:
		return validatePositiveOrdinal("queue ordinal", value.QueueOrdinal), true
	case *TrajectoryTurnPromoted:
		return validatePositiveOrdinal("former queue ordinal", value.FormerQueueOrdinal), true
	case *TrajectoryTurnStarted:
		return validateTrajectoryTurnStarted(value), true
	case *TrajectoryTurnSteered:
		return value.Input.Validate(), true
	case *TrajectoryTurnInterrupted:
		return validateTrajectoryTurnInterrupted(value), true
	case *TrajectoryTurnCompleted:
		return nil, true
	case *TrajectoryTurnFailed:
		return value.Failure.Validate(), true
	default:
		return nil, false
	}
}

func validateAgentTrajectoryPayload(payload any) (error, bool) {
	switch value := payload.(type) {
	case *TrajectoryAgentPublicTextDelta:
		return validateAgentTextDelta(value), true
	case *TrajectoryAgentMessageCompleted:
		return validateAgentMessageCompleted(value), true
	case *TrajectoryPublicReasoningSummaryUpdated:
		return validateReasoningSummary(value), true
	case *TrajectoryPlanChanged:
		return value.Validate(), true
	default:
		return nil, false
	}
}

func validateActivityTrajectoryPayload(payload any) (error, bool) {
	switch value := payload.(type) {
	case *TrajectoryActivityStarted:
		return value.Activity.Validate(), true
	case *TrajectoryActivityProgressed:
		return validateActivityProgressed(value), true
	case *TrajectoryActivityCompleted:
		return validateActivityCompleted(value), true
	case *TrajectoryActivityFailed:
		return validateActivityFailed(value), true
	default:
		return nil, false
	}
}

func validateFileAndApprovalTrajectoryPayload(payload any) (error, bool) {
	switch value := payload.(type) {
	case *TrajectoryFileChangeProposed:
		return validateProposedFileChange(value), true
	case *TrajectoryFileChangeCompleted:
		return validateCompletedFileChange(value), true
	case *TrajectoryApprovalRequested:
		return value.Approval.Validate(), true
	case *TrajectoryApprovalResolved:
		return value.Resolution.Validate(), true
	default:
		return nil, false
	}
}

func validateSubagentTrajectoryPayload(payload any) (error, bool) {
	switch value := payload.(type) {
	case *TrajectorySubagentStarted:
		return validateStartedSubagent(value), true
	case *TrajectorySubagentUpdated:
		return value.Subagent.Validate(), true
	case *TrajectorySubagentCompleted:
		return validateCompletedSubagent(value), true
	default:
		return nil, false
	}
}

func validateSystemTrajectoryPayload(payload any) (error, bool) {
	switch value := payload.(type) {
	case *TrajectoryArtifactEmitted:
		return validateIdentifier("emitted artifact id", value.ArtifactID), true
	case *TrajectoryAgentLivenessChanged:
		return value.Liveness.Validate(), true
	case *TrajectoryProviderLifecycleChanged:
		return value.Lifecycle.Validate(), true
	case *TrajectoryModelRerouted:
		return value.Reroute.Validate(), true
	default:
		return nil, false
	}
}

func validateAcceptedInput(payload *TrajectoryUserInputAccepted) error {
	if err := payload.Input.Validate(); err != nil {
		return err
	}
	if !validTurnDelivery(payload.Delivery) {
		return fmt.Errorf("unsupported accepted input delivery %q", payload.Delivery)
	}
	return nil
}

func validatePositiveOrdinal(label string, ordinal int) error {
	if ordinal <= 0 {
		return fmt.Errorf("%s must be positive", label)
	}
	return nil
}

func validateTrajectoryTurnStarted(payload *TrajectoryTurnStarted) error {
	if err := payload.Invocation.Validate(); err != nil {
		return err
	}
	if (payload.Invocation.Role != RoleAgent && payload.Invocation.Role != RoleSideAgent) ||
		payload.Invocation.Outcome != InvocationOutcomeRunning {
		return fmt.Errorf("turn start requires a running agent or side-agent invocation")
	}
	return nil
}

func validateTrajectoryTurnInterrupted(payload *TrajectoryTurnInterrupted) error {
	if !validTurnInterruptionReason(payload.Reason) {
		return fmt.Errorf("unsupported interruption reason %q", payload.Reason)
	}
	return nil
}

func validateAgentTextDelta(payload *TrajectoryAgentPublicTextDelta) error {
	if err := validateIdentifier("agent text provider item id", payload.ProviderItemID); err != nil {
		return err
	}
	if payload.Delta == "" {
		return fmt.Errorf("agent public text delta is required")
	}
	return nil
}

func validateAgentMessageCompleted(payload *TrajectoryAgentMessageCompleted) error {
	if err := validateIdentifier("agent message provider item id", payload.ProviderItemID); err != nil {
		return err
	}
	return validateTrimmedText("completed agent message", payload.Text)
}

func validateReasoningSummary(payload *TrajectoryPublicReasoningSummaryUpdated) error {
	if err := validateIdentifier("reasoning provider item id", payload.ProviderItemID); err != nil {
		return err
	}
	if len(payload.Summary) == 0 {
		return fmt.Errorf("public reasoning summary must not be empty")
	}
	for _, part := range payload.Summary {
		if err := validateTrimmedText("public reasoning summary part", part); err != nil {
			return err
		}
	}
	return nil
}

func validateActivityProgressed(payload *TrajectoryActivityProgressed) error {
	if err := validateIdentifier("activity progress id", payload.ActivityID); err != nil {
		return err
	}
	if strings.TrimSpace(payload.Progress) == "" && payload.Output == nil {
		return fmt.Errorf("activity progress requires progress text or output reference")
	}
	if payload.Output != nil {
		return payload.Output.Validate()
	}
	return nil
}

func validateActivityCompleted(payload *TrajectoryActivityCompleted) error {
	if err := payload.Activity.Validate(); err != nil {
		return err
	}
	if strings.TrimSpace(payload.Summary) == "" && payload.Output == nil {
		return fmt.Errorf("completed activity requires summary or output reference")
	}
	if payload.Output != nil {
		if err := payload.Output.Validate(); err != nil {
			return err
		}
	}
	if payload.DurationMs != nil && *payload.DurationMs < 0 {
		return fmt.Errorf("activity duration must be non-negative")
	}
	if payload.ExitCode != nil && payload.Activity.Kind != TrajectoryActivityCommand {
		return fmt.Errorf("only command activity may include exit code")
	}
	return nil
}

func validateActivityFailed(payload *TrajectoryActivityFailed) error {
	if err := payload.Activity.Validate(); err != nil {
		return err
	}
	if err := payload.Failure.Validate(); err != nil {
		return err
	}
	if payload.Output != nil {
		return payload.Output.Validate()
	}
	return nil
}

func validateProposedFileChange(payload *TrajectoryFileChangeProposed) error {
	if err := validateIdentifier("file change provider item id", payload.ProviderItemID); err != nil {
		return err
	}
	return validateFileChanges(payload.Changes)
}

func validateCompletedFileChange(payload *TrajectoryFileChangeCompleted) error {
	if err := validateIdentifier("file change provider item id", payload.ProviderItemID); err != nil {
		return err
	}
	if err := validateFileChanges(payload.Changes); err != nil {
		return err
	}
	return validateFileChangeOutcome(payload)
}

func validateFileChangeOutcome(payload *TrajectoryFileChangeCompleted) error {
	switch payload.Outcome {
	case FileChangeOutcomeCompleted, FileChangeOutcomeDeclined:
		if payload.Failure != nil {
			return fmt.Errorf("file change outcome %s must not include failure", payload.Outcome)
		}
	case FileChangeOutcomeFailed:
		if payload.Failure == nil {
			return fmt.Errorf("failed file change requires failure")
		}
		return payload.Failure.Validate()
	default:
		return fmt.Errorf("unsupported file change outcome %q", payload.Outcome)
	}
	return nil
}

func validateStartedSubagent(payload *TrajectorySubagentStarted) error {
	if err := payload.Subagent.Validate(); err != nil {
		return err
	}
	if payload.Subagent.Status != SubagentStatusPendingInit && payload.Subagent.Status != SubagentStatusRunning {
		return fmt.Errorf("started subagent has terminal status %s", payload.Subagent.Status)
	}
	return nil
}

func validateCompletedSubagent(payload *TrajectorySubagentCompleted) error {
	if err := payload.Subagent.Validate(); err != nil {
		return err
	}
	if !subagentStatusTerminal(payload.Subagent.Status) {
		return fmt.Errorf("completed subagent has nonterminal status %s", payload.Subagent.Status)
	}
	return nil
}

func (step PlanStep) Validate() error {
	if err := validateTrimmedText("plan step text", step.Text); err != nil {
		return err
	}
	switch step.Status {
	case PlanStepStatusPending, PlanStepStatusInProgress, PlanStepStatusCompleted:
		return nil
	default:
		return fmt.Errorf("unsupported plan step status %q", step.Status)
	}
}

func (plan TrajectoryPlanChanged) Validate() error {
	if plan.Explanation != nil {
		if err := validateTrimmedText("plan explanation", *plan.Explanation); err != nil {
			return err
		}
	}
	if plan.Steps == nil {
		return fmt.Errorf("plan steps must be an array, not null")
	}
	for index, step := range plan.Steps {
		if err := step.Validate(); err != nil {
			return fmt.Errorf("plan step %d: %w", index, err)
		}
	}
	return nil
}

func (reference TrajectoryContentReference) Validate() error {
	if err := validateTrimmedText("trajectory content uri", reference.URI); err != nil {
		return err
	}
	if reference.MediaType != "" && strings.TrimSpace(reference.MediaType) != reference.MediaType {
		return fmt.Errorf("trajectory content media type must not have surrounding whitespace")
	}
	if reference.ByteSize < 0 {
		return fmt.Errorf("trajectory content byte size must be non-negative")
	}
	if reference.Truncated {
		return validateTrimmedText("truncated trajectory content summary", reference.Summary)
	}
	return nil
}

func (activity TrajectoryActivity) Validate() error {
	if err := validateIdentifier("trajectory activity id", activity.ID); err != nil {
		return err
	}
	if err := validateTrimmedText("trajectory activity title", activity.Title); err != nil {
		return err
	}
	if err := validateActivityOptionalFields(activity); err != nil {
		return err
	}
	return validateActivityKindFields(activity)
}

func validateActivityOptionalFields(activity TrajectoryActivity) error {
	for _, field := range []struct {
		label string
		value *string
	}{
		{label: "activity command", value: activity.Command},
		{label: "activity cwd", value: activity.CWD},
		{label: "activity server", value: activity.Server},
		{label: "activity tool", value: activity.Tool},
		{label: "activity namespace", value: activity.Namespace},
		{label: "activity process id", value: activity.ProcessID},
	} {
		if field.value != nil {
			if err := validateTrimmedText(field.label, *field.value); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateActivityKindFields(activity TrajectoryActivity) error {
	switch activity.Kind {
	case TrajectoryActivityCommand:
		if activity.Command == nil || activity.CWD == nil {
			return fmt.Errorf("command activity requires command and cwd")
		}
	case TrajectoryActivityMCPTool:
		if activity.Server == nil || activity.Tool == nil {
			return fmt.Errorf("MCP activity requires server and tool")
		}
	case TrajectoryActivityDynamicTool:
		if activity.Tool == nil {
			return fmt.Errorf("dynamic tool activity requires tool")
		}
	case TrajectoryActivityWebSearch,
		TrajectoryActivityImageView,
		TrajectoryActivityImageGeneration,
		TrajectoryActivitySleep,
		TrajectoryActivityHook,
		TrajectoryActivityFileChange,
		TrajectoryActivitySubagent,
		TrajectoryActivityOther:
	default:
		return fmt.Errorf("unsupported trajectory activity kind %q", activity.Kind)
	}
	return nil
}

func (change FileChange) Validate() error {
	if err := validateTrimmedText("file change path", change.Path); err != nil {
		return err
	}
	switch change.Kind {
	case FileChangeAdd, FileChangeDelete:
		if change.MovePath != nil {
			return fmt.Errorf("file change kind %s must not include move path", change.Kind)
		}
	case FileChangeUpdate:
		if change.MovePath != nil {
			if err := validateTrimmedText("file change move path", *change.MovePath); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unsupported file change kind %q", change.Kind)
	}
	return nil
}

func validateFileChanges(changes []FileChange) error {
	if len(changes) == 0 {
		return fmt.Errorf("file changes must not be empty")
	}
	for index, change := range changes {
		if err := change.Validate(); err != nil {
			return fmt.Errorf("file change %d: %w", index, err)
		}
	}
	return nil
}

func (question TrajectoryApprovalQuestion) Validate() error {
	if err := validateIdentifier("approval question id", question.ID); err != nil {
		return err
	}
	if err := validateTrimmedText("approval question header", question.Header); err != nil {
		return err
	}
	if err := validateTrimmedText("approval question", question.Question); err != nil {
		return err
	}
	if question.Options == nil {
		return fmt.Errorf("approval question options must be an array, not null")
	}
	seenOptions := map[string]bool{}
	for _, option := range question.Options {
		if err := validateTrimmedText("approval question option", option); err != nil {
			return err
		}
		if seenOptions[option] {
			return fmt.Errorf("approval question option %q is duplicated", option)
		}
		seenOptions[option] = true
	}
	return nil
}

func (request TrajectoryApprovalRequest) Validate() error {
	if err := validateApprovalRequestIdentity(request); err != nil {
		return err
	}
	if err := validateApprovalRequestCollections(request); err != nil {
		return err
	}
	if err := validateApprovalRequestOptionalFields(request); err != nil {
		return err
	}
	if err := validateApprovalRequestKind(request); err != nil {
		return err
	}
	_, err := validateTimestamp("approval requestedAt", request.RequestedAt)
	return err
}

func validateApprovalRequestIdentity(request TrajectoryApprovalRequest) error {
	if err := validateIdentifier("approval id", request.ID); err != nil {
		return err
	}
	if err := validateIdentifier("approval provider item id", request.ProviderItemID); err != nil {
		return err
	}
	if err := validateTrimmedText("approval title", request.Title); err != nil {
		return err
	}
	if err := validateTrimmedText("approval body", request.Body); err != nil {
		return err
	}
	return nil
}

func validateApprovalRequestCollections(request TrajectoryApprovalRequest) error {
	if request.FilePaths == nil || request.Questions == nil {
		return fmt.Errorf("approval filePaths and questions must be arrays, not null")
	}
	for _, path := range request.FilePaths {
		if err := validateTrimmedText("approval file path", path); err != nil {
			return err
		}
	}
	for index, question := range request.Questions {
		if err := question.Validate(); err != nil {
			return fmt.Errorf("approval question %d: %w", index, err)
		}
	}
	return nil
}

func validateApprovalRequestOptionalFields(request TrajectoryApprovalRequest) error {
	for _, field := range []struct {
		label string
		value *string
	}{
		{label: "approval command", value: request.Command},
		{label: "approval cwd", value: request.CWD},
		{label: "approval requested permission profile", value: request.RequestedPermissionProfile},
	} {
		if field.value != nil {
			if err := validateTrimmedText(field.label, *field.value); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateApprovalRequestKind(request TrajectoryApprovalRequest) error {
	switch request.Kind {
	case TrajectoryApprovalKindCommand:
		if request.Command == nil || request.CWD == nil {
			return fmt.Errorf("command approval requires command and cwd")
		}
	case TrajectoryApprovalKindFileChange:
		if len(request.FilePaths) == 0 {
			return fmt.Errorf("file-change approval requires file paths")
		}
	case TrajectoryApprovalKindPermission:
		if request.RequestedPermissionProfile == nil {
			return fmt.Errorf("permission approval requires requested permission profile")
		}
	case TrajectoryApprovalKindStructuredInput, TrajectoryApprovalKindUserInput:
		if len(request.Questions) == 0 {
			return fmt.Errorf("%s approval requires questions", request.Kind)
		}
	case TrajectoryApprovalKindMCPElicitation:
	default:
		return fmt.Errorf("unsupported approval kind %q", request.Kind)
	}
	return nil
}

func (resolution TrajectoryApprovalResolution) Validate() error {
	if err := validateIdentifier("approval resolution id", resolution.ApprovalID); err != nil {
		return err
	}
	if resolution.Answers == nil {
		return fmt.Errorf("approval resolution answers must be an array, not null")
	}
	seen := map[string]bool{}
	for _, answer := range resolution.Answers {
		if err := answer.Validate(); err != nil {
			return err
		}
		if seen[answer.QuestionID] {
			return fmt.Errorf("approval answer %s is duplicated", answer.QuestionID)
		}
		seen[answer.QuestionID] = true
	}
	if err := validateApprovalResolutionDecision(resolution); err != nil {
		return err
	}
	_, err := validateTimestamp("approval resolvedAt", resolution.ResolvedAt)
	return err
}

func validateApprovalResolutionDecision(resolution TrajectoryApprovalResolution) error {
	switch resolution.Decision {
	case TrajectoryApprovalDecisionApproved,
		TrajectoryApprovalDecisionApprovedForSession,
		TrajectoryApprovalDecisionDenied,
		TrajectoryApprovalDecisionCancelled:
		return validateApprovalResolutionWithoutAnswer(resolution)
	case TrajectoryApprovalDecisionAnswered:
		return validateAnsweredApprovalResolution(resolution)
	default:
		return fmt.Errorf("unsupported approval decision %q", resolution.Decision)
	}
}

func validateApprovalResolutionWithoutAnswer(resolution TrajectoryApprovalResolution) error {
	if len(resolution.Answers) != 0 {
		return fmt.Errorf("approval decision %s must not include structured answers", resolution.Decision)
	}
	if resolution.Response != "" {
		return fmt.Errorf("approval decision %s must not include a response", resolution.Decision)
	}
	if resolution.SecretsRedacted {
		return fmt.Errorf("approval decision %s cannot report redacted secrets", resolution.Decision)
	}
	return nil
}

func validateAnsweredApprovalResolution(resolution TrajectoryApprovalResolution) error {
	if len(resolution.Answers) == 0 && strings.TrimSpace(resolution.Response) == "" && !resolution.SecretsRedacted {
		return fmt.Errorf("answered approval requires answers or response")
	}
	if resolution.Response != "" && strings.TrimSpace(resolution.Response) != resolution.Response {
		return fmt.Errorf("approval response must not have surrounding whitespace")
	}
	return nil
}

func (subagent Subagent) Validate() error {
	if err := validateIdentifier("subagent id", subagent.ID); err != nil {
		return err
	}
	if err := validateIdentifier("subagent provider thread id", subagent.ProviderThreadID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("subagent model id", subagent.ModelID); err != nil {
		return err
	}
	if subagent.ReasoningEffort != nil && strings.TrimSpace(string(*subagent.ReasoningEffort)) == "" {
		return fmt.Errorf("subagent reasoning effort must not be empty")
	}
	if subagent.Message != nil {
		if err := validateTrimmedText("subagent message", *subagent.Message); err != nil {
			return err
		}
	}
	switch subagent.Status {
	case SubagentStatusPendingInit,
		SubagentStatusRunning,
		SubagentStatusInterrupted,
		SubagentStatusCompleted,
		SubagentStatusErrored,
		SubagentStatusShutdown,
		SubagentStatusNotFound:
		return nil
	default:
		return fmt.Errorf("unsupported subagent status %q", subagent.Status)
	}
}

func (liveness AgentLiveness) Validate() error {
	switch liveness.Status {
	case AgentLivenessAttached, AgentLivenessReconciling, AgentLivenessLost, AgentLivenessTerminal:
	default:
		return fmt.Errorf("unsupported agent liveness status %q", liveness.Status)
	}
	if !validAgentLivenessReason(liveness.Reason) {
		return fmt.Errorf("unsupported agent liveness reason %q", liveness.Reason)
	}
	if liveness.LastProviderEventAt != nil {
		if _, err := validateTimestampPointer("liveness lastProviderEventAt", liveness.LastProviderEventAt); err != nil {
			return err
		}
	}
	if liveness.LastReconciledAt != nil {
		if _, err := validateTimestampPointer("liveness lastReconciledAt", liveness.LastReconciledAt); err != nil {
			return err
		}
	}
	if liveness.Status == AgentLivenessLost && strings.TrimSpace(liveness.Message) == "" {
		return fmt.Errorf("lost agent liveness requires message")
	}
	return nil
}

func (lifecycle ProviderLifecycle) Validate() error {
	if lifecycle.Provider != ProviderCodex {
		return fmt.Errorf("unsupported provider lifecycle provider %q", lifecycle.Provider)
	}
	switch lifecycle.Status {
	case ProviderLifecycleStarting,
		ProviderLifecycleReady,
		ProviderLifecycleRestarting,
		ProviderLifecycleUnavailable,
		ProviderLifecycleClosed:
	default:
		return fmt.Errorf("unsupported provider lifecycle status %q", lifecycle.Status)
	}
	if lifecycle.Status == ProviderLifecycleUnavailable && strings.TrimSpace(lifecycle.Message) == "" {
		return fmt.Errorf("unavailable provider lifecycle requires message")
	}
	return nil
}

func trajectoryKindRequiresTurn(kind TrajectoryEventKind) bool {
	switch kind {
	case TrajectoryEventProviderLifecycleChanged:
		return false
	case TrajectoryEventUserInputAccepted,
		TrajectoryEventTurnQueued,
		TrajectoryEventTurnPromoted,
		TrajectoryEventTurnStarted,
		TrajectoryEventTurnSteered,
		TrajectoryEventTurnInterrupted,
		TrajectoryEventTurnCompleted,
		TrajectoryEventTurnFailed,
		TrajectoryEventAgentPublicTextDelta,
		TrajectoryEventAgentMessageCompleted,
		TrajectoryEventPublicReasoningSummaryUpdated,
		TrajectoryEventPlanChanged,
		TrajectoryEventActivityStarted,
		TrajectoryEventActivityProgressed,
		TrajectoryEventActivityCompleted,
		TrajectoryEventActivityFailed,
		TrajectoryEventFileChangeProposed,
		TrajectoryEventFileChangeCompleted,
		TrajectoryEventApprovalRequested,
		TrajectoryEventApprovalResolved,
		TrajectoryEventSubagentStarted,
		TrajectoryEventSubagentUpdated,
		TrajectoryEventSubagentCompleted,
		TrajectoryEventArtifactEmitted,
		TrajectoryEventAgentLivenessChanged,
		TrajectoryEventModelRerouted:
		return true
	default:
		return false
	}
}

func validTrajectoryActor(actor TrajectoryActor) bool {
	switch actor {
	case TrajectoryActorUser, TrajectoryActorAgent, TrajectoryActorProvider, TrajectoryActorSystem, TrajectoryActorMaster:
		return true
	default:
		return false
	}
}

func validTurnInterruptionReason(reason TurnInterruptionReason) bool {
	switch reason {
	case TurnInterruptionUserRequested,
		TurnInterruptionProviderInterrupted,
		TurnInterruptionRuntimeShutdown,
		TurnInterruptionReconciliation:
		return true
	default:
		return false
	}
}

func validAgentLivenessReason(reason AgentLivenessReason) bool {
	switch reason {
	case AgentLivenessReasonProviderRefPending,
		AgentLivenessReasonProviderTurnLinked,
		AgentLivenessReasonProviderInactive,
		AgentLivenessReasonAttachmentMissing,
		AgentLivenessReasonTurnTerminal,
		AgentLivenessReasonWakeRecheck,
		AgentLivenessReasonSnapshotLoad,
		AgentLivenessReasonStreamResync,
		AgentLivenessReasonUserRetry,
		AgentLivenessReasonProviderRestarted,
		AgentLivenessReasonProviderUnavailable,
		AgentLivenessReasonTurnNotFound:
		return true
	default:
		return false
	}
}

func subagentStatusTerminal(status SubagentStatus) bool {
	switch status {
	case SubagentStatusInterrupted,
		SubagentStatusCompleted,
		SubagentStatusErrored,
		SubagentStatusShutdown,
		SubagentStatusNotFound:
		return true
	default:
		return false
	}
}
