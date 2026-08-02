package evalharness

import (
	"errors"
	"fmt"
	"sort"

	"setta/internal/conversation"
	"setta/internal/director"
	evalverifier "setta/internal/evalharness/verifier"
)

type ScenarioControlResult struct {
	EvidenceAvailable bool                             `json:"evidenceAvailable"`
	Passed            bool                             `json:"passed"`
	Clarification     *ScenarioClarificationResult     `json:"clarification"`
	Assertions        []ScenarioControlAssertionResult `json:"assertions"`
	Diagnostic        *ScenarioDiagnostic              `json:"diagnostic"`
}

type ScenarioClarificationResult struct {
	Policy                 ScenarioClarificationPolicy `json:"policy"`
	Passed                 bool                        `json:"passed"`
	ScriptedReplyCount     int                         `json:"scriptedReplyCount"`
	EvidenceEventSequences []int                       `json:"evidenceEventSequences"`
}

type ScenarioControlAssertionResult struct {
	Assertion              ScenarioControlAssertion `json:"assertion"`
	Passed                 bool                     `json:"passed"`
	EvidenceEventSequences []int                    `json:"evidenceEventSequences"`
	VerifierCheckIDs       []string                 `json:"verifierCheckIds"`
}

func buildScenarioControlResult(
	scenario Scenario,
	outcome ScenarioExecutionOutcome,
	events []EvaluationEvent,
	verification *evalverifier.Result,
	diagnostic *ScenarioDiagnostic,
) (ScenarioControlResult, error) {
	if err := scenario.Validate(); err != nil {
		return ScenarioControlResult{}, fmt.Errorf("validate control scenario: %w", err)
	}
	if outcome != ScenarioExecutionCompleted {
		return unavailableScenarioControlResult(diagnostic)
	}
	if err := validateCompletedControlVerification(scenario, verification); err != nil {
		return ScenarioControlResult{}, err
	}
	index, err := newControlEvidenceIndex(scenario, events)
	if err != nil {
		return ScenarioControlResult{}, err
	}
	clarification, err := index.clarificationResult(scenario)
	if err != nil {
		return ScenarioControlResult{}, err
	}
	assertions, assertionsPassed, err := buildControlAssertionResults(index, scenario, verification)
	if err != nil {
		return ScenarioControlResult{}, err
	}
	result := ScenarioControlResult{
		EvidenceAvailable: true,
		Passed:            clarification.Passed && assertionsPassed,
		Clarification:     &clarification,
		Assertions:        assertions,
	}
	if err := result.Validate(); err != nil {
		return ScenarioControlResult{}, err
	}
	return result, nil
}

func validateCompletedControlVerification(
	scenario Scenario,
	verification *evalverifier.Result,
) error {
	if verification == nil {
		return errors.New("completed control result requires hidden verifier evidence")
	}
	if err := verification.Validate(); err != nil {
		return fmt.Errorf("validate control verifier evidence: %w", err)
	}
	if verification.Verifier != scenario.Verifier {
		return fmt.Errorf(
			"control verifier %s does not match scenario verifier %s",
			verification.Verifier,
			scenario.Verifier,
		)
	}
	return nil
}

func buildControlAssertionResults(
	index controlEvidenceIndex,
	scenario Scenario,
	verification *evalverifier.Result,
) ([]ScenarioControlAssertionResult, bool, error) {
	results := make([]ScenarioControlAssertionResult, 0, len(scenario.Expect.ControlAssertions))
	passed := true
	for _, assertion := range scenario.Expect.ControlAssertions {
		result, err := index.assertionResult(scenario, assertion, verification)
		if err != nil {
			return nil, false, err
		}
		results = append(results, result)
		passed = passed && result.Passed
	}
	return results, passed, nil
}

func unavailableScenarioControlResult(
	diagnostic *ScenarioDiagnostic,
) (ScenarioControlResult, error) {
	if diagnostic == nil {
		var err error
		diagnostic, err = NewScenarioDiagnostic(
			"control_evidence_unavailable",
			"The scenario ended before complete typed user-control evidence was collected.",
		)
		if err != nil {
			return ScenarioControlResult{}, err
		}
	}
	result := ScenarioControlResult{
		EvidenceAvailable: false,
		Passed:            false,
		Assertions:        []ScenarioControlAssertionResult{},
		Diagnostic:        cloneScenarioDiagnostic(diagnostic),
	}
	if err := result.Validate(); err != nil {
		return ScenarioControlResult{}, err
	}
	return result, nil
}

func (result ScenarioControlResult) Validate() error {
	if result.Assertions == nil {
		return errors.New("control assertions must be an array, not null")
	}
	if !result.EvidenceAvailable {
		return validateUnavailableScenarioControlResult(result)
	}
	return validateAvailableScenarioControlResult(result)
}

func validateUnavailableScenarioControlResult(result ScenarioControlResult) error {
	if result.Passed || result.Clarification != nil || len(result.Assertions) != 0 || result.Diagnostic == nil {
		return errors.New("unavailable control evidence requires only a diagnostic")
	}
	return result.Diagnostic.Validate()
}

func validateAvailableScenarioControlResult(result ScenarioControlResult) error {
	if result.Clarification == nil || result.Diagnostic != nil {
		return errors.New("available control evidence requires clarification evidence and no diagnostic")
	}
	if err := result.Clarification.Validate(); err != nil {
		return fmt.Errorf("control clarification: %w", err)
	}
	assertionsPassed, err := validateScenarioControlAssertions(result.Assertions)
	if err != nil {
		return err
	}
	if result.Passed != (result.Clarification.Passed && assertionsPassed) {
		return errors.New("control pass does not match clarification and assertion results")
	}
	return nil
}

func validateScenarioControlAssertions(
	assertions []ScenarioControlAssertionResult,
) (bool, error) {
	seen := map[ScenarioControlAssertion]bool{}
	passed := true
	for index, assertion := range assertions {
		if err := assertion.Validate(); err != nil {
			return false, fmt.Errorf("control assertion[%d]: %w", index, err)
		}
		if seen[assertion.Assertion] {
			return false, fmt.Errorf("control assertions repeat %s", assertion.Assertion)
		}
		seen[assertion.Assertion] = true
		passed = passed && assertion.Passed
	}
	return passed, nil
}

func (result ScenarioClarificationResult) Validate() error {
	if result.Policy != ScenarioClarificationForbidden &&
		result.Policy != ScenarioClarificationRequiredOnce {
		return fmt.Errorf("unsupported clarification policy %q", result.Policy)
	}
	wantReplies := 0
	if result.Policy == ScenarioClarificationRequiredOnce {
		wantReplies = 1
	}
	if result.ScriptedReplyCount != wantReplies {
		return fmt.Errorf("clarification scripted reply count is %d, want %d", result.ScriptedReplyCount, wantReplies)
	}
	if len(result.EvidenceEventSequences) == 0 {
		return errors.New("clarification result requires typed event evidence")
	}
	return validateControlEvidenceSequences(result.EvidenceEventSequences)
}

func (result ScenarioControlAssertionResult) Validate() error {
	if !supportedScenarioControlAssertion(result.Assertion) {
		return fmt.Errorf("unsupported control assertion %q", result.Assertion)
	}
	if result.EvidenceEventSequences == nil || result.VerifierCheckIDs == nil {
		return errors.New("control assertion evidence references must be arrays")
	}
	if err := validateControlEvidenceSequences(result.EvidenceEventSequences); err != nil {
		return err
	}
	if len(result.EvidenceEventSequences) == 0 && len(result.VerifierCheckIDs) == 0 {
		return errors.New("control assertion requires event or verifier evidence")
	}
	seen := map[string]bool{}
	for _, checkID := range result.VerifierCheckIDs {
		if err := validateResultIdentifier("control verifier check id", checkID); err != nil {
			return err
		}
		if seen[checkID] {
			return fmt.Errorf("control verifier check id %s is repeated", checkID)
		}
		seen[checkID] = true
	}
	return nil
}

func validateControlEvidenceSequences(sequences []int) error {
	if sequences == nil {
		return errors.New("control evidence event sequences must be an array")
	}
	previous := 0
	for _, sequence := range sequences {
		if sequence <= previous {
			return errors.New("control evidence event sequences must be positive, unique, and sorted")
		}
		previous = sequence
	}
	return nil
}

type controlEvidenceIndex struct {
	submissions     map[int]EvaluationEvent
	receipts        map[int]EvaluationEvent
	triggers        map[ScenarioTrigger]EvaluationEvent
	trajectories    []EvaluationEvent
	workspaceEvents []EvaluationEvent
	finalState      EvaluationEvent
}

func newControlEvidenceIndex(
	scenario Scenario,
	events []EvaluationEvent,
) (controlEvidenceIndex, error) {
	index := controlEvidenceIndex{
		submissions:     map[int]EvaluationEvent{},
		receipts:        map[int]EvaluationEvent{},
		triggers:        map[ScenarioTrigger]EvaluationEvent{},
		trajectories:    make([]EvaluationEvent, 0),
		workspaceEvents: make([]EvaluationEvent, 0),
	}
	for _, event := range events {
		if event.ScenarioID == scenario.ID {
			if err := index.add(event); err != nil {
				return controlEvidenceIndex{}, err
			}
		}
	}
	if err := index.validateCoverage(scenario); err != nil {
		return controlEvidenceIndex{}, err
	}
	if err := index.validateTimeline(scenario); err != nil {
		return controlEvidenceIndex{}, err
	}
	if err := index.validateWorkspaceTimeline(); err != nil {
		return controlEvidenceIndex{}, err
	}
	return index, nil
}

func (index *controlEvidenceIndex) add(event EvaluationEvent) error {
	switch event.Kind {
	case EvaluationEventUserSubmission:
		stepIndex := event.UserSubmission.StepIndex
		if _, exists := index.submissions[stepIndex]; exists {
			return fmt.Errorf("control evidence repeats submission step %d", stepIndex)
		}
		index.submissions[stepIndex] = event
		index.workspaceEvents = append(index.workspaceEvents, event)
	case EvaluationEventDirectorReceipt:
		stepIndex := event.DirectorReceipt.StepIndex
		if _, exists := index.receipts[stepIndex]; exists {
			return fmt.Errorf("control evidence repeats receipt step %d", stepIndex)
		}
		index.receipts[stepIndex] = event
	case EvaluationEventTriggerObserved:
		trigger := event.TriggerObserved.Trigger
		if _, exists := index.triggers[trigger]; exists {
			return fmt.Errorf("control evidence repeats trigger %s", trigger)
		}
		index.triggers[trigger] = event
		index.workspaceEvents = append(index.workspaceEvents, event)
	case EvaluationEventTrajectory:
		index.trajectories = append(index.trajectories, event)
		index.workspaceEvents = append(index.workspaceEvents, event)
	case EvaluationEventConversationState:
		if index.finalState.Sequence != 0 {
			return errors.New("control evidence contains multiple final conversation states")
		}
		index.finalState = event
		index.workspaceEvents = append(index.workspaceEvents, event)
	}
	return nil
}

func (index controlEvidenceIndex) validateCoverage(scenario Scenario) error {
	if index.finalState.Sequence == 0 || len(index.submissions) != len(scenario.Steps) ||
		len(index.receipts) != len(scenario.Steps) || len(index.triggers) != len(scenario.Steps)-1 {
		return errors.New("completed control evidence omitted a scripted step, receipt, trigger, or final state")
	}
	return nil
}

func (index controlEvidenceIndex) validateTimeline(scenario Scenario) error {
	for stepIndex, step := range scenario.Steps {
		if err := index.validateStepTimeline(stepIndex, step); err != nil {
			return err
		}
	}
	return nil
}

func (index controlEvidenceIndex) validateWorkspaceTimeline() error {
	events := append([]EvaluationEvent{}, index.workspaceEvents...)
	sort.Slice(events, func(left int, right int) bool {
		return events[left].Sequence < events[right].Sequence
	})
	previousRevision := -1
	previousDigest := ""
	for _, event := range events {
		workspace, err := controlEventWorkspace(event)
		if err != nil {
			return err
		}
		if err := workspace.Validate(); err != nil {
			return fmt.Errorf("control workspace evidence event %d: %w", event.Sequence, err)
		}
		if workspace.Revision < previousRevision {
			return fmt.Errorf("control workspace revision regressed at event %d", event.Sequence)
		}
		if workspace.Revision == previousRevision && workspace.Digest != previousDigest {
			return fmt.Errorf("control workspace digest changed without a revision at event %d", event.Sequence)
		}
		previousRevision = workspace.Revision
		previousDigest = workspace.Digest
	}
	return nil
}

func controlEventWorkspace(event EvaluationEvent) (EvaluationWorkspaceObservation, error) {
	switch event.Kind {
	case EvaluationEventUserSubmission:
		return event.UserSubmission.Workspace, nil
	case EvaluationEventTriggerObserved:
		return event.TriggerObserved.Workspace, nil
	case EvaluationEventTrajectory:
		if event.TrajectoryWorkspace == nil {
			return EvaluationWorkspaceObservation{}, fmt.Errorf(
				"control trajectory event %d omitted workspace evidence",
				event.Sequence,
			)
		}
		return *event.TrajectoryWorkspace, nil
	case EvaluationEventConversationState:
		return event.ConversationState.Workspace, nil
	default:
		return EvaluationWorkspaceObservation{}, fmt.Errorf(
			"control event %d cannot carry workspace evidence",
			event.Sequence,
		)
	}
}

func (index controlEvidenceIndex) validateStepTimeline(stepIndex int, step ScenarioStep) error {
	submission := index.submissions[stepIndex]
	receipt := index.receipts[stepIndex]
	if submission.UserSubmission.Text != step.Text || receipt.DirectorReceipt.StepIndex != stepIndex {
		return fmt.Errorf("control evidence step %d does not match the scenario", stepIndex)
	}
	if stepIndex == 0 {
		if submission.UserSubmission.Trigger != nil {
			return errors.New("initial control evidence submission unexpectedly has a trigger")
		}
		if submission.Sequence >= receipt.Sequence {
			return errors.New("initial control evidence receipt precedes its submission")
		}
		return nil
	}
	trigger := index.triggers[step.Trigger]
	if submission.UserSubmission.Trigger == nil || *submission.UserSubmission.Trigger != step.Trigger ||
		trigger.TriggerObserved.StepIndex != stepIndex || trigger.Sequence >= submission.Sequence ||
		submission.Sequence >= receipt.Sequence {
		return fmt.Errorf("control evidence step %d trigger timeline does not match the scenario", stepIndex)
	}
	return nil
}

func (index controlEvidenceIndex) clarificationResult(
	scenario Scenario,
) (ScenarioClarificationResult, error) {
	sequences := []int{
		index.submissions[0].Sequence,
		index.receipts[0].Sequence,
		index.finalState.Sequence,
	}
	replyCount := 0
	passed := true
	workstreamID := index.finalState.ConversationState.WorkstreamID
	if scenario.Expect.Clarification == ScenarioClarificationRequiredOnce {
		trigger, found := index.triggers[ScenarioTriggerAgentUserInputRequested]
		if !found {
			passed = false
		} else {
			sequences = append(sequences, trigger.Sequence)
		}
		sequences = append(sequences, index.submissions[1].Sequence, index.receipts[1].Sequence)
		replyCount = 1
		if !receiptHasExpectedControlAction(
			ScenarioTriggerAgentUserInputRequested,
			index.receipts[1].DirectorReceipt.Receipt,
			workstreamID,
		) || triggerWorkstreamDiffers(trigger, workstreamID) {
			passed = false
		}
		if len(index.finalState.ConversationState.Turns) != 1 ||
			len(index.finalState.ConversationState.QueueTurnIDs) != 0 {
			passed = false
		}
	} else if _, found := index.triggers[ScenarioTriggerAgentUserInputRequested]; found {
		passed = false
	} else if !receiptStartedWork(
		index.receipts[0].DirectorReceipt.Receipt,
		workstreamID,
	) {
		passed = false
	}
	if countConversationStateTurnsByDelivery(index.finalState, conversation.TurnDeliveryNormal) != 1 {
		passed = false
	}
	return ScenarioClarificationResult{
		Policy:                 scenario.Expect.Clarification,
		Passed:                 passed,
		ScriptedReplyCount:     replyCount,
		EvidenceEventSequences: sortedControlSequences(sequences...),
	}, nil
}

func (index controlEvidenceIndex) assertionResult(
	scenario Scenario,
	assertion ScenarioControlAssertion,
	verification *evalverifier.Result,
) (ScenarioControlAssertionResult, error) {
	switch assertion {
	case ScenarioControlNoMutationBeforeReply:
		return index.noMutationBeforeReply(), nil
	case ScenarioControlInvestigationBeforeReply:
		return index.investigationBeforeReply(), nil
	case ScenarioControlScriptedReplyConsumed:
		return index.scriptedReplyConsumed(), nil
	case ScenarioControlFollowUpThroughDirector:
		return index.followUpThroughDirector(scenario), nil
	case ScenarioControlLatestInstructionWins:
		return index.latestInstructionWins(verification), nil
	case ScenarioControlObservedRunCancelled:
		return index.observedRunCancelled(), nil
	case ScenarioControlNoMutationAfterCancel:
		return index.noMutationAfterCancel(), nil
	case ScenarioControlQueuedRequestPresentOnce:
		return index.queuedRequestPresentOnce(), nil
	case ScenarioControlQueuedRequestPromoted:
		return index.queuedRequestTransition(assertion, conversation.TrajectoryEventTurnPromoted), nil
	case ScenarioControlQueuedRequestCompleted:
		return index.queuedRequestCompleted(), nil
	case ScenarioControlQueueEmpty:
		return index.queueEmpty(), nil
	default:
		return ScenarioControlAssertionResult{}, fmt.Errorf("unsupported control assertion %s", assertion)
	}
}

func (index controlEvidenceIndex) noMutationBeforeReply() ScenarioControlAssertionResult {
	submission := index.submissions[1]
	trigger := index.triggers[ScenarioTriggerAgentUserInputRequested]
	baseline := index.submissions[0].UserSubmission.Workspace
	beforeReply := submission.UserSubmission.Workspace
	passed := trigger.Sequence != 0 &&
		beforeReply.Revision == baseline.Revision &&
		beforeReply.Digest == baseline.Digest
	return controlAssertionResult(
		ScenarioControlNoMutationBeforeReply,
		passed,
		[]int{index.submissions[0].Sequence, trigger.Sequence, submission.Sequence},
		nil,
	)
}

func (index controlEvidenceIndex) investigationBeforeReply() ScenarioControlAssertionResult {
	trigger := index.triggers[ScenarioTriggerAgentUserInputRequested]
	turnID := ""
	if trigger.TriggerObserved.ObservedTurnID != nil {
		turnID = *trigger.TriggerObserved.ObservedTurnID
	}
	investigation := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return trajectoryTargets(event, turnID) &&
			event.Kind == conversation.TrajectoryEventActivityCompleted &&
			event.ActivityCompleted != nil &&
			isInvestigationActivity(event.ActivityCompleted.Activity.Kind)
	})
	beforeReply := make([]EvaluationEvent, 0, len(investigation))
	for _, event := range investigation {
		if event.Sequence < trigger.Sequence {
			beforeReply = append(beforeReply, event)
		}
	}
	sequences := []int{trigger.Sequence}
	sequences = append(sequences, controlEventSequences(beforeReply)...)
	return controlAssertionResult(
		ScenarioControlInvestigationBeforeReply,
		len(beforeReply) > 0,
		sequences,
		nil,
	)
}

func isInvestigationActivity(kind conversation.TrajectoryActivityKind) bool {
	switch kind {
	case conversation.TrajectoryActivityCommand,
		conversation.TrajectoryActivityMCPTool,
		conversation.TrajectoryActivityDynamicTool,
		conversation.TrajectoryActivityWebSearch,
		conversation.TrajectoryActivityImageView,
		conversation.TrajectoryActivitySubagent:
		return true
	default:
		return false
	}
}

func (index controlEvidenceIndex) scriptedReplyConsumed() ScenarioControlAssertionResult {
	trigger := index.triggers[ScenarioTriggerAgentUserInputRequested]
	approvalID := ""
	if trigger.TriggerObserved.ObservedApprovalID != nil {
		approvalID = *trigger.TriggerObserved.ObservedApprovalID
	}
	requested := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return approvalID != "" && event.Kind == conversation.TrajectoryEventApprovalRequested &&
			event.ApprovalRequested != nil && event.ApprovalRequested.Approval.ID == approvalID
	})
	resolved := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return approvalID != "" && event.Kind == conversation.TrajectoryEventApprovalResolved &&
			event.ApprovalResolved != nil &&
			event.ApprovalResolved.Resolution.ApprovalID == approvalID
	})
	passed := len(requested) == 1 && len(resolved) == 1 &&
		requested[0].Sequence < index.submissions[1].Sequence &&
		index.submissions[1].Sequence < resolved[0].Sequence &&
		resolved[0].Trajectory.ApprovalResolved.Resolution.Decision ==
			conversation.TrajectoryApprovalDecisionAnswered &&
		len(resolved[0].Trajectory.ApprovalResolved.Resolution.Answers) > 0
	sequences := []int{index.submissions[1].Sequence, index.finalState.Sequence}
	sequences = append(sequences, controlEventSequences(requested)...)
	sequences = append(sequences, controlEventSequences(resolved)...)
	return controlAssertionResult(
		ScenarioControlScriptedReplyConsumed,
		passed,
		sequences,
		nil,
	)
}

func (index controlEvidenceIndex) followUpThroughDirector(
	scenario Scenario,
) ScenarioControlAssertionResult {
	passed := true
	sequences := make([]int, 0, (len(scenario.Steps)-1)*2)
	for stepIndex := 1; stepIndex < len(scenario.Steps); stepIndex++ {
		submission := index.submissions[stepIndex]
		receipt := index.receipts[stepIndex]
		sequences = append(sequences, submission.Sequence, receipt.Sequence)
		if !receiptHasExpectedControlAction(
			scenario.Steps[stepIndex].Trigger,
			receipt.DirectorReceipt.Receipt,
			index.finalState.ConversationState.WorkstreamID,
		) {
			passed = false
		}
	}
	return controlAssertionResult(
		ScenarioControlFollowUpThroughDirector,
		passed,
		sequences,
		nil,
	)
}

func (index controlEvidenceIndex) latestInstructionWins(
	verification *evalverifier.Result,
) ScenarioControlAssertionResult {
	checkIDs := []string{"related_changes_only", "status_route", "health_absent"}
	return controlAssertionResult(
		ScenarioControlLatestInstructionWins,
		verifierChecksPassed(verification, checkIDs),
		[]int{index.finalState.Sequence},
		checkIDs,
	)
}

func (index controlEvidenceIndex) observedRunCancelled() ScenarioControlAssertionResult {
	observedID, _, triggerSequence := index.queueControlTurnIDs()
	interruptions := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return trajectoryTargets(event, observedID) &&
			event.Kind == conversation.TrajectoryEventTurnInterrupted &&
			event.TurnInterrupted != nil &&
			event.TurnInterrupted.Reason == conversation.TurnInterruptionUserRequested
	})
	turn, found := conversationStateTurn(index.finalState, observedID)
	passed := found && turn.Status == conversation.TurnStatusCancelled && len(interruptions) > 0
	sequences := []int{triggerSequence, index.finalState.Sequence}
	sequences = append(sequences, controlEventSequences(interruptions)...)
	return controlAssertionResult(ScenarioControlObservedRunCancelled, passed, sequences, nil)
}

func (index controlEvidenceIndex) noMutationAfterCancel() ScenarioControlAssertionResult {
	observedID, queuedID, triggerSequence := index.queueControlTurnIDs()
	cancellation := index.submissionForTrigger(ScenarioTriggerQueueNonempty)
	interruptions := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return trajectoryTargets(event, observedID) &&
			event.Kind == conversation.TrajectoryEventTurnInterrupted &&
			event.TurnInterrupted != nil &&
			event.TurnInterrupted.Reason == conversation.TurnInterruptionUserRequested
	})
	promotions := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return trajectoryTargets(event, queuedID) &&
			event.Kind == conversation.TrajectoryEventTurnPromoted
	})
	// The observed interruption starts the interval in which the cancelled run
	// no longer has workspace authority. Promotion is the last boundary before
	// the queued successor may legitimately write.
	passed := cancellation.Sequence > 0 && len(interruptions) > 0 && len(promotions) == 1
	firstInterruption := 0
	endBoundary := EvaluationEvent{}
	if passed {
		firstInterruption = interruptions[0].Sequence
		endBoundary = promotions[0]
		passed = firstInterruption > cancellation.Sequence &&
			endBoundary.Sequence > firstInterruption &&
			workspaceObservationsEqual(
				*interruptions[0].TrajectoryWorkspace,
				*endBoundary.TrajectoryWorkspace,
			)
	}
	sequences := []int{
		triggerSequence,
		cancellation.Sequence,
		firstInterruption,
		endBoundary.Sequence,
		index.finalState.Sequence,
	}
	sequences = append(sequences, controlEventSequences(interruptions)...)
	sequences = append(sequences, controlEventSequences(promotions)...)
	return controlAssertionResult(
		ScenarioControlNoMutationAfterCancel,
		passed,
		sequences,
		nil,
	)
}

func workspaceObservationsEqual(
	left EvaluationWorkspaceObservation,
	right EvaluationWorkspaceObservation,
) bool {
	return left.Revision == right.Revision && left.Digest == right.Digest
}

func (index controlEvidenceIndex) queuedRequestPresentOnce() ScenarioControlAssertionResult {
	_, queuedID, triggerSequence := index.queueControlTurnIDs()
	queuedEvents := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return trajectoryTargets(event, queuedID) && event.Kind == conversation.TrajectoryEventTurnQueued
	})
	turn, found := conversationStateTurn(index.finalState, queuedID)
	accepted := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return found && trajectoryTargets(event, queuedID) &&
			event.Kind == conversation.TrajectoryEventUserInputAccepted &&
			event.UserInputAccepted != nil &&
			event.UserInputAccepted.Delivery == conversation.TurnDeliveryQueued &&
			event.UserInputAccepted.Input == turn.AuthoredInput
	})
	passed := found && turn.Delivery == conversation.TurnDeliveryQueued &&
		len(queuedEvents) == 1 && len(accepted) == 1
	sequences := []int{triggerSequence, index.finalState.Sequence}
	sequences = append(sequences, controlEventSequences(queuedEvents)...)
	sequences = append(sequences, controlEventSequences(accepted)...)
	return controlAssertionResult(ScenarioControlQueuedRequestPresentOnce, passed, sequences, nil)
}

func (index controlEvidenceIndex) queuedRequestTransition(
	assertion ScenarioControlAssertion,
	kind conversation.TrajectoryEventKind,
) ScenarioControlAssertionResult {
	_, queuedID, triggerSequence := index.queueControlTurnIDs()
	matches := index.trajectoryMatches(func(event *conversation.TrajectoryEvent) bool {
		return trajectoryTargets(event, queuedID) && event.Kind == kind
	})
	sequences := []int{triggerSequence, index.finalState.Sequence}
	sequences = append(sequences, controlEventSequences(matches)...)
	return controlAssertionResult(assertion, len(matches) == 1, sequences, nil)
}

func (index controlEvidenceIndex) queuedRequestCompleted() ScenarioControlAssertionResult {
	result := index.queuedRequestTransition(
		ScenarioControlQueuedRequestCompleted,
		conversation.TrajectoryEventTurnCompleted,
	)
	_, queuedID, _ := index.queueControlTurnIDs()
	turn, found := conversationStateTurn(index.finalState, queuedID)
	result.Passed = result.Passed && found && turn.Status == conversation.TurnStatusCompleted
	return result
}

func (index controlEvidenceIndex) queueEmpty() ScenarioControlAssertionResult {
	return controlAssertionResult(
		ScenarioControlQueueEmpty,
		len(index.finalState.ConversationState.QueueTurnIDs) == 0,
		[]int{index.finalState.Sequence},
		nil,
	)
}

func (index controlEvidenceIndex) queueControlTurnIDs() (string, string, int) {
	trigger := index.triggers[ScenarioTriggerQueueNonempty]
	if trigger.Sequence == 0 || len(trigger.TriggerObserved.QueueTurnIDs) != 1 ||
		trigger.TriggerObserved.ObservedTurnID == nil {
		return "", "", trigger.Sequence
	}
	return *trigger.TriggerObserved.ObservedTurnID,
		trigger.TriggerObserved.QueueTurnIDs[0],
		trigger.Sequence
}

func (index controlEvidenceIndex) submissionForTrigger(trigger ScenarioTrigger) EvaluationEvent {
	for _, submission := range index.submissions {
		if submission.UserSubmission.Trigger != nil &&
			*submission.UserSubmission.Trigger == trigger {
			return submission
		}
	}
	return EvaluationEvent{}
}

func (index controlEvidenceIndex) trajectoryMatches(
	matches func(*conversation.TrajectoryEvent) bool,
) []EvaluationEvent {
	result := make([]EvaluationEvent, 0)
	for _, event := range index.trajectories {
		if matches(event.Trajectory) {
			result = append(result, event)
		}
	}
	return result
}

func controlAssertionResult(
	assertion ScenarioControlAssertion,
	passed bool,
	sequences []int,
	checkIDs []string,
) ScenarioControlAssertionResult {
	if checkIDs == nil {
		checkIDs = []string{}
	}
	return ScenarioControlAssertionResult{
		Assertion:              assertion,
		Passed:                 passed,
		EvidenceEventSequences: sortedControlSequences(sequences...),
		VerifierCheckIDs:       append([]string{}, checkIDs...),
	}
}

func sortedControlSequences(sequences ...int) []int {
	unique := map[int]bool{}
	for _, sequence := range sequences {
		if sequence > 0 {
			unique[sequence] = true
		}
	}
	result := make([]int, 0, len(unique))
	for sequence := range unique {
		result = append(result, sequence)
	}
	sort.Ints(result)
	return result
}

func controlEventSequences(events []EvaluationEvent) []int {
	sequences := make([]int, len(events))
	for index, event := range events {
		sequences[index] = event.Sequence
	}
	return sequences
}

func countConversationStateTurnsByDelivery(
	state EvaluationEvent,
	delivery conversation.TurnDelivery,
) int {
	count := 0
	for _, turn := range state.ConversationState.Turns {
		if turn.Delivery == delivery {
			count++
		}
	}
	return count
}

func conversationStateTurn(
	state EvaluationEvent,
	turnID string,
) (EvaluationConversationTurnState, bool) {
	for _, turn := range state.ConversationState.Turns {
		if turn.TurnID == turnID {
			return turn, true
		}
	}
	return EvaluationConversationTurnState{}, false
}

func trajectoryTargets(event *conversation.TrajectoryEvent, turnID string) bool {
	return turnID != "" && event.TurnID != nil && *event.TurnID == turnID
}

func receiptHasExpectedControlAction(
	trigger ScenarioTrigger,
	receipt director.DirectorReceipt,
	workstreamID string,
) bool {
	wantTool := map[ScenarioTrigger]string{
		ScenarioTriggerAgentUserInputRequested: "resolve_approval",
		ScenarioTriggerFirstWorkspaceMutation:  "steer_work",
		ScenarioTriggerAgentTurnRunning:        "submit_work",
		ScenarioTriggerQueueNonempty:           "cancel_run",
	}[trigger]
	matched := 0
	for _, call := range receipt.Submit.ToolCalls {
		if !call.Succeeded {
			continue
		}
		if trigger == ScenarioTriggerAgentUserInputRequested &&
			!directorClarificationToolAllowed(call.Tool) {
			return false
		}
		if call.WorkstreamID == nil {
			continue
		}
		if *call.WorkstreamID != workstreamID {
			return false
		}
		if call.Tool == wantTool {
			matched++
		}
	}
	return matched == 1
}

func directorClarificationToolAllowed(tool string) bool {
	switch tool {
	case "list_workspaces", "list_workstreams", "read_activity", "ask_conversation", "resolve_approval":
		return true
	default:
		return false
	}
}

func receiptStartedWork(receipt director.DirectorReceipt, workstreamID string) bool {
	matched := 0
	for _, call := range receipt.Submit.ToolCalls {
		if !call.Succeeded || call.WorkstreamID == nil {
			continue
		}
		if *call.WorkstreamID != workstreamID {
			return false
		}
		if call.Tool == "create_workstream" || call.Tool == "submit_work" {
			matched++
		}
	}
	return matched == 1
}

func triggerWorkstreamDiffers(event EvaluationEvent, workstreamID string) bool {
	return event.TriggerObserved.WorkstreamID != nil &&
		*event.TriggerObserved.WorkstreamID != workstreamID
}

func verifierChecksPassed(verification *evalverifier.Result, checkIDs []string) bool {
	checks := make(map[string]bool, len(verification.Checks))
	for _, check := range verification.Checks {
		checks[check.ID] = check.Passed
	}
	for _, checkID := range checkIDs {
		if !checks[checkID] {
			return false
		}
	}
	return true
}

func cloneScenarioControlResult(result ScenarioControlResult) ScenarioControlResult {
	cloned := result
	cloned.Diagnostic = cloneScenarioDiagnostic(result.Diagnostic)
	if result.Clarification != nil {
		clarification := *result.Clarification
		clarification.EvidenceEventSequences = append(
			[]int{},
			result.Clarification.EvidenceEventSequences...,
		)
		cloned.Clarification = &clarification
	}
	if result.Assertions != nil {
		cloned.Assertions = make([]ScenarioControlAssertionResult, len(result.Assertions))
		for index, assertion := range result.Assertions {
			cloned.Assertions[index] = assertion
			cloned.Assertions[index].EvidenceEventSequences = append(
				[]int{},
				assertion.EvidenceEventSequences...,
			)
			cloned.Assertions[index].VerifierCheckIDs = append(
				[]string{},
				assertion.VerifierCheckIDs...,
			)
		}
	}
	return cloned
}
